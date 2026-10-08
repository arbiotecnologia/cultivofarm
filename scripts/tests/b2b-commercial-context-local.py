"""Executes the candidate resolver in PostgreSQL; synthetic Auth is not JWT/browser proof."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]

def main():
    tmp = Path(tempfile.mkdtemp(prefix="b2b-context-", dir="/tmp"))
    tmp.chmod(0o777)
    prefix = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
    data = tmp / "data"
    started = False
    try:
        subprocess.run(prefix + ["initdb", "-D", str(data), "-A", "trust", "-U", "local_audit"], check=True, capture_output=True)
        subprocess.run(prefix + ["pg_ctl", "-D", str(data), "-l", str(tmp / "server.log"), "-o", f'-k {tmp} -h "" -p 55485', "start"], check=True, capture_output=True)
        started = True
        sql = r"""
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private; GRANT USAGE ON SCHEMA platform_private TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE public.profiles(user_id uuid,organization_id uuid,ativo boolean,senha_provisoria boolean);
CREATE TABLE public.user_roles(user_id uuid,role text);
CREATE TABLE public.organizations(id uuid,ativo boolean,status text,partner_account_id uuid);
CREATE TYPE public.app_role AS ENUM ('administrador','parceiro_b2b','parceiro_b2b_tecnico');
CREATE TABLE public.partner_accounts(id uuid,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz,codigo text DEFAULT 'P1',razao_social text DEFAULT 'Synthetic Partner',nome_fantasia text);
CREATE TABLE public.partner_users(user_id uuid,partner_id uuid,papel text);
CREATE TABLE public.user_access_preferences(user_id uuid,preferred_context text,last_context text,skip_context_selector boolean);
CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.fresh',true)='true' AND EXISTS(SELECT 1 FROM public.profiles WHERE user_id=$1 AND ativo IS TRUE AND senha_provisoria IS FALSE) $$;
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$ SELECT organization_id FROM public.profiles WHERE user_id=auth.uid() AND platform_private.platform_actor_access_ready(user_id) $$;
CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql AS $$ SELECT 'catalogo_precos' WHERE current_setting('test.entitled',true)='true' $$;
CREATE FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.legacy',true)='true' $$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2::text) $$;
"""
        sql += (ROOT / "scripts/rbac-audit/b2b-commercial-context.sql").read_text()
        sql += (ROOT / "scripts/rbac-audit/b2b-commercial-portal.sql").read_text()
        sql += (ROOT / "scripts/rbac-audit/b2b-commercial-available-contexts.sql").read_text()
        sql += r"""
