"""Real canonical policy predicates on isolated tables; Auth transport is simulated.

This is not a replay of all production DDL/triggers or a JWT proof.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def main(lifecycle=False, channels=False, organizations=False):
    tmp = Path(tempfile.mkdtemp(prefix="b2b-real-rls-", dir="/tmp"))
    tmp.chmod(0o777)
    prefix = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
    started = False
    try:
        subprocess.run(prefix + ["initdb", "-D", str(tmp / "data"), "-A", "trust", "-U", "postgres"], check=True, capture_output=True)
        subprocess.run(prefix + ["pg_ctl", "-D", str(tmp / "data"), "-l", str(tmp / "server.log"), "-o", f'-k {tmp} -h "" -p 55486', "start"], check=True, capture_output=True)
        started = True
        sql = r"""
BEGIN;
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA auth,platform_private TO authenticated;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico');
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean, senha_provisoria boolean, updated_at timestamptz DEFAULT now(), nome text, email text, cliente_id uuid);
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE TABLE public.partner_users(user_id uuid,partner_id uuid,papel text);
CREATE TABLE public.organizations(id uuid,ativo boolean,status text DEFAULT 'ativa',partner_account_id uuid);
CREATE TABLE public.platform_org_admin_invites(id uuid DEFAULT gen_random_uuid(),access_operation_id uuid,user_id uuid,access_operation_status text,access_valid_after timestamptz,status text);
CREATE TABLE public.clientes(id uuid,organization_id uuid);
CREATE TABLE public.partner_accounts(id uuid,commercial_owner_organization_id uuid,client_id uuid,desconto_padrao numeric,limite_credito_brl numeric,ativo boolean DEFAULT true,deleted_at timestamptz);
GRANT SELECT ON public.partner_accounts,public.clientes TO authenticated;
ALTER TABLE public.partner_accounts ENABLE ROW LEVEL SECURITY;
-- Only Auth transport is mocked. Helpers below are live definitions copied
-- from canonical pg_get_functiondef, not a model of expected authorization.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('iat',coalesce(nullif(current_setting('request.jwt.claim.iat',true),'')::bigint,extract(epoch FROM now())::bigint)) $$;
CREATE FUNCTION platform_private.platform_actor_access_ready(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE)
 AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_user AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL AND auth.uid()=p_user AND to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint,0))<=i.access_valid_after)));
$$;
CREATE FUNCTION platform_private.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id));
$$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id);
$$;
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$ SELECT platform_private.h15_actor_organization(); $$;
CREATE FUNCTION public.get_user_partner_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT partner_id FROM public.partner_users WHERE user_id=auth.uid() LIMIT 1; $$;
CREATE FUNCTION pg_temp.assert_true(label text,result boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END $$;
INSERT INTO public.organizations(id,ativo) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
INSERT INTO public.partner_accounts(id,commercial_owner_organization_id,client_id,desconto_padrao,limite_credito_brl) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,25,1000),
 ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,50,2000),
 ('33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',NULL,75,3000);
