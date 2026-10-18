"""Harness local dos 3 helpers B2B (revogação) — candidata v2 + rollback v2.

DIFERENÇA da versão reprovada: executa os arquivos candidate.sql.review e
rollback.sql.review COMPLETOS E INTACTOS via `psql -f` com ON_ERROR_STOP=1
(guards, BEGIN/COMMIT, timeouts incluídos) — não extrai só os CREATEs.

Baseline fiel: corpos EXATOS do live revisado (mesmos que reproduzem os
hashes PRE de pg_get_functiondef) + ACLs REAIS (GRANT/REVOKE por role) +
owner postgres + search_path idênticos.

Stubs declarados honestamente:
  - public.has_role(user_id, role): lê tabela-fixture user_roles (sem RLS
    real, sem JWT);
  - platform_private.entitlements_for_user: stub com feature 'catalogo_precos'
    apenas para usuários na fixture entitlements_fixture;
  - Não existe Auth/JWT real; nenhum trigger live é desligado (o banco
    descartável não tem triggers).
Limites: não prova JWT/RLS hosted nem b2b_commercial_context; prova os 3
corpos candidatos, guards, atomicidade e rollback sobre esquema reduzido.

Cobertura por helper (negativos em CADA um): revogado, tenant errado,
owner NULL, parceiro inativo, parceiro deletado, 0 vínculos, 2 vínculos,
papel inconsistente com a role, usuário com DOIS papéis B2B. Positivos
REAIS: elegível gestor, elegível tecnico, interno (profile ativo sem
vínculo), legacy (profile.organization_id = ORG_LEGACY cujo
partner_account_id = P_LEGACY). Negativo: org inativa.
"""
from pathlib import Path
import os, subprocess, tempfile, json

HERE = Path(__file__).resolve().parent
CAND = HERE / 'candidate.sql.review'
ROLL = HERE / 'rollback.sql.review'

