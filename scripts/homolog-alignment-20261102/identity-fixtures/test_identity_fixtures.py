#!/usr/bin/env python3
"""PostgreSQL DESCARTÁVEL — prova do roteiro 10 (vínculos de fixtures homolog). Zero hosted.
Colunas/CHECK/UNIQUE reais (captura READ ONLY) de profiles/user_roles/partner_users/partner_accounts/organizations
e corpos reais dos gatilhos de perfil. auth.users é sintético (só id/email/email_confirmed_at)."""
import json, pathlib, sys
HERE = pathlib.Path(__file__).resolve().parent
sys.argv = [sys.argv[0], "/tmp/idfx-scratch"]
sys.path.insert(0, str(HERE.parents[1] / "tenant-exclusive-catalog-20261101/test"))
import harness as H  # noqa: E402
sys.path.insert(0, str(HERE.parent))
import importlib.util as _iu  # noqa: E402
_spec = _iu.spec_from_file_location("homolog_build", HERE.parent / "build.py"); B = _iu.module_from_spec(_spec)
_argv = sys.argv; sys.argv = [sys.argv[0]]; _spec.loader.exec_module(B); sys.argv = _argv   # só funções; main não roda no import
IDGATE = "DO $g$ DECLARE v_fail text[] := ARRAY[]::text[]; v_n bigint; BEGIN" + B.identity_state_sql() + "\n  RAISE NOTICE 'IDGATE %', array_to_string(v_fail, ' | '); IF cardinality(v_fail) > 0 THEN RAISE EXCEPTION 'IDGATE_FAIL %', array_to_string(v_fail, ' | '); END IF; END $g$;"

SQL = (HERE / "10-homolog-identity-fixtures.sql.review").read_text()
ARB, FSF = "c809e74f-486b-44b2-b2f4-4088f53421bb", "dcf50a75-579a-4828-a0fc-1d8eadcb4b8a"
RH, T4, AD = "86a2b787-83e8-4274-934c-adc8440339cc", "321e643b-e5c7-4b08-bf2d-be3aaaade53e", "c95f9261-a3bb-48f2-80e6-bb653e4b916f"
PA, PA2, PX = 'e770d10e-5efc-46e3-9b03-fdd6b982a6f1', H.U(62), H.U(63)   # PA = id real confirmado READ ONLY

