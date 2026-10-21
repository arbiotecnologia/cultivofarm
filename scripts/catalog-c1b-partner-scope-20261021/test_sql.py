# C1B-SCOPE harness — PostgreSQL local descartável, dados 100% sintéticos.
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

OWNER = uid(100)      # tenant fornecedor (commercial_owner)
PARTNER = uid(200)    # partner_account
PARTNER_B = uid(201)  # outro parceiro (cross-tenant)
ORG_PARTNER = uid(300)  # organização parceira (modelo A)

SCHEMA = f"""
CREATE SCHEMA platform_private;
CREATE TYPE public.app_role AS ENUM('administrador','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','superadmin');
CREATE TABLE profiles(user_id uuid, organization_id uuid, ativo boolean);
CREATE TABLE organizations(id uuid, partner_account_id uuid, ativo boolean, status text);
CREATE TABLE partner_accounts(id uuid, commercial_owner_organization_id uuid, ativo boolean, deleted_at timestamptz);
CREATE TABLE user_roles(user_id uuid, role app_role);
CREATE TABLE partner_users(user_id uuid, partner_id uuid, tenant_id uuid, papel text, revoked_at timestamptz);
CREATE FUNCTION public.has_role(u uuid, r app_role) RETURNS boolean LANGUAGE sql STABLE SET search_path TO public
 AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role=r)$$;
CREATE FUNCTION platform_private.entitlements_for_user(u uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE SET search_path TO public
 AS $$SELECT 'catalogo_precos'::text$$;
INSERT INTO organizations VALUES ('{OWNER}', NULL, true, 'ativa'), ('{ORG_PARTNER}', '{PARTNER}', true, 'ativa');
INSERT INTO partner_accounts VALUES ('{PARTNER}', '{OWNER}', true, NULL), ('{PARTNER_B}', '{OWNER}', true, NULL);
"""