INSERT INTO public.organizations VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,'ativa',NULL),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,'ativa',NULL);
INSERT INTO public.partner_accounts(id,commercial_owner_organization_id,ativo,deleted_at) VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,NULL),('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,NULL),('33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,NULL);
INSERT INTO public.profiles VALUES('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,false);
INSERT INTO public.user_roles VALUES('44444444-4444-4444-8444-444444444444','parceiro_b2b');
INSERT INTO public.partner_users VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','gestor');
SELECT set_config('test.uid','44444444-4444-4444-8444-444444444444',true),set_config('test.fresh','true',true),set_config('test.entitled','true',true),set_config('test.legacy','false',true);
CREATE FUNCTION pg_temp.assert_true(name text,result boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',name; END IF; RAISE NOTICE 'PASS %',name; END $$;
SELECT pg_temp.assert_true('commercial owner without organization partner binding',public.get_my_commercial_partner_context()->>'mode'='commercial_owner');
-- Actual RLS test consumer: only own partner; no runtime policy expansion.
CREATE TABLE public.test_orders(id int,partner_id uuid);
GRANT SELECT ON public.test_orders TO authenticated;
ALTER TABLE public.test_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON public.test_orders TO authenticated USING(partner_id=(public.get_my_commercial_partner_context()->>'partner_id')::uuid);
INSERT INTO public.test_orders VALUES(1,'11111111-1111-4111-8111-111111111111'),(2,'22222222-2222-4222-8222-222222222222'),(3,'33333333-3333-4333-8333-333333333333');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('RLS own 1 same tenant other 0 foreign 0',(SELECT array_agg(id) FROM public.test_orders)=ARRAY[1]);
RESET ROLE;
UPDATE public.partner_users SET partner_id='22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('RLS second partner only',(SELECT array_agg(id) FROM public.test_orders)=ARRAY[2]);
RESET ROLE;
UPDATE public.partner_users SET partner_id='33333333-3333-4333-8333-333333333333';
SELECT pg_temp.assert_true('foreign owner denied',public.get_my_commercial_partner_context() IS NULL);
UPDATE public.partner_users SET partner_id='11111111-1111-4111-8111-111111111111';
INSERT INTO public.user_roles VALUES(auth.uid(),'administrador');
SELECT pg_temp.assert_true('internal cumulative role denied',public.get_my_commercial_partner_context() IS NULL);
DELETE FROM public.user_roles WHERE role='administrador';
INSERT INTO public.user_roles VALUES(auth.uid(),'parceiro_b2b_tecnico');
SELECT pg_temp.assert_true('both B2B roles denied',public.get_my_commercial_partner_context() IS NULL);
DELETE FROM public.user_roles WHERE role='parceiro_b2b_tecnico';
UPDATE public.user_roles SET role='parceiro_b2b_tecnico'; UPDATE public.partner_users SET papel='tecnico';
SELECT pg_temp.assert_true('technical context no financial role',public.get_my_commercial_partner_context()->>'role'='parceiro_b2b_tecnico');
UPDATE public.partner_users SET papel='gestor';
SELECT pg_temp.assert_true('role link mismatch denied',public.get_my_commercial_partner_context() IS NULL);
UPDATE public.partner_users SET papel='tecnico';
INSERT INTO public.partner_users VALUES(auth.uid(),'22222222-2222-4222-8222-222222222222','tecnico');
SELECT pg_temp.assert_true('duplicate link denied',public.get_my_commercial_partner_context() IS NULL);
DELETE FROM public.partner_users WHERE partner_id='22222222-2222-4222-8222-222222222222';
UPDATE public.profiles SET ativo=false;
SELECT pg_temp.assert_true('inactive denied',public.get_my_commercial_partner_context() IS NULL);
UPDATE public.profiles SET ativo=true,senha_provisoria=true;
SELECT pg_temp.assert_true('first access barrier',public.get_my_commercial_partner_context() IS NULL);
UPDATE public.profiles SET senha_provisoria=false;
SELECT set_config('test.fresh','false',true);
SELECT pg_temp.assert_true('stale session denied',public.get_my_commercial_partner_context() IS NULL);
SELECT set_config('test.fresh','true',true),set_config('test.entitled','false',true);
SELECT pg_temp.assert_true('missing entitlement denied',public.get_my_commercial_partner_context() IS NULL);
SELECT set_config('test.entitled','true',true);
UPDATE public.partner_accounts SET commercial_owner_organization_id=NULL WHERE id='11111111-1111-4111-8111-111111111111';
SELECT pg_temp.assert_true('orphan owner denied',public.get_my_commercial_partner_context() IS NULL);
UPDATE public.partner_accounts SET commercial_owner_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',ativo=false WHERE id='11111111-1111-4111-8111-111111111111';
SELECT pg_temp.assert_true('inactive partner denied',public.get_my_commercial_partner_context() IS NULL);
UPDATE public.partner_accounts SET ativo=true WHERE id='11111111-1111-4111-8111-111111111111';
UPDATE public.organizations SET partner_account_id='22222222-2222-4222-8222-222222222222' WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT pg_temp.assert_true('conflicting organization binding denied',public.get_my_commercial_partner_context() IS NULL);
UPDATE public.organizations SET partner_account_id='11111111-1111-4111-8111-111111111111' WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE public.partner_accounts SET commercial_owner_organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' WHERE id='11111111-1111-4111-8111-111111111111';
SELECT pg_temp.assert_true('legacy unproven denied',public.get_my_commercial_partner_context() IS NULL);
SELECT set_config('test.legacy','true',true);
SELECT pg_temp.assert_true('legacy explicit proven branch',public.get_my_commercial_partner_context()->>'mode'='legacy_partner_tenant');
SELECT set_config('test.uid','',true);
SELECT pg_temp.assert_true('anonymous denied',public.get_my_commercial_partner_context() IS NULL);
SELECT pg_temp.assert_true('ACL anonymous closed',NOT has_function_privilege('anon','public.get_my_commercial_partner_context()','EXECUTE'));
SELECT pg_temp.assert_true('private core anonymous closed',NOT has_function_privilege('anon','platform_private.b2b_commercial_context()','EXECUTE'));
SELECT pg_temp.assert_true('public endpoint invoker',NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.get_my_commercial_partner_context()'::regprocedure));
SELECT set_config('test.uid','44444444-4444-4444-8444-444444444444',true),set_config('test.legacy','false',true);
UPDATE public.partner_accounts SET commercial_owner_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' WHERE id='11111111-1111-4111-8111-111111111111';
UPDATE public.organizations SET partner_account_id=NULL;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('projection own only',public.get_my_commercial_partner_projection()->>'id'='11111111-1111-4111-8111-111111111111');
SELECT pg_temp.assert_true('portal commercial exclusive B2B',public.get_my_available_portal_contexts()->'available_contexts'='["b2b"]'::jsonb);
SELECT pg_temp.assert_true('projection has no commercial discount',NOT (public.get_my_commercial_partner_projection() ? 'desconto_padrao'));
RESET ROLE;
UPDATE public.partner_users SET partner_id='22222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('projection second sibling only',public.get_my_commercial_partner_projection()->>'id'='22222222-2222-4222-8222-222222222222');
RESET ROLE;
UPDATE public.user_roles SET role='administrador';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('internal admin never gets partner context',public.get_my_available_portal_contexts()->'available_contexts'='["admin"]'::jsonb);
SELECT pg_temp.assert_true('preflight owner admin gate closed',public.b2b_provisioning_preflight('11111111-1111-4111-8111-111111111111','parceiro_b2b','gestor')->>'enabled'='false');
DO $$ BEGIN
 BEGIN PERFORM public.b2b_provisioning_preflight('33333333-3333-4333-8333-333333333333','parceiro_b2b','gestor'); RAISE EXCEPTION 'foreign owner accepted'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS preflight foreign owner denied'; END;
 BEGIN PERFORM public.b2b_provisioning_preflight('11111111-1111-4111-8111-111111111111','parceiro_b2b','tecnico'); RAISE EXCEPTION 'mismatch accepted'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS preflight papel mismatch denied'; END;
 BEGIN PERFORM public.b2b_provisioning_preflight('11111111-1111-4111-8111-111111111111','administrador','gestor'); RAISE EXCEPTION 'internal role accepted'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS preflight internal role denied'; END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true('projection anon no execute',NOT has_function_privilege('anon','public.get_my_commercial_partner_projection()','EXECUTE'));
SELECT pg_temp.assert_true('preflight anon no execute',NOT has_function_privilege('anon','public.b2b_provisioning_preflight(uuid,text,text)','EXECUTE'));
INSERT INTO public.user_roles VALUES(auth.uid(),'parceiro_b2b');
SELECT pg_temp.assert_true('mixed internal roles no B2B portal',NOT (public.get_my_available_portal_contexts()->'available_contexts' ? 'b2b'));
SELECT set_config('test.uid','',true);
SELECT pg_temp.assert_true('anonymous no portal contexts',public.get_my_available_portal_contexts()->'available_contexts'='[]'::jsonb);
ROLLBACK;
"""
        result = subprocess.run(["psql", "-h", str(tmp), "-p", "55485", "-U", "local_audit", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input=sql, text=True, capture_output=True)
        print(result.stderr)
        if result.returncode:
            raise RuntimeError("Local PostgreSQL contract failed")
    finally:
        if started:
            subprocess.run(prefix + ["pg_ctl", "-D", str(data), "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(tmp)

if __name__ == "__main__":
    main()