SCHEMA = f"""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','consultor','financeiro','superadmin','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, nome text, partner_account_id uuid, ativo boolean, responsavel_user_id uuid,
  status text, cnpj text, cnpj_normalizado text);
CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE, nome text NOT NULL DEFAULT 'x',
  email text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), ativo boolean NOT NULL DEFAULT true,
  cliente_id uuid, data_admissao date, observacoes_internas text, organization_id uuid REFERENCES public.organizations(id), senha_provisoria boolean NOT NULL DEFAULT false);
CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL, CONSTRAINT user_roles_user_id_role_key UNIQUE(user_id,role));
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, razao_social text NOT NULL, cnpj text, ativo boolean NOT NULL DEFAULT true,
  deleted_at timestamptz, commercial_owner_organization_id uuid);
CREATE TABLE public.partner_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), papel text NOT NULL DEFAULT 'gestor' CHECK (papel = ANY (ARRAY['gestor','tecnico'])),
  valid_from timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, revoked_by uuid, revoke_reason text, tenant_id uuid, version integer NOT NULL DEFAULT 1,
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL)));
CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
 AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
-- corpos reais (migrations do repo / captura)
CREATE FUNCTION public.guard_profile_sensitive_fields() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $f$ BEGIN IF current_user IN ('postgres','service_role','supabase_auth_admin') THEN RETURN NEW; END IF; IF public.has_role(auth.uid(),'administrador'::public.app_role) THEN RETURN NEW; END IF; IF TG_OP='INSERT' THEN IF NEW.ativo IS DISTINCT FROM true OR NEW.cliente_id IS NOT NULL OR NEW.organization_id IS NOT NULL OR NEW.data_admissao IS NOT NULL OR NEW.observacoes_internas IS NOT NULL THEN RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501'; END IF; ELSE IF OLD.ativo IS NOT TRUE OR ROW(NEW.id,NEW.user_id,NEW.email,NEW.ativo,NEW.cliente_id,NEW.organization_id,NEW.created_at,NEW.data_admissao,NEW.observacoes_internas) IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.email,OLD.ativo,OLD.cliente_id,OLD.organization_id,OLD.created_at,OLD.data_admissao,OLD.observacoes_internas) THEN RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501'; END IF; END IF; RETURN NEW; END; $f$;
CREATE TRIGGER guard_profile_sensitive_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_sensitive_fields();
CREATE FUNCTION public.h15_profile_organization_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $h15$
BEGIN IF current_setting('role',true) IN ('authenticated','anon') THEN IF TG_OP='INSERT' THEN IF NEW.organization_id IS NOT NULL THEN RAISE EXCEPTION 'H15_ORGANIZATION_PROVISIONING_REQUIRED' USING ERRCODE='42501'; END IF;
 ELSIF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'H15_ORGANIZATION_PROVISIONING_REQUIRED' USING ERRCODE='42501'; END IF; END IF; RETURN NEW; END $h15$;
CREATE TRIGGER h15_profile_organization_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.h15_profile_organization_guard();
CREATE TABLE public.user_clientes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, cliente_id uuid NOT NULL,
  principal boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), is_active boolean NOT NULL DEFAULT true, UNIQUE(user_id,cliente_id));
-- gate canônico (corpos de produção capturados: live-gate-deps.json / pacote pref1-3); touch_related_profiles não capturado -> omitido
CREATE SCHEMA cf_user_guards_v1;
CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), revision bigint NOT NULL DEFAULT 0);
INSERT INTO cf_user_guards_v1.state DEFAULT VALUES;
CREATE FUNCTION cf_user_guards_v1.acquire_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass,'auth.users'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS NULL THEN RAISE EXCEPTION 'user_edit_forbidden' USING ERRCODE='42501'; END IF;
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 RETURN NULL;
END $function$;
CREATE FUNCTION cf_user_guards_v1.advance_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
BEGIN NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond'); RETURN NEW; END $function$;
CREATE FUNCTION cf_user_guards_v1.require_admin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r USING(user_id) WHERE p.ativo IS TRUE AND r.role='administrador') THEN RAISE EXCEPTION 'user_last_active_admin' USING ERRCODE='PT409'; END IF;
 RETURN NULL;
END $function$;
CREATE TRIGGER z99_cf_profile_stamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.advance_stamp();
CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();
CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();
-- captura homolog 02/11: gate de statement SOMENTE em partner_users; profiles/user_roles/user_clientes sem gate
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR UPDATE OR DELETE ON public.partner_users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT, UPDATE ON public.profiles TO authenticated; GRANT SELECT ON public.user_roles TO authenticated;
"""

SEED = f"""
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000077','terceiro@x.com',now()), ('{RH}','rh@refilinformatica.com.br',now()),('{T4}','teste4@refilinformatica.com.br',now()),('{AD}','arbiotecnologia@gmail.com',now());
INSERT INTO public.organizations(id,nome,ativo,status,cnpj_normalizado,responsavel_user_id,partner_account_id) VALUES
 ('{ARB}','AR Bio',true,'onboarding',NULL,'{AD}',NULL),('{FSF}','FSF',true,'ativa','11222333000181','{T4}',NULL);
INSERT INTO public.partner_accounts VALUES ('{PA}','FSF Agro','11.222.333/0001-81',true,NULL,'{ARB}'),('{PX}','Outro',NULL,true,NULL,'{FSF}');
WITH p AS (INSERT INTO public.profiles(user_id,organization_id) VALUES ('00000000-0000-0000-0000-000000000077','{FSF}'),('{RH}',NULL),('{T4}','{FSF}'),('{AD}','{ARB}')) INSERT INTO public.user_roles(user_id,role) VALUES ('{T4}','administrador'),('{AD}','administrador');
"""