try:
    r = subprocess.run(prefix + ['initdb', '-D', str(root/'data'), '-A', 'trust', '-U', 'postgres'], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    r = subprocess.run(prefix + ['pg_ctl', '-D', str(root/'data'), '-l', str(root/'log'), '-o', f'-k {root} -p 55498 -h ""', 'start'], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    sql(SCHEMA)
    live = json.loads((HERE/'live-snapshot.json').read_text())
    for row in live:
        sql(row['definition'])
        check('baseline md5 ' + row['identity'],
              f"SELECT md5(pg_get_functiondef('{row['identity']}'::regprocedure))", row['md5'])

    # Baseline live: padrão teste4 (org sem parceiro) => org_partner NULL (bloqueio estrutural)
    sql(f"INSERT INTO profiles VALUES ('{uid(1)}', '{OWNER}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(1)}', 'parceiro_b2b');"
        f"INSERT INTO partner_users VALUES ('{uid(1)}', '{PARTNER}', '{OWNER}', 'gestor', NULL);")
    check('baseline live nega teste4 (org_partner NULL)',
          f"SELECT coalesce(org_partner::text,'NULL') FROM platform_private.b2b_actor_scope('{uid(1)}')", 'NULL')

    sql((HERE/'candidate.sql.review').read_text())
    check('is_valid_b2b_partner_user intocada',
          "SELECT md5(pg_get_functiondef('is_valid_b2b_partner_user(uuid,uuid)'::regprocedure))",
          '93520101987e599280460d3dadcf3a9f')

    S = f"SELECT profile_ok||'|'||coalesce(org_partner::text,'NULL')||'|'||coalesce(user_partner::text,'NULL')||'|'||user_partner_count||'|'||partner_valid FROM platform_private.b2b_actor_scope('{{}}')"
    # 1) POSITIVO: padrão teste4 — vínculo autorizado resolve o parceiro
    check('teste4 resolve pelo vinculo', S.format(uid(1)), f't|{PARTNER}|{PARTNER}|1|t')
    # 2) POSITIVO: modelo A (organização parceira) continua funcionando
    sql(f"INSERT INTO profiles VALUES ('{uid(2)}', '{ORG_PARTNER}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(2)}', 'parceiro_b2b');"
        f"INSERT INTO partner_users VALUES ('{uid(2)}', '{PARTNER}', '{OWNER}', 'gestor', NULL);")
    check('modelo A preservado', S.format(uid(2)), f't|{PARTNER}|{PARTNER}|1|t')
    # 3) NEGATIVO: vínculo revogado
    sql(f"INSERT INTO profiles VALUES ('{uid(3)}', '{OWNER}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(3)}', 'parceiro_b2b');"
        f"INSERT INTO partner_users VALUES ('{uid(3)}', '{PARTNER}', '{OWNER}', 'gestor', now());")
    check('vinculo revogado nega', S.format(uid(3)), 't|NULL|NULL|0|f')
    # 4) NEGATIVO: dois vínculos ativos
    sql(f"INSERT INTO profiles VALUES ('{uid(4)}', '{OWNER}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(4)}', 'parceiro_b2b');"
        f"INSERT INTO partner_users VALUES ('{uid(4)}', '{PARTNER}', '{OWNER}', 'gestor', NULL), ('{uid(4)}', '{PARTNER_B}', '{OWNER}', 'gestor', NULL);")
    check('dois vinculos negam', S.format(uid(4)), 't|NULL|NULL|2|f')
    # 5) NEGATIVO: multipapel (count(user_roles)=1) — incompatibilidade registrada, não aberta
    sql(f"INSERT INTO profiles VALUES ('{uid(5)}', '{OWNER}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(5)}', 'parceiro_b2b'), ('{uid(5)}', 'parceiro_b2b_tecnico');"
        f"INSERT INTO partner_users VALUES ('{uid(5)}', '{PARTNER}', '{OWNER}', 'gestor', NULL);")
    check('multipapel nega (registrado p/ fase de contratos)', S.format(uid(5)), 't|NULL|NULL|1|f')
    # 6) NEGATIVO: parceiro inativo
    sql(f"INSERT INTO partner_accounts VALUES ('{uid(202)}', '{OWNER}', false, NULL);"
        f"INSERT INTO profiles VALUES ('{uid(6)}', '{OWNER}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(6)}', 'parceiro_b2b');"
        f"INSERT INTO partner_users VALUES ('{uid(6)}', '{uid(202)}', '{OWNER}', 'gestor', NULL);")
    check('parceiro inativo nega', S.format(uid(6)), 't|NULL|NULL|1|f')
    # 7) NEGATIVO: tenant do vínculo diferente do fornecedor
    sql(f"INSERT INTO organizations VALUES ('{uid(301)}', NULL, true, 'ativa');"
        f"INSERT INTO profiles VALUES ('{uid(7)}', '{OWNER}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(7)}', 'parceiro_b2b');"
        f"INSERT INTO partner_users VALUES ('{uid(7)}', '{PARTNER}', '{uid(301)}', 'gestor', NULL);")
    check('tenant divergente do fornecedor nega', S.format(uid(7)), 't|NULL|NULL|1|f')
    # 8) NEGATIVO: organização com parceiro X + vínculo válido em Y => org prevalece, mismatch nega no consumidor
    sql(f"INSERT INTO profiles VALUES ('{uid(8)}', '{ORG_PARTNER}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(8)}', 'parceiro_b2b');"
        f"INSERT INTO partner_users VALUES ('{uid(8)}', '{PARTNER_B}', '{OWNER}', 'gestor', NULL);")
    check('org prevalece e diverge do vinculo', S.format(uid(8)), f't|{PARTNER}|{PARTNER_B}|1|t')
    # 9) NEGATIVO: papel tecnico com role gestor (mismatch papel↔role)
    sql(f"INSERT INTO profiles VALUES ('{uid(9)}', '{OWNER}', true);"
        f"INSERT INTO user_roles VALUES ('{uid(9)}', 'parceiro_b2b');"
        f"INSERT INTO partner_users VALUES ('{uid(9)}', '{PARTNER}', '{OWNER}', 'tecnico', NULL);")
    check('papel/role divergentes negam', S.format(uid(9)), 't|NULL|NULL|1|f')
    # 10) NEGATIVO: perfil inativo
    sql(f"INSERT INTO profiles VALUES ('{uid(10)}', '{OWNER}', false);"
        f"INSERT INTO user_roles VALUES ('{uid(10)}', 'parceiro_b2b');"
        f"INSERT INTO partner_users VALUES ('{uid(10)}', '{PARTNER}', '{OWNER}', 'gestor', NULL);")
    check('perfil inativo nega', S.format(uid(10)), 'f|NULL|NULL|1|f')
    # 11) Cross-tenant: escopo resolve Z; consumidor que pedir W != Z nega (org_partner != p_partner_id)
    check('cross-tenant: escopo fica no parceiro do vinculo', S.format(uid(1)), f't|{PARTNER}|{PARTNER}|1|t')

    print(f'PASS {len(checks)}/{len(checks)}')
    for c in checks: print(' -', c)
finally:
    subprocess.run(prefix + ['pg_ctl', '-D', str(root/'data'), '-m', 'immediate', 'stop'], capture_output=True, text=True)