INSERT INTO public.profiles(user_id,organization_id,ativo,senha_provisoria) VALUES ('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,false);
INSERT INTO public.user_roles VALUES ('44444444-4444-4444-8444-444444444444','parceiro_b2b_tecnico');
INSERT INTO public.partner_users VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','tecnico');
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
"""
        sql += (ROOT / "scripts/rbac-audit/b2b-partner-real-policies.sql").read_text()
        sql += r"""
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('real baseline technical reads own financial row',(SELECT desconto_padrao=25 AND limite_credito_brl=1000 FROM public.partner_accounts));
SELECT pg_temp.assert_true('real baseline excludes sibling and tenant B',(SELECT count(*) FROM public.partner_accounts)=1);
RESET ROLE;
"""
        sql += (ROOT / "scripts/rbac-audit/b2b-partner-row-containment.sql").read_text()
        sql += r"""
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('technical direct financial rows denied',(SELECT count(*) FROM public.partner_accounts)=0);
RESET ROLE;
UPDATE public.user_roles SET role='parceiro_b2b'; UPDATE public.partner_users SET papel='gestor';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('commercial manager direct rows denied projection required',(SELECT count(*) FROM public.partner_accounts)=0);
RESET ROLE;
UPDATE public.partner_users SET partner_id='22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('second partner same tenant direct rows denied',(SELECT count(*) FROM public.partner_accounts)=0);
RESET ROLE;
INSERT INTO public.user_roles VALUES(auth.uid(),'administrador');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('extra internal role cannot bypass containment',(SELECT count(*) FROM public.partner_accounts)=0);
RESET ROLE;
DELETE FROM public.user_roles WHERE role='administrador';
INSERT INTO public.partner_users VALUES(auth.uid(),'11111111-1111-4111-8111-111111111111','gestor');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('duplicate partner link cannot bypass containment',(SELECT count(*) FROM public.partner_accounts)=0);
RESET ROLE;
DELETE FROM public.user_roles; INSERT INTO public.user_roles VALUES(auth.uid(),'administrador');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('internal admin A still sees exactly two A partners',(SELECT count(*) FROM public.partner_accounts)=2);
SELECT pg_temp.assert_true('internal admin A cannot see tenant B',NOT EXISTS(SELECT 1 FROM public.partner_accounts WHERE commercial_owner_organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
RESET ROLE;
UPDATE public.profiles SET organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('legacy self-link branch survives internal tenant move baseline risk',(SELECT count(*) FROM public.partner_accounts)=2 AND EXISTS(SELECT 1 FROM public.partner_accounts WHERE commercial_owner_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
RESET ROLE;
"""
        # Canonical context body; only entitlement/legacy dependencies and Auth
        # transport are local stubs, not a claim of full production replay.
        sql += """
CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql AS $$ SELECT 'catalogo_precos'::text $$;
CREATE FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
"""
        sql += (ROOT / "scripts/rbac-audit/b2b-commercial-context.sql").read_text()
        sql += (ROOT / "scripts/rbac-audit/b2b-partner-self-coherence.sql").read_text()
        sql += r"""
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('internal admin B with residual duplicate links only sees tenant B',(SELECT array_agg(id) FROM public.partner_accounts)=ARRAY['33333333-3333-4333-8333-333333333333'::uuid]);
RESET ROLE;
DELETE FROM public.partner_users WHERE partner_id='22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('single residual LIMIT1 cannot authorize cross tenant',NOT EXISTS(SELECT 1 FROM public.partner_accounts WHERE commercial_owner_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
RESET ROLE;
UPDATE public.user_roles SET role='gestor_comercial';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('internal commercial role residual link cannot authorize cross tenant',(SELECT count(*) FROM public.partner_accounts)=1);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('anonymous actor cannot read',(SELECT count(*) FROM public.partner_accounts)=0);
RESET ROLE;
SELECT pg_temp.assert_true('anonymous cannot execute new helper',NOT has_function_privilege('anon','platform_private.b2b_direct_partner_row_allowed()','EXECUTE'));
"""
        if organizations:
            sql += (ROOT / "scripts/tests/b2b-organizations-local.sql").read_text()
            sql += (ROOT / "scripts/rbac-audit/b2b-organizations-containment.sql").read_text()
            sql += (ROOT / "scripts/tests/b2b-organizations-assertions.sql").read_text()
        if lifecycle:
            sql += (ROOT / "scripts/tests/b2b-provisioning-lifecycle-local.sql").read_text()
            sql += "UPDATE public.user_roles SET role='administrador';"
            sql += (ROOT / "scripts/tests/b2b-provisioning-real-triggers.sql").read_text()
            sql += (ROOT / "scripts/rbac-audit/b2b-provisioning-lifecycle.sql").read_text()
            sql += (ROOT / "scripts/tests/b2b-provisioning-lifecycle-assertions.sql").read_text()
        if channels:
            sql += (ROOT / "scripts/tests/b2b-latent-channels-local.sql").read_text()
            sql += (ROOT / "supabase/migrations/20260702170704_ba93e0c6-98f8-4598-b4d3-3fcd52182f3b.sql").read_text()
            message_source = (ROOT / "supabase/migrations/20260904130941_h7n_p1_rpc_guards.sql").read_text()
            sql += "CREATE OR REPLACE FUNCTION public.rpc_message_set_status" + message_source.split("CREATE OR REPLACE FUNCTION public.rpc_message_set_status", 1)[1].split("CREATE OR REPLACE FUNCTION public.rpc_partner_message_counters", 1)[0]
            sql += (ROOT / "scripts/tests/b2b-latent-channels-baseline.sql").read_text()
            sql += (ROOT / "scripts/rbac-audit/b2b-latent-channel-containment.sql").read_text()
            sql += (ROOT / "scripts/tests/b2b-latent-channels-assertions.sql").read_text()
        sql += "COMMIT;" if lifecycle else "ROLLBACK;"
        result = subprocess.run(["psql", "-X", "-h", str(tmp), "-p", "55486", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input=sql, text=True, capture_output=True)
        print(result.stderr)
        if result.returncode:
            raise RuntimeError("Real policy local replay failed")
        if lifecycle:
            import importlib.util
            spec = importlib.util.spec_from_file_location("b2b_concurrency", ROOT / "scripts/tests/b2b-provisioning-concurrency.py")
            if spec is None or spec.loader is None:
                raise RuntimeError("concurrency runner unavailable")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            module.run(["psql", "-X", "-qAt", "-h", str(tmp), "-p", "55486", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"])
    finally:
        if started:
            subprocess.run(prefix + ["pg_ctl", "-D", str(tmp / "data"), "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(tmp)


if __name__ == "__main__":
    main()