STATE = f"""SELECT json_build_object(
 'rh_org',(SELECT organization_id FROM public.profiles WHERE user_id='{RH}'),
 'rh_roles',(SELECT array_agg(role::text ORDER BY role) FROM public.user_roles WHERE user_id='{RH}'),
 't4_org',(SELECT organization_id FROM public.profiles WHERE user_id='{T4}'),
 't4_roles',(SELECT array_agg(role::text ORDER BY role) FROM public.user_roles WHERE user_id='{T4}'),
 't4_link',(SELECT partner_id||'/'||papel||'/'||coalesce(tenant_id::text,'-') FROM public.partner_users WHERE user_id='{T4}'),
 'ad',(SELECT organization_id||':'||public.has_role('{AD}','administrador') FROM public.profiles WHERE user_id='{AD}'),
 'fsf_resp',(SELECT responsavel_user_id FROM public.organizations WHERE id='{FSF}'))"""

checks = []
def check(cid, exp, act):
    r = dict(id=cid, expected=exp, actual=act, status="PASS" if exp == act else "FAIL", kind="PG_DISPOSABLE_SYNTHETIC_AUTH")
    checks.append(r); print(json.dumps(r, ensure_ascii=False)[:400])

def fresh(extra=""):
    pg = H.PG(); pg.sql(SCHEMA); pg.sql(SEED + extra); return pg

def err(out):
    return out.split("IDFX_")[1].split(":")[0] + ":" + out.split("IDFX_")[1].split(":")[1].strip()[:40] if "IDFX_" in out else out[:80]

TARGET = {"rh_org": FSF, "rh_roles": ["administrador"], "t4_org": ARB, "t4_roles": ["parceiro_b2b"],
          "t4_link": f"{PA}/gestor/{ARB}", "ad": f"{ARB}:true", "fsf_resp": T4}

pg = fresh()
try:
    before = json.loads(pg.sql(STATE))
    r = pg.sql(IDGATE, ok=False)
    check("IDFX-GATE-RED fragmento de identidade do gate do catálogo recusa estado inicial", True, r.startswith("ERR") and "identity_fixtures_not_applied" in r)
    out = pg.sql(SQL, ok=False)
    r = pg.sql(IDGATE, ok=False)
    check("IDFX-GATE fragmento de identidade do gate do catálogo aprova o estado final do 10", "OK", "OK" if not r.startswith("ERR") else r[-600:])
    check("IDFX-01 aplica estado alvo", TARGET, json.loads(pg.sql(STATE)))
    check("IDFX-02 aviso responsável sem escrita em organizations", True, "ERR" not in out and before["fsf_resp"] == T4)
    check("IDFX-03 ledger antes/depois + invariância", ["arbio_admin_invariant", "rh_initial_to_final", "t4_initial_to_final", "third_party_invariant"],
          sorted(pg.sql("SELECT string_agg(step,',') FROM platform_private.homolog_identity_fixture_ledger").split(",")))
    pg.sql(SQL); check("IDFX-04 reexecução idempotente (no-op)", [TARGET, "4"],
                       [json.loads(pg.sql(STATE)), pg.sql("SELECT count(*) FROM platform_private.homolog_identity_fixture_ledger")])
    r = pg.sql(f"SET role authenticated; SELECT set_config('test.uid','{T4}',false); UPDATE public.profiles SET organization_id='{FSF}' WHERE user_id='{T4}';", ok=False)
    check("IDFX-05 guardas reais impedem autorreatribuição pós-correção", True, ("profile_sensitive_fields_forbidden" in r or "H15_ORGANIZATION_PROVISIONING_REQUIRED" in r) and r.startswith("ERR"))
finally:
    pg.stop()