root = Path(tempfile.mkdtemp(prefix='b2b-helpers-v2-', dir='/tmp')); root.chmod(0o777)
prefix = ['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid() == 0 else []
base = ['psql','-X','-h',str(root),'-p','55496','-U','postgres','-qAt','-v','ON_ERROR_STOP=1']
results = []

def run(sql, fail=None):
    r = subprocess.run(base, input=sql, text=True, capture_output=True)
    if fail:
        assert r.returncode != 0 and fail in r.stderr, (fail, r.stderr)
    else:
        assert r.returncode == 0, r.stderr
    return r.stdout.strip()

def run_file(path: Path, fail=None):
    r = subprocess.run(base + ['-f', str(path)], text=True, capture_output=True)
    if fail:
        assert r.returncode != 0 and fail in r.stderr, (fail, r.stderr)
    else:
        assert r.returncode == 0, r.stderr
    return r.stdout.strip()

def check(label, sql, expected):
    value = run(sql)
    assert value == expected, (label, value, expected)
    results.append(label)

def uid(n): return f'00000000-0000-4000-8000-{n:012d}'

# ---- Baseline: esquema + stubs + corpos LIVE EXATOS + ACLs REAIS ----
SCHEMA = """
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA platform_private;
CREATE TYPE public.app_role AS ENUM('administrador','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','superadmin','financeiro','cliente_produtor');
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean);
CREATE TABLE public.organizations(id uuid PRIMARY KEY, partner_account_id uuid, ativo boolean, status text);
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
CREATE TABLE public.partner_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid, user_id uuid, papel text, tenant_id uuid, revoked_at timestamptz);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, commercial_owner_organization_id uuid, ativo boolean, deleted_at timestamptz);
CREATE TABLE public.entitlements_fixture(user_id uuid);
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)$$;
CREATE FUNCTION platform_private.entitlements_for_user(_uid uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$SELECT 'catalogo_precos' WHERE EXISTS(SELECT 1 FROM public.entitlements_fixture WHERE user_id=_uid)$$;
"""

# Corpos LIVE EXATOS (reproduzem os hashes PRE de pg_get_functiondef)
LIVE_BODIES = r"""
CREATE OR REPLACE FUNCTION public.get_b2b_user_role_for_partner(p_user_id uuid, p_partner_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(p_user_id, 'parceiro_b2b_tecnico'::app_role) THEN 'parceiro_b2b_tecnico'
    WHEN public.has_role(p_user_id, 'parceiro_b2b'::app_role) THEN 'parceiro_b2b'
    ELSE NULL
  END
  FROM public.partner_users pu
  WHERE pu.user_id = p_user_id AND pu.partner_id = p_partner_id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_valid_b2b_partner_user(p_user_id uuid, p_partner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_users pu
    JOIN public.partner_accounts pa ON pa.id = pu.partner_id
    WHERE pu.user_id = p_user_id
      AND pu.partner_id = p_partner_id
      AND pa.ativo = true
      AND (
        public.has_role(p_user_id, 'parceiro_b2b'::app_role)
        OR public.has_role(p_user_id, 'parceiro_b2b_tecnico'::app_role)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION platform_private.b2b_actor_scope(_uid uuid)
 RETURNS TABLE(profile_ok boolean, org_partner uuid, user_partner uuid, user_partner_count integer, partner_valid boolean, has_catalog boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH pr AS (
    SELECT o.partner_account_id
      FROM public.profiles p JOIN public.organizations o ON o.id = p.organization_id
     WHERE p.user_id = _uid AND p.ativo = true AND o.ativo = true AND o.status = 'ativa'
     LIMIT 1
  ), pu AS (
    SELECT count(*)::int c, min(partner_id::text)::uuid pid FROM public.partner_users WHERE user_id = _uid
  )
  SELECT EXISTS (SELECT 1 FROM pr),
         (SELECT partner_account_id FROM pr),
         (SELECT pid FROM pu), (SELECT c FROM pu),
         EXISTS (SELECT 1 FROM pr JOIN public.partner_accounts pa ON pa.id = pr.partner_account_id
                  WHERE pa.ativo = true AND pa.deleted_at IS NULL),
         EXISTS (SELECT 1 FROM platform_private.entitlements_for_user(_uid) e WHERE e.feature_key = 'catalogo_precos');
$function$;
"""

# ACLs REAIS do live (proacl: postgres=X, service_role=X, authenticated=X nos
# públicos; postgres=X, service_role=X no platform_private)
ACLS = """
REVOKE ALL ON FUNCTION public.get_b2b_user_role_for_partner(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_b2b_user_role_for_partner(uuid,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_valid_b2b_partner_user(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_b2b_partner_user(uuid,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION platform_private.b2b_actor_scope(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_actor_scope(uuid) TO service_role;
"""

# ---- Identidades da fixture ----
U_OK, U_TEC, U_REV, U_2LINK, U_0LINK, U_WRONGT, U_OWNERNULL, U_INACT, U_DEL, \
U_BADPAPEL, U_2ROLES, U_INTERNAL, U_LEGACY, U_ORGINACT, U_GESTOR_ADMIN, \
U_LEGACYB2B = [uid(i) for i in range(1, 17)]
P_OK, P_INACT, P_DEL, P_OWNERNULL, P_LEGACY = uid(20), uid(21), uid(22), uid(23), uid(24)
ORG_OWNER, ORG_OTHER, ORG_LEGACY, ORG_INACT = uid(30), uid(31), uid(32), uid(33)

FIXTURE = f"""
INSERT INTO public.organizations(id, partner_account_id, ativo, status) VALUES
  ('{ORG_OWNER}', NULL, true, 'ativa'),
  ('{ORG_OTHER}', NULL, true, 'ativa'),
  ('{ORG_LEGACY}', '{P_LEGACY}', true, 'ativa'),
  ('{ORG_INACT}', NULL, false, 'ativa');
INSERT INTO public.partner_accounts(id, commercial_owner_organization_id, ativo, deleted_at) VALUES
  ('{P_OK}', '{ORG_OWNER}', true, NULL),
  ('{P_INACT}', '{ORG_OWNER}', false, NULL),
  ('{P_DEL}', '{ORG_OWNER}', true, now()),
  ('{P_OWNERNULL}', NULL, true, NULL),
  ('{P_LEGACY}', '{ORG_OWNER}', true, NULL);
INSERT INTO public.profiles(user_id, organization_id, ativo) VALUES
  ('{U_OK}', '{ORG_OWNER}', true),
  ('{U_TEC}', '{ORG_OWNER}', true),
  ('{U_REV}', '{ORG_OWNER}', true),
  ('{U_2LINK}', '{ORG_OWNER}', true),
  ('{U_0LINK}', '{ORG_OWNER}', true),
  ('{U_WRONGT}', '{ORG_OWNER}', true),
  ('{U_OWNERNULL}', '{ORG_OWNER}', true),
  ('{U_INACT}', '{ORG_OWNER}', true),
  ('{U_DEL}', '{ORG_OWNER}', true),
  ('{U_BADPAPEL}', '{ORG_OWNER}', true),
  ('{U_2ROLES}', '{ORG_OWNER}', true),
  ('{U_INTERNAL}', '{ORG_OTHER}', true),
  ('{U_LEGACY}', '{ORG_LEGACY}', true),
  ('{U_ORGINACT}', '{ORG_INACT}', true),
  ('{U_GESTOR_ADMIN}', '{ORG_OWNER}', true),
  ('{U_LEGACYB2B}', '{ORG_LEGACY}', true);
INSERT INTO public.user_roles(user_id, role) VALUES
  ('{U_OK}', 'parceiro_b2b'),
  ('{U_TEC}', 'parceiro_b2b_tecnico'),
  ('{U_REV}', 'parceiro_b2b'),
  ('{U_2LINK}', 'parceiro_b2b'),
  ('{U_WRONGT}', 'parceiro_b2b'),
  ('{U_OWNERNULL}', 'parceiro_b2b'),
  ('{U_INACT}', 'parceiro_b2b'),
  ('{U_DEL}', 'parceiro_b2b'),
  ('{U_BADPAPEL}', 'parceiro_b2b_tecnico'),
  ('{U_2ROLES}', 'parceiro_b2b'),
  ('{U_2ROLES}', 'parceiro_b2b_tecnico'),
  ('{U_INTERNAL}', 'administrador'),
  ('{U_LEGACY}', 'administrador'),
  ('{U_ORGINACT}', 'parceiro_b2b'),
  ('{U_GESTOR_ADMIN}', 'parceiro_b2b'),
  ('{U_GESTOR_ADMIN}', 'administrador'),
  ('{U_LEGACYB2B}', 'parceiro_b2b');
INSERT INTO public.partner_users(partner_id, user_id, papel, tenant_id, revoked_at) VALUES
  ('{P_OK}', '{U_OK}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_OK}', '{U_TEC}', 'tecnico', '{ORG_OWNER}', NULL),
  ('{P_OK}', '{U_REV}', 'gestor', '{ORG_OWNER}', now()),
  ('{P_OK}', '{U_2LINK}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_LEGACY}', '{U_2LINK}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_OK}', '{U_WRONGT}', 'gestor', '{ORG_OTHER}', NULL),
  ('{P_OWNERNULL}', '{U_OWNERNULL}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_INACT}', '{U_INACT}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_DEL}', '{U_DEL}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_OK}', '{U_BADPAPEL}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_OK}', '{U_2ROLES}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_OK}', '{U_ORGINACT}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_OK}', '{U_GESTOR_ADMIN}', 'gestor', '{ORG_OWNER}', NULL),
  ('{P_LEGACY}', '{U_LEGACYB2B}', 'gestor', '{ORG_OWNER}', NULL);
INSERT INTO public.entitlements_fixture(user_id) VALUES ('{U_OK}'), ('{U_TEC}');
"""

PRE = {
 'public.get_b2b_user_role_for_partner(uuid,uuid)': 'b2596473d00151ef41b4b2ce82e044cb',
 'public.is_valid_b2b_partner_user(uuid,uuid)': '7b17274fb6dce728741a2a9c77710a76',
 'platform_private.b2b_actor_scope(uuid)': 'c85cb35201682c3c86b9a327d24c8482',
}
POST = {
 'public.get_b2b_user_role_for_partner(uuid,uuid)': '27efcdaf40dc0e5287abd4cf418a6571',
 'public.is_valid_b2b_partner_user(uuid,uuid)': '93520101987e599280460d3dadcf3a9f',
 'platform_private.b2b_actor_scope(uuid)': '09b184da91c59f8b1f9be72217f8c37e',
}

def md5(sig):
    return run(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")

try:
    subprocess.run(prefix + ['initdb','-D',str(root/'data'),'-A','trust','-U','postgres'], check=True, capture_output=True)
    subprocess.run(prefix + ['pg_ctl','-D',str(root/'data'),'-l',str(root/'log'),'-o',f'-k {root} -h "" -p 55496','start'], check=True, capture_output=True)
    run(SCHEMA)
    run(LIVE_BODIES)
    run(ACLS)
    run(FIXTURE)

    # Baseline: hashes PRE exatos
    for sig, h in PRE.items():
        check(f"baseline PRE {sig.split('(')[0]}", f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))", h)

    # --- DRIFT antes da candidata: corpo alterado => guarda rejeita, nada muda ---
    run("CREATE OR REPLACE FUNCTION public.is_valid_b2b_partner_user(p_user_id uuid, p_partner_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$SELECT true$$;")
    run_file(CAND, fail='PRE FALHOU')
    results.append("drift pré-candidata rejeitado (is_valid adulterado)")
    run(LIVE_BODIES)  # restaura baseline
    run(ACLS)
    for sig, h in PRE.items():
        assert md5(sig) == h, f"baseline não restaurado em {sig}"
    results.append("baseline restaurado após drift")

    # --- Aplica candidata COMPLETA intacta ---
    run_file(CAND)
    results.append("candidata v2 aplicada (arquivo completo, guards incluídos)")
    for sig, h in POST.items():
        check(f"POST {sig.split('(')[0]}", f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))", h)

    R = "public.get_b2b_user_role_for_partner"
    V = "public.is_valid_b2b_partner_user"
    S = "platform_private.b2b_actor_scope"

    # ===== is_valid: positivos =====
    check("valid: gestor elegível = true", f"SELECT {V}('{U_OK}','{P_OK}')", "t")
    check("valid: tecnico elegível = true", f"SELECT {V}('{U_TEC}','{P_OK}')", "t")
    # ===== is_valid: negativos =====
    check("valid: REVOGADO = false", f"SELECT {V}('{U_REV}','{P_OK}')", "f")
    check("valid: tenant errado = false", f"SELECT {V}('{U_WRONGT}','{P_OK}')", "f")
    check("valid: owner NULL = false", f"SELECT {V}('{U_OWNERNULL}','{P_OWNERNULL}')", "f")
    check("valid: parceiro inativo = false", f"SELECT {V}('{U_INACT}','{P_INACT}')", "f")
    check("valid: parceiro deletado = false", f"SELECT {V}('{U_DEL}','{P_DEL}')", "f")
    check("valid: 0 vínculos = false", f"SELECT {V}('{U_0LINK}','{P_OK}')", "f")
    check("valid: 2 vínculos = false", f"SELECT {V}('{U_2LINK}','{P_OK}')", "f")
    check("valid: papel inconsistente (gestor c/ role tecnico) = false", f"SELECT {V}('{U_BADPAPEL}','{P_OK}')", "f")
    check("valid: dois papéis B2B = false", f"SELECT {V}('{U_2ROLES}','{P_OK}')", "f")
    check("valid: sem papel B2B (interno) = false", f"SELECT {V}('{U_INTERNAL}','{P_OK}')", "f")
    check("valid: gestor+administrador (2 roles totais) = false", f"SELECT {V}('{U_GESTOR_ADMIN}','{P_OK}')", "f")

    # ===== get_role: positivos =====
    check("role: gestor elegível -> parceiro_b2b", f"SELECT {R}('{U_OK}','{P_OK}')", "parceiro_b2b")
    check("role: tecnico elegível -> parceiro_b2b_tecnico", f"SELECT {R}('{U_TEC}','{P_OK}')", "parceiro_b2b_tecnico")
    # ===== get_role: negativos =====
    check("role: REVOGADO -> NULL", f"SELECT coalesce({R}('{U_REV}','{P_OK}'),'<null>')", "<null>")
    check("role: tenant errado -> NULL", f"SELECT coalesce({R}('{U_WRONGT}','{P_OK}'),'<null>')", "<null>")
    check("role: owner NULL -> NULL", f"SELECT coalesce({R}('{U_OWNERNULL}','{P_OWNERNULL}'),'<null>')", "<null>")
    check("role: parceiro inativo -> NULL", f"SELECT coalesce({R}('{U_INACT}','{P_INACT}'),'<null>')", "<null>")
    check("role: parceiro deletado -> NULL", f"SELECT coalesce({R}('{U_DEL}','{P_DEL}'),'<null>')", "<null>")
    check("role: 0 vínculos -> NULL", f"SELECT coalesce({R}('{U_0LINK}','{P_OK}'),'<null>')", "<null>")
    check("role: 2 vínculos -> NULL", f"SELECT coalesce({R}('{U_2LINK}','{P_OK}'),'<null>')", "<null>")
    check("role: papel inconsistente -> NULL", f"SELECT coalesce({R}('{U_BADPAPEL}','{P_OK}'),'<null>')", "<null>")
    check("role: dois papéis B2B -> NULL", f"SELECT coalesce({R}('{U_2ROLES}','{P_OK}'),'<null>')", "<null>")
    check("role: gestor+administrador (2 roles totais) -> NULL", f"SELECT coalesce({R}('{U_GESTOR_ADMIN}','{P_OK}'),'<null>')", "<null>")

    # ===== b2b_actor_scope: positivos =====
    check("scope: gestor elegível -> count=1, partner", f"SELECT user_partner_count, user_partner FROM {S}('{U_OK}')", f"1|{P_OK}")
    check("scope: tecnico elegível -> count=1, partner", f"SELECT user_partner_count, user_partner FROM {S}('{U_TEC}')", f"1|{P_OK}")
    # ===== b2b_actor_scope: negativos do vínculo externo =====
    check("scope: REVOGADO -> count=0, partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_REV}')", "0|<null>")
    check("scope: tenant errado -> count=1, partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_WRONGT}')", "1|<null>")
    check("scope: owner NULL -> count=1, partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_OWNERNULL}')", "1|<null>")
    check("scope: parceiro inativo -> partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_INACT}')", "1|<null>")
    check("scope: parceiro deletado -> partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_DEL}')", "1|<null>")
    check("scope: 0 vínculos -> count=0, partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_0LINK}')", "0|<null>")
    check("scope: 2 vínculos -> count=2, partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_2LINK}')", "2|<null>")
    check("scope: papel inconsistente -> partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_BADPAPEL}')", "1|<null>")
    check("scope: dois papéis B2B -> partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_2ROLES}')", "1|<null>")
    check("scope: gestor+administrador (2 roles totais) -> partner NULL", f"SELECT user_partner_count, coalesce(user_partner::text,'<null>') FROM {S}('{U_GESTOR_ADMIN}')", "1|<null>")

    # ===== Positivos REAIS interno/legacy e negativo org inativa =====
    # Interno: profile ativo em ORG_OTHER (sem partner_account_id), sem vínculo.
    check("scope: INTERNO profile_ok=true, org_partner NULL, partner_valid=false",
          f"SELECT profile_ok, coalesce(org_partner::text,'<null>'), partner_valid FROM {S}('{U_INTERNAL}')", "t|<null>|f")
    # Legacy interno: profile.organization_id = ORG_LEGACY (partner_account_id
    # = P_LEGACY), role administrador, SEM vínculo — prova o ramo interno de
    # org legacy (partner_valid pela semântica antiga, sem owner).
    check("scope: LEGACY interno profile_ok=true, org_partner=P_LEGACY, partner_valid=true (semântica antiga)",
          f"SELECT profile_ok, org_partner, partner_valid FROM {S}('{U_LEGACY}')", f"t|{P_LEGACY}|t")
    # B2B LEGACY REAL: role parceiro_b2b, papel gestor, profile.org=ORG_LEGACY
    # (partner_account_id=P_LEGACY) E vínculo elegível tenant=owner comercial
    # (ORG_OWNER) com partner=P_LEGACY. Prova que o endurecimento do vínculo
    # externo NÃO bloqueia o B2B legado elegível.
    check("scope: B2B LEGACY count=1, user_partner=P_LEGACY",
          f"SELECT user_partner_count, user_partner FROM {S}('{U_LEGACYB2B}')", f"1|{P_LEGACY}")
    check("scope: B2B LEGACY profile_ok=true, org_partner=P_LEGACY, partner_valid=true",
          f"SELECT profile_ok, org_partner, partner_valid FROM {S}('{U_LEGACYB2B}')", f"t|{P_LEGACY}|t")
    check("valid: B2B LEGACY elegível = true", f"SELECT {V}('{U_LEGACYB2B}','{P_LEGACY}')", "t")
    check("role: B2B LEGACY -> parceiro_b2b", f"SELECT {R}('{U_LEGACYB2B}','{P_LEGACY}')", "parceiro_b2b")
    # Org inativa: profile_ok=false.
    check("scope: org INATIVA -> profile_ok=false, org_partner NULL",
          f"SELECT profile_ok, coalesce(org_partner::text,'<null>') FROM {S}('{U_ORGINACT}')", "f|<null>")
    # has_catalog conforme entitlement
    check("scope: has_catalog true com entitlement", f"SELECT has_catalog FROM {S}('{U_OK}')", "t")
    check("scope: has_catalog false sem entitlement", f"SELECT has_catalog FROM {S}('{U_LEGACY}')", "f")

    # --- DRIFT antes do rollback: corpo adulterado => rollback recusa ---
    run("CREATE OR REPLACE FUNCTION public.get_b2b_user_role_for_partner(p_user_id uuid, p_partner_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$SELECT 'x'::text$$;")
    run_file(ROLL, fail='ROLLBACK RECUSADO')
    results.append("drift pré-rollback rejeitado (get_role adulterado)")
    # Atomicidade: as OUTRAS funções permanecem nos hashes POST
    check("atomicidade: is_valid intacta após rollback recusado",
          f"SELECT md5(pg_get_functiondef('{ 'public.is_valid_b2b_partner_user(uuid,uuid)' }'::regprocedure))",
          POST['public.is_valid_b2b_partner_user(uuid,uuid)'])
    check("atomicidade: actor_scope intacto após rollback recusado",
          f"SELECT md5(pg_get_functiondef('platform_private.b2b_actor_scope(uuid)'::regprocedure))",
          POST['platform_private.b2b_actor_scope(uuid)'])
    # Restaura POST exato da função adulterada reaplicando a candidata? Não:
    # candidata exige PRE. Recria o corpo POST manualmente via arquivo? O
    # corpo POST está na candidata; reaplicamos só o CREATE extraído NÃO —
    # em vez disso, reexecutamos a candidata inteira falharia no PRE. Para
    # seguir, restauramos o POST reaplicando a candidata após reverter o
    # drift ao PRE e reaplicar tudo (caminho real: drift corrigido antes).
    run(LIVE_BODIES); run(ACLS)  # volta tudo ao PRE
    run_file(CAND)               # reaplica candidata completa
    results.append("candidata reaplicada após drift corrigido")

    # --- ROLLBACK exato: arquivo completo, verifica hashes PRE ---
    run_file(ROLL)
    results.append("rollback v2 aplicado (arquivo completo, guards incluídos)")
    for sig, h in PRE.items():
        check(f"rollback PRE {sig.split('(')[0]}", f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))", h)

    # Comportamento pré restaurado (revogação ignorada de novo = defeito original)
    check("rollback: role ignora revoked_at (pré)", f"SELECT {R}('{U_REV}','{P_OK}')", "parceiro_b2b")
    check("rollback: valid ignora revoked_at (pré)", f"SELECT {V}('{U_REV}','{P_OK}')", "t")
    check("rollback: scope conta revogados (pré)", f"SELECT user_partner_count FROM {S}('{U_REV}')", "1")

    # Rollback em baseline PRE (sem candidata) deve recusar
    run_file(ROLL, fail='ROLLBACK RECUSADO')
    results.append("rollback sobre baseline PRE recusado (nada a reverter)")

    print(json.dumps({"status": "PASS", "total": len(results), "checks": results}, ensure_ascii=False, indent=1))
finally:
    subprocess.run(prefix + ['pg_ctl','-D',str(root/'data'),'stop','-m','immediate'], capture_output=True)
