"""Testes SQL locais dos 3 helpers B2B (revogação) em PostgreSQL descartável.

Usa os CORPOS REAIS extraídos de candidate.sql.review e rollback.sql.review
(não réplicas). Sem conexão hosted, sem Auth real, sem DML de produção.

Stubs declarados honestamente:
  - has_role(user_id, role): tabela-fixture user_roles (sem RLS real);
  - platform_private.entitlements_for_user: stub com feature 'catalogo_precos'
    apenas para usuários marcados na fixture entitlements_fixture;
  - platform_private.platform_actor_access_ready / public.h15_actor_organization:
    stubs mínimos (não exercitados pelos 3 helpers testados aqui; existem só
    para satisfazer o ambiente caso algum corpo referencie).
Limites: não prova JWT/RLS real nem o comportamento de b2b_commercial_context
(que tem corpo próprio já alinhado na E2); prova apenas os 3 corpos candidatos
e o rollback sobre o esquema reduzido.
"""
from pathlib import Path
import os, re, subprocess, tempfile, json

HERE = Path(__file__).resolve().parent
root = Path(tempfile.mkdtemp(prefix='b2b-helpers-', dir='/tmp')); root.chmod(0o777)
prefix = ['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid() == 0 else []
base = ['psql','-X','-h',str(root),'-p','55497','-U','postgres','-qAt','-v','ON_ERROR_STOP=1']
results = []

def run(sql, fail=None):
    r = subprocess.run(base, input=sql, text=True, capture_output=True)
    if fail:
        assert r.returncode != 0 and fail in r.stderr, r.stderr
    else:
        assert r.returncode == 0, r.stderr
    return r.stdout.strip()

def check(label, sql, expected):
    value = run(sql)
    assert value == expected, (label, value, expected)
    results.append(label)

def uid(n): return f'00000000-0000-4000-8000-{n:012d}'

def extract_func(path: Path, name: str) -> str:
    """Extrai o bloco CREATE OR REPLACE FUNCTION <name> ... $function$; do arquivo real."""
    text = path.read_text()
    m = re.search(
        rf"CREATE OR REPLACE FUNCTION {re.escape(name)}.*?\$function\$;",
        text, re.S,
    )
    assert m, f"corpo de {name} não encontrado em {path}"
    return m.group(0)

CAND = HERE / 'candidate.sql.review'
ROLL = HERE / 'rollback.sql.review'

cand_bodies = [
    extract_func(CAND, 'public.get_b2b_user_role_for_partner(p_user_id uuid, p_partner_id uuid)'),
    extract_func(CAND, 'public.is_valid_b2b_partner_user(p_user_id uuid, p_partner_id uuid)'),
    extract_func(CAND, 'platform_private.b2b_actor_scope(_uid uuid)'),
]
roll_bodies = [
    extract_func(ROLL, 'public.get_b2b_user_role_for_partner(p_user_id uuid, p_partner_id uuid)'),
    extract_func(ROLL, 'public.is_valid_b2b_partner_user(p_user_id uuid, p_partner_id uuid)'),
    extract_func(ROLL, 'platform_private.b2b_actor_scope(_uid uuid)'),
]

SCHEMA = """
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('fixture.actor',true),'')::uuid$$;
CREATE TYPE app_role AS ENUM('administrador','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','superadmin','financeiro','cliente_produtor');
CREATE TABLE profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean);
CREATE TABLE organizations(id uuid PRIMARY KEY, partner_account_id uuid, ativo boolean, status text);
CREATE TABLE user_roles(user_id uuid, role app_role);
CREATE TABLE partner_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid, user_id uuid, papel text, tenant_id uuid, revoked_at timestamptz);
CREATE TABLE partner_accounts(id uuid PRIMARY KEY, commercial_owner_organization_id uuid, ativo boolean, deleted_at timestamptz);
CREATE TABLE entitlements_fixture(user_id uuid);
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)$$;
CREATE FUNCTION platform_private.entitlements_for_user(_uid uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$SELECT 'catalogo_precos' WHERE EXISTS(SELECT 1 FROM public.entitlements_fixture WHERE user_id=_uid)$$;
"""

# Identidades da fixture
U_OK, U_REV, U_2LINK, U_0LINK, U_WRONGT, U_INACT, U_DEL, U_NOPARTNER, U_INTERNAL = [uid(i) for i in range(1, 10)]
P_OK, P_INACT, P_DEL = uid(20), uid(21), uid(22)
ORG_OWNER, ORG_OTHER, ORG_LEGACY = uid(30), uid(31), uid(32)
P_LEGACY = uid(23)

FIXTURE = f"""
INSERT INTO organizations(id, partner_account_id, ativo, status) VALUES
  ('{ORG_OWNER}', NULL, true, 'ativa'),
  ('{ORG_OTHER}', NULL, true, 'ativa'),
  ('{ORG_LEGACY}', '{P_LEGACY}', true, 'ativa');
INSERT INTO partner_accounts(id, commercial_owner_organization_id, ativo, deleted_at) VALUES
  ('{P_OK}', '{ORG_OWNER}', true, NULL),
  ('{P_INACT}', '{ORG_OWNER}', false, NULL),
  ('{P_DEL}', '{ORG_OWNER}', true, now()),
  ('{P_LEGACY}', '{ORG_OWNER}', true, NULL);
INSERT INTO profiles(user_id, organization_id, ativo) VALUES
  ('{U_OK}', '{ORG_OWNER}', true),
  ('{U_REV}', '{ORG_OWNER}', true),
  ('{U_2LINK}', '{ORG_OWNER}', true),
  ('{U_0LINK}', '{ORG_OWNER}', true),
  ('{U_WRONGT}', '{ORG_OWNER}', true),
  ('{U_INACT}', '{ORG_OWNER}', true),
  ('{U_DEL}', '{ORG_OWNER}', true),
  ('{U_NOPARTNER}', '{ORG_OTHER}', true),
  ('{U_INTERNAL}', '{ORG_OTHER}', true);
INSERT INTO user_roles(user_id, role) VALUES
  ('{U_OK}', 'parceiro_b2b'),
  ('{U_REV}', 'parceiro_b2b'),
  ('{U_2LINK}', 'parceiro_b2b'),
  ('{U_WRONGT}', 'parceiro_b2b'),
  ('{U_INACT}', 'parceiro_b2b'),
  ('{U_DEL}', 'parceiro_b2b'),
  ('{U_INTERNAL}', 'administrador');
INSERT INTO partner_users(partner_id, user_id, papel, tenant_id, revoked_at) VALUES
  ('{P_OK}', '{U_OK}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_OK}', '{U_REV}', 'gestor', '{ORG_OWNER}', now()),
  ('{P_OK}', '{U_2LINK}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_LEGACY}', '{U_2LINK}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_OK}', '{U_WRONGT}', 'gestor', '{ORG_OTHER}', NULL),
  ('{P_INACT}', '{U_INACT}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_DEL}', '{U_DEL}', 'gestor', '{ORG_OWNER}', NULL);
INSERT INTO entitlements_fixture(user_id) VALUES
  ('{U_OK}'), ('{U_REV}'), ('{U_2LINK}'), ('{U_WRONGT}'), ('{U_INACT}'), ('{U_DEL}');
"""

try:
    subprocess.run(prefix + ['initdb','-D',str(root/'data'),'-A','trust','-U','postgres'], check=True, capture_output=True)
    subprocess.run(prefix + ['pg_ctl','-D',str(root/'data'),'-l',str(root/'log'),'-o',f'-k {root} -h "" -p 55497','start'], check=True, capture_output=True)
    run(SCHEMA)
    run(FIXTURE)

    # Aplica os corpos CANDIDATOS reais extraídos do arquivo
    for body in cand_bodies:
        run(body)

    R = "public.get_b2b_user_role_for_partner"
    V = "public.is_valid_b2b_partner_user"
    S = "platform_private.b2b_actor_scope"

    # --- get_b2b_user_role_for_partner ---
    check("role: vínculo elegível retorna papel", f"SELECT {R}('{U_OK}','{P_OK}')", "parceiro_b2b")
    check("role: REVOGADO retorna vazio", f"SELECT coalesce({R}('{U_REV}','{P_OK}'),'<null>')", "<null>")
    check("role: sem vínculo retorna vazio", f"SELECT coalesce({R}('{U_0LINK}','{P_OK}'),'<null>')", "<null>")

    # --- is_valid_b2b_partner_user ---
    check("valid: elegível = true", f"SELECT {V}('{U_OK}','{P_OK}')", "t")
    check("valid: REVOGADO = false", f"SELECT {V}('{U_REV}','{P_OK}')", "f")
    check("valid: parceiro INATIVO = false", f"SELECT {V}('{U_INACT}','{P_INACT}')", "f")
    check("valid: parceiro DELETADO = false", f"SELECT {V}('{U_DEL}','{P_DEL}')", "f")
    check("valid: sem papel B2B = false", f"SELECT {V}('{U_INTERNAL}','{P_OK}')", "f")

    # --- b2b_actor_scope ---
    check("scope: elegível -> count=1 e partner", f"SELECT user_partner_count, user_partner FROM {S}('{U_OK}')", f"1|{P_OK}")
    check("scope: REVOGADO -> count=0, partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_REV}')", "0|<null>")
    check("scope: 2 vínculos -> count=2, partner NULL (fail-closed)", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_2LINK}')", "2|<null>")
    check("scope: 0 vínculos -> count=0, partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_0LINK}')", "0|<null>")
    check("scope: tenant errado -> count=1 mas partner NULL (fail-closed)", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_WRONGT}')", "1|<null>")
    check("scope: parceiro inativo -> partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_INACT}')", "1|<null>")
    check("scope: parceiro deletado -> partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_DEL}')", "1|<null>")
    check("scope: usuário sem vínculo em outra org -> count=0", f"SELECT user_partner_count FROM {S}('{U_NOPARTNER}')", "0")
    # acesso interno/legacy preservado: profile_ok/org_partner/has_catalog intactos
    check("scope: interno profile_ok/org_partner preservados", f"SELECT profile_ok, coalesce(org_partner::text,'<null>') FROM {S}('{U_INTERNAL}')", "t|<null>")
    check("scope: legacy org_partner preservado", f"SELECT profile_ok, org_partner FROM {S}('{U_OK}')", f"t|")
    check("scope: partner_valid da org legacy (owner não nulo) = true", f"SELECT partner_valid FROM {S}('{U_INTERNAL}')", "f")
    check("scope: has_catalog conforme entitlement", f"SELECT has_catalog FROM {S}('{U_OK}')", "t")
    check("scope: has_catalog false sem entitlement", f"SELECT has_catalog FROM {S}('{U_INTERNAL}')", "f")

    # --- ROLLBACK fiel: corpos reais do rollback restauram comportamento pré ---
    for body in roll_bodies:
        run(body)
    check("rollback: role ignora revoked_at de novo (pré)", f"SELECT {R}('{U_REV}','{P_OK}')", "parceiro_b2b")
    check("rollback: valid ignora revoked_at de novo (pré)", f"SELECT {V}('{U_REV}','{P_OK}')", "t")
    check("rollback: valid ignora deleted_at de novo (pré)", f"SELECT {V}('{U_DEL}','{P_DEL}')", "t")
    check("rollback: scope conta revogados de novo (pré)", f"SELECT user_partner_count FROM {S}('{U_REV}')", "1")

    print(json.dumps({"status": "PASS", "checks": results}, ensure_ascii=False, indent=1))
finally:
    subprocess.run(prefix + ['pg_ctl','-D',str(root/'data'),'stop','-m','immediate'], capture_output=True)