NEG = [
    ("IDFX-10 projeto errado (empresa de produção presente)", "INSERT INTO public.organizations(id,nome) VALUES ('8f57c7dd-0557-4041-b401-7a00f7244626','prod');", "PRE:id de produção"),
    ("IDFX-11 sem conta de parceiro FSF da AR Bio", f"DELETE FROM public.partner_accounts WHERE id='{PA}';", "PRE:conta de parceiro FSF"),
    ("IDFX-12 conta ambígua", f"INSERT INTO public.partner_accounts VALUES ('{PA2}','FSF 2','11222333000181',true,NULL,'{ARB}');", "PRE:conta de parceiro FSF"),
    ("IDFX-13 conta da FSF (não AR Bio) não serve", f"UPDATE public.partner_accounts SET commercial_owner_organization_id='{FSF}' WHERE id='{PA}';", "PRE:conta de parceiro FSF"),
    ("IDFX-14 vínculo revogado do teste4 não é sobrescrito", f"INSERT INTO public.partner_users(partner_id,user_id,revoked_at,revoked_by,revoke_reason) VALUES ('{PA}','{T4}',now(),'{AD}','x');", "PRE:teste4 em estado não previs"),
    ("IDFX-15 rh com papel inesperado", f"INSERT INTO public.user_roles(user_id,role) VALUES ('{RH}','gestor');", "PRE:rh em estado não previsto"),
    ("IDFX-16 admin AR Bio alterado", f"DELETE FROM public.user_roles WHERE user_id='{AD}';", "PRE:admin AR Bio fora do estado"),
    ("IDFX-17 email Auth divergente", f"UPDATE auth.users SET email='outro@x.com' WHERE id='{RH}';", "PRE:uid/email Auth divergente"),
    ("IDFX-18 email não confirmado", f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{RH}';", "PRE:email não confirmado"),
    ("IDFX-19 teste4 com papel técnico", f"INSERT INTO public.user_roles(user_id,role) VALUES ('{T4}','parceiro_b2b_tecnico');", "PRE:teste4 em estado não previs"),
    ("IDFX-22 mistura: teste4 admin + gestor", f"INSERT INTO public.user_roles(user_id,role) VALUES ('{T4}','gestor');", "PRE:teste4 em estado não previs"),
    ("IDFX-23 mistura: teste4 papel final com empresa FSF", f"DELETE FROM public.user_roles WHERE user_id='{T4}'; INSERT INTO public.user_roles(user_id,role) VALUES ('{T4}','parceiro_b2b');", "PRE:teste4 em estado não previs"),
    ("IDFX-24 teste4 com vínculo de cliente extra", f"INSERT INTO public.user_clientes(user_id,cliente_id) VALUES ('{T4}','{H.U(70)}');", "PRE:teste4 com vínculos extras"),
    ("IDFX-25 rh com vínculo de cliente extra", f"INSERT INTO public.user_clientes(user_id,cliente_id) VALUES ('{RH}','{H.U(70)}');", "PRE:rh com vínculos extras/inat"),
    ("IDFX-26 rh final com papel a mais", f"UPDATE public.profiles SET organization_id='{FSF}' WHERE user_id='{RH}'; INSERT INTO public.user_roles(user_id,role) VALUES ('{RH}','administrador'),('{RH}','financeiro');", "PRE:rh em estado não previsto"),
    ("IDFX-27 gate de statement de partner_users desabilitado", "ALTER TABLE public.partner_users DISABLE TRIGGER a00_cf_user_gate;", "PRE:gate de statement em partner"),
    ("IDFX-27b gate removido de partner_users", "DROP TRIGGER a00_cf_user_gate ON public.partner_users;", "PRE:gate de statement em partner"),
    ("IDFX-RED1 rh {administrador,financeiro} (inicial sem empresa)", f"INSERT INTO public.user_roles(user_id,role) VALUES ('{RH}','administrador'),('{RH}','financeiro');", "PRE:rh em estado não previsto"),
    ("IDFX-RED2 teste4 só {gestor}", f"DELETE FROM public.user_roles WHERE user_id='{T4}'; INSERT INTO public.user_roles(user_id,role) VALUES ('{T4}','gestor');", "PRE:teste4 em estado não previs"),
    ("IDFX-RED3 teste4 {parceiro_b2b,administrador}", f"INSERT INTO public.user_roles(user_id,role) VALUES ('{T4}','parceiro_b2b');", "PRE:teste4 em estado não previs"),
    ("IDFX-28 guarda de perfil desabilitada", "ALTER TABLE public.profiles DISABLE TRIGGER guard_profile_sensitive_fields;", "PRE:guardas de perfil ausentes"),
    ("IDFX-29 teste4 final com vínculo técnico", f"UPDATE public.profiles SET organization_id='{ARB}' WHERE user_id='{T4}'; DELETE FROM public.user_roles WHERE user_id='{T4}'; INSERT INTO public.user_roles(user_id,role) VALUES ('{T4}','parceiro_b2b'); INSERT INTO public.partner_users(partner_id,user_id,papel,tenant_id) VALUES ('{PA}','{T4}','tecnico','{ARB}');", "PRE:teste4 em estado não previs"),
    ("IDFX-PA1 conta única por CNPJ mas id diferente do confirmado", f"UPDATE public.partner_users SET partner_id=partner_id WHERE false; UPDATE public.partner_accounts SET id='{PA2}' WHERE id='{PA}';", "PRE:conta de parceiro FSF resolvida"),
    ("IDFX-PA2 mesmo nome, CNPJ/vínculo divergentes não serve", f"UPDATE public.partner_accounts SET cnpj='99888777000166' WHERE id='{PA}';", "PRE:conta de parceiro FSF da AR B"),
    ("IDFX-20 rh em outra empresa", f"UPDATE public.profiles SET organization_id='{ARB}' WHERE user_id='{RH}';", "PRE:rh em estado não previsto"),
]
for cid, extra, exp in NEG:
    pg = fresh(extra)
    try:
        before = pg.sql(STATE); out = pg.sql(SQL, ok=False)
        check(cid, [exp, True, "f"], [err(out)[:len(exp)], pg.sql(STATE) == before,
              pg.sql("SELECT to_regclass('platform_private.homolog_identity_fixture_ledger') IS NOT NULL")])
    finally:
        pg.stop()

# vínculo pela conta indicada em organizations.partner_account_id (sem CNPJ)
pg = fresh(f"UPDATE public.organizations SET cnpj_normalizado=NULL, partner_account_id='{PA}' WHERE id='{FSF}';")
try:
    pg.sql(SQL); check("IDFX-21 conta identificada por partner_account_id", f"{PA}/gestor/{ARB}", json.loads(pg.sql(STATE))["t4_link"])
finally:
    pg.stop()

# concorrência: com o roteiro segurando o gate, writer concorrente de papéis espera (lock_timeout) e nada vaza
import subprocess, time
pg = fresh()
try:
    held = SQL.replace("\nCOMMIT;", "\nSELECT pg_sleep(8);\nCOMMIT;")
    proc = subprocess.Popen(["psql", "-X", "-q", "-h", pg.d, "-p", pg.port, "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    proc.stdin.write(held); proc.stdin.close(); time.sleep(1.5)
    r = pg.sql(f"SET lock_timeout='800ms'; INSERT INTO public.user_roles(user_id,role) VALUES ('{T4}','gestor');", ok=False)
    r2 = pg.sql(f"SET lock_timeout='800ms'; INSERT INTO public.partner_users(partner_id,user_id) VALUES ('{PA}','{RH}');", ok=False)
    r3 = pg.sql(f"SET lock_timeout='800ms'; UPDATE public.profiles SET ativo=ativo WHERE user_id='{AD}';", ok=False)
    r4 = pg.sql(f"SET lock_timeout='800ms'; INSERT INTO public.user_clientes(user_id,cliente_id) VALUES ('{AD}','{H.U(71)}');", ok=False)
    proc.wait(30)
    check("IDFX-30 writers concorrentes (com e sem gate: user_roles/partner_users/profiles/user_clientes) bloqueados", [True, True, True, True, 0, TARGET],
          ["lock timeout" in r, "lock timeout" in r2, "lock timeout" in r3, "lock timeout" in r4, proc.returncode, json.loads(pg.sql(STATE))])
finally:
    pg.stop()

out = pathlib.Path(sys.argv[0]).parent / "run-result.json"
res = dict(pass_=sum(c["status"] == "PASS" for c in checks), fail=sum(c["status"] != "PASS" for c in checks), checks=checks)
(HERE / "run-result.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
print("PASS", res["pass_"], "FAIL", res["fail"]); sys.exit(1 if res["fail"] else 0)
