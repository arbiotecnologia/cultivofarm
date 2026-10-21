# C1B-SCOPE harness v2 — PostgreSQL local descartável, dados 100% sintéticos.
# Não equivale a JWT/RLS real; prova a lógica do contrato candidato.
from pathlib import Path
import os, subprocess, tempfile, json

HERE = Path(__file__).resolve().parent
root = Path(tempfile.mkdtemp(prefix='c1bscope-pg-', dir='/tmp')); root.chmod(0o777)
prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
base = ['psql', '-X', '-h', str(root), '-p', '55498', '-U', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1']
checks = []

def sql(s):
    r = subprocess.run(base, input=s, text=True, capture_output=True)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()

def check(name, s, want):
    actual = sql(s)
    assert actual == want, (name, actual, want)
    checks.append(name)

def uid(n): return f'00000000-0000-4000-8000-{n:012d}'

OWNER = uid(100)        # tenant fornecedor (commercial_owner)
OWNER_INATIVO = uid(101)
PARTNER = uid(200)      # partner_account
PARTNER_B = uid(201)    # outro parceiro (cross-parceiro)
PARTNER_C = uid(202)    # parceiro com owner inativo
ORG_PARTNER = uid(300)  # organização parceira (modelo A)
ORG_B = uid(301)        # outra organização sem parceiro

SCHEMA = f"""
CREATE SCHEMA platform_private;
CREATE TYPE public.app_role AS ENUM('administrador','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','superadmin');
CREATE TABLE profiles(user_id uuid, organization_id uuid, ativo boolean);
CREATE TABLE organizations(id uuid, partner_account_id uuid, ativo boolean, status text);
CREATE TABLE partner_accounts(id uuid, commercial_owner_organization_id uuid, ativo boolean, deleted_at timestamptz);
CREATE TABLE user_roles(user_id uuid, role app_role);
CREATE TABLE partner_users(user_id uuid, partner_id uuid, tenant_id uuid, papel text, valid_from timestamptz, revoked_at timestamptz);
CREATE FUNCTION public.has_role(u uuid, r app_role) RETURNS boolean LANGUAGE sql STABLE SET search_path TO public
 AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role=r)$$;
CREATE FUNCTION platform_private.entitlements_for_user(u uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE SET search_path TO public
 AS $$SELECT 'catalogo_precos'::text$$;
INSERT INTO organizations VALUES ('{OWNER}', NULL, true, 'ativa'), ('{OWNER_INATIVO}', NULL, false, 'ativa'),
  ('{ORG_PARTNER}', '{PARTNER}', true, 'ativa'), ('{ORG_B}', NULL, true, 'ativa');
INSERT INTO partner_accounts VALUES ('{PARTNER}', '{OWNER}', true, NULL), ('{PARTNER_B}', '{OWNER}', true, NULL),
  ('{PARTNER_C}', '{OWNER_INATIVO}', true, NULL);
"""

# Insere perfil+role+vínculo. Colunas partner_users: user, partner, tenant, papel, valid_from, revoked_at.
def mkuser(n, org, partner, tenant, papel='gestor', role='parceiro_b2b', valid_from='NULL', revoked='NULL', ativo='true'):
    sql(f"INSERT INTO profiles VALUES ('{uid(n)}', '{org}', {ativo});"
        f"INSERT INTO user_roles VALUES ('{uid(n)}', '{role}');"
        f"INSERT INTO partner_users VALUES ('{uid(n)}', '{partner}', '{tenant}', '{papel}', {valid_from}, {revoked});")

try:
    r = subprocess.run(prefix + ['initdb', '-D', str(root/'data'), '-A', 'trust', '-U', 'postgres'], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    r = subprocess.run(prefix + ['pg_ctl', '-D', str(root/'data'), '-l', str(root/'log'), '-o', f'-k {root} -p 55498 -h ""', 'start'], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    sql(SCHEMA)
    live = json.loads((HERE/'live-snapshot.json').read_text())
    # is_valid_b2b_partner_user primeiro: b2b_actor_scope depende dela.
    for row in sorted(live, key=lambda r: r['identity'].startswith('platform_private.')):
        sql(row['definition'])
        check('baseline md5 ' + row['identity'],
              f"SELECT md5(pg_get_functiondef('{row['identity']}'::regprocedure))", row['md5'])

    # Baseline live: padrão teste4 (org sem parceiro) => org_partner NULL (bloqueio estrutural)
    mkuser(1, OWNER, PARTNER, OWNER)
    check('baseline live nega teste4 (org_partner NULL)',
          f"SELECT coalesce(org_partner::text,'NULL') FROM platform_private.b2b_actor_scope('{uid(1)}')", 'NULL')

    sql((HERE/'candidate.sql.review').read_text())
    check('is_valid_b2b_partner_user intocada',
          "SELECT md5(pg_get_functiondef('is_valid_b2b_partner_user(uuid,uuid)'::regprocedure))",
          '93520101987e599280460d3dadcf3a9f')

    S = ("SELECT (CASE WHEN profile_ok THEN 't' ELSE 'f' END)||'|'||coalesce(org_partner::text,'NULL')||'|'||"
         "coalesce(user_partner::text,'NULL')||'|'||user_partner_count||'|'||(CASE WHEN partner_valid THEN 't' ELSE 'f' END) "
         "FROM platform_private.b2b_actor_scope('{}')")
    # 1) POSITIVO: padrão teste4 — vínculo autorizado com cadeia completa resolve o parceiro
    check('teste4 resolve pelo vinculo', S.format(uid(1)), f't|{PARTNER}|{PARTNER}|1|t')
    # 2) POSITIVO: modelo A (organização parceira) — org explícita prevalece sem exigir
    #    igualdade com fornecedor; vínculo no fornecedor mantém user_partner coerente.
    mkuser(2, ORG_PARTNER, PARTNER, OWNER)
    check('modelo A preservado', S.format(uid(2)), f't|{PARTNER}|NULL|1|t')
    # 3) NEGATIVO: vínculo revogado
    mkuser(3, OWNER, PARTNER, OWNER, revoked='now()')
    check('vinculo revogado nega', S.format(uid(3)), 't|NULL|NULL|0|f')
    # 4) NEGATIVO: dois vínculos ativos
    sql(f"INSERT INTO profiles VALUES ('{uid(4)}', '{OWNER}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(4)}', 'parceiro_b2b');"
        f"INSERT INTO partner_users VALUES ('{uid(4)}', '{PARTNER}', '{OWNER}', 'gestor', NULL, NULL), ('{uid(4)}', '{PARTNER_B}', '{OWNER}', 'gestor', NULL, NULL);")
    check('dois vinculos negam', S.format(uid(4)), 't|NULL|NULL|2|f')
    # 5) NEGATIVO: multipapel (count(user_roles)=1) — incompatibilidade registrada, não aberta
    sql(f"INSERT INTO profiles VALUES ('{uid(5)}', '{OWNER}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(5)}', 'parceiro_b2b'), ('{uid(5)}', 'parceiro_b2b_tecnico');"
        f"INSERT INTO partner_users VALUES ('{uid(5)}', '{PARTNER}', '{OWNER}', 'gestor', NULL, NULL);")
    check('multipapel nega (registrado p/ fase de contratos)', S.format(uid(5)), 't|NULL|NULL|1|f')
    # 6) NEGATIVO: parceiro inativo
    sql(f"INSERT INTO partner_accounts VALUES ('{uid(203)}', '{OWNER}', false, NULL);")
    mkuser(6, OWNER, uid(203), OWNER)
    check('parceiro inativo nega', S.format(uid(6)), 't|NULL|NULL|1|f')
    # 7) NEGATIVO: tenant do vínculo diferente do fornecedor
    mkuser(7, OWNER, PARTNER, ORG_B)
    check('tenant divergente do fornecedor nega', S.format(uid(7)), 't|NULL|NULL|1|f')
    # 8) NEGATIVO (mismatch org explícita): org parceira X + vínculo em Y sem cadeia
    #    (perfil não está no tenant do vínculo) => org prevalece, user_partner NULL, consumidor nega
    mkuser(8, ORG_PARTNER, PARTNER_B, OWNER)
    check('org explicita prevalece; vinculo sem cadeia nao resolve', S.format(uid(8)), f't|{PARTNER}|NULL|1|t')
    # 9) NEGATIVO: papel tecnico com role gestor (mismatch papel↔role)
    mkuser(9, OWNER, PARTNER, OWNER, papel='tecnico')
    check('papel/role divergentes negam', S.format(uid(9)), 't|NULL|NULL|1|f')
    # 10) NEGATIVO: perfil inativo — cadeia completa exige pf.ativo; profile_ok=f e sem resolução
    mkuser(10, OWNER, PARTNER, OWNER, ativo='false')
    check('perfil inativo nega resolucao', S.format(uid(10)), 'f|NULL|NULL|1|f')
    # 11) NEGATIVO (revisão 72c9b82): perfil movido para ORG_B com vínculo antigo no OWNER
    mkuser(11, ORG_B, PARTNER, OWNER)
    check('perfilB+vinculoA nega (organization_id != tenant)', S.format(uid(11)), 't|NULL|NULL|1|f')
    # 12) NEGATIVO (revisão 72c9b82): vínculo futuro (valid_from > now())
    mkuser(12, OWNER, PARTNER, OWNER, valid_from="now() + interval '1 day'")
    check('vinculo futuro nega', S.format(uid(12)), 't|NULL|NULL|1|f')
    # 13) NEGATIVO (revisão 72c9b82): owner comercial inativo
    sql(f"INSERT INTO profiles VALUES ('{uid(13)}', '{OWNER_INATIVO}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(13)}', 'parceiro_b2b');"
        f"INSERT INTO partner_users VALUES ('{uid(13)}', '{PARTNER_C}', '{OWNER_INATIVO}', 'gestor', NULL, NULL);")
    check('owner inativo nega', S.format(uid(13)), 'f|NULL|NULL|1|f')
    # 14) POSITIVO papel técnico: escopo resolve; separação financeira fica nos consumidores
    #     (rpc_resolve_commercial_prices exige papel gestor — ver teste de consumidor abaixo)
    mkuser(14, OWNER, PARTNER, OWNER, papel='tecnico', role='parceiro_b2b_tecnico')
    check('papel tecnico resolve escopo (sem financas)', S.format(uid(14)), f't|{PARTNER}|{PARTNER}|1|t')
    # 15) NEGATIVO cross-parceiro: escopo do uid(1) é PARTNER; consumidor que pede PARTNER_B nega
    check('cross-parceiro: consumidor nega parceiro divergente',
          f"SELECT CASE WHEN s.org_partner = '{PARTNER_B}' THEN 'PERMITE' ELSE 'NEGA' END "
          f"FROM platform_private.b2b_actor_scope('{uid(1)}') s", 'NEGA')
    # 16) NEGATIVO cross-parceiro inverso: escopo do uid(14) não autoriza PARTNER_B
    check('cross-parceiro tecnico: consumidor nega parceiro divergente',
          f"SELECT CASE WHEN s.org_partner = '{PARTNER_B}' THEN 'PERMITE' ELSE 'NEGA' END "
          f"FROM platform_private.b2b_actor_scope('{uid(14)}') s", 'NEGA')
    # 17) Gate de perfil: profile_ok=f para perfil inativo mesmo com vínculo íntegro
    check('perfil inativo: profile_ok=f bloqueia consumidores',
          f"SELECT CASE WHEN profile_ok THEN 't' ELSE 'f' END FROM platform_private.b2b_actor_scope('{uid(10)}')", 'f')

    print(f'PASS {len(checks)}/{len(checks)}')
    for c in checks: print(' -', c)
finally:
    subprocess.run(prefix + ['pg_ctl', '-D', str(root/'data'), '-m', 'immediate', 'stop'], capture_output=True, text=True)
