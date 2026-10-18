"""Isolated PostgreSQL contract checks. Not live RLS/JWT or faithful production security."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'docs/auditorias'

def main():
    tmp = Path(tempfile.mkdtemp(prefix='f2b-local-', dir='/tmp'))
    tmp.chmod(0o777)
    prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
    started = False
    def run(sql, success=True):
        r = subprocess.run(['psql','-h',str(tmp),'-p','55489','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True)
        if (r.returncode == 0) != success:
            raise RuntimeError(r.stderr)
        return r
    try:
        subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'server.log'),'-o',f'-k {tmp} -h "" -p 55489','start'],check=True,capture_output=True)
        started = True
        setup = r"""
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid,ativo boolean,senha_provisoria boolean);
CREATE TABLE public.platform_org_admin_invites(user_id uuid,access_operation_status text,access_valid_after timestamptz);
CREATE TYPE public.app_role AS ENUM ('parceiro_b2b','parceiro_b2b_tecnico','administrador','superadmin');
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz);
CREATE TABLE public.partner_users(user_id uuid,partner_id uuid,papel text,tenant_id uuid,revoked_at timestamptz,valid_from timestamptz,CONSTRAINT partner_users_user_id_key UNIQUE(user_id));
-- Exact production access-ready body collected read-only. Auth transport is synthetic.
CREATE FUNCTION platform_private.platform_actor_access_ready(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE)
 AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_user AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL AND auth.uid()=p_user AND to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint,0))<=i.access_valid_after)));
$function$;
CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
CREATE FUNCTION public.local_assert(label text,ok boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END $$;
"""
        baseline=(DOCS/'vinculos-b2b-f2b-baseline-20261018.sql').read_text()
        grants='\n'.join(f'REVOKE ALL ON FUNCTION public.{s} FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.{s} TO authenticated,service_role;' for s in ['get_user_partner_id()','get_partner_papel(uuid)','get_b2b_user_role_for_partner(uuid,uuid)','is_valid_b2b_partner_user(uuid,uuid)'])
        run(setup+baseline+grants)
        candidate=(DOCS/'vinculos-b2b-f2b-migracao-20261018.sql').read_text()
        # Full preflight parses/runs, refuses absent policy manifest (no invented approval).
        rejected=run(candidate,False)
        if 'F2B_POLICY_MANIFEST_DRIFT' not in rejected.stderr:
            raise RuntimeError('Expected manifest refusal: '+rejected.stderr)
        print('PASS expected full installer refusal: policy manifest absent in isolated schema')
        bodies=candidate.split('-- BEGIN SCALAR CANDIDATES\n')[1].split('-- END SCALAR CANDIDATES')[0]
        run(bodies)
        tests=r"""
BEGIN;
INSERT INTO profiles VALUES('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,false);
INSERT INTO user_roles VALUES('44444444-4444-4444-8444-444444444444','parceiro_b2b');
INSERT INTO partner_accounts VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,NULL),('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,NULL);
INSERT INTO partner_users VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','gestor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,now());
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true),set_config('request.jwt.claims','{"iat":9999999999}',true);
SELECT local_assert('one eligible link',get_user_partner_id()='11111111-1111-4111-8111-111111111111');
SELECT local_assert('own papel',get_partner_papel(auth.uid())='gestor');
SELECT local_assert('no impersonation',get_partner_papel('55555555-5555-4555-8555-555555555555') IS NULL);
UPDATE partner_users SET revoked_at=now();
SELECT local_assert('revoked',get_user_partner_id() IS NULL AND get_partner_papel(auth.uid()) IS NULL);
UPDATE partner_users SET revoked_at=NULL,valid_from=now()+interval '1 day';
SELECT local_assert('future validity',get_user_partner_id() IS NULL);
UPDATE partner_users SET valid_from=now(); UPDATE profiles SET ativo=false;
SELECT local_assert('inactive profile',get_user_partner_id() IS NULL);
UPDATE profiles SET ativo=true,senha_provisoria=true;
SELECT local_assert('first access',get_user_partner_id() IS NULL);
UPDATE profiles SET senha_provisoria=false,organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SELECT local_assert('cross tenant profile',get_user_partner_id() IS NULL);
UPDATE profiles SET organization_id=NULL;
SELECT local_assert('no profile tenant',get_user_partner_id() IS NULL);
UPDATE profiles SET organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE partner_accounts SET ativo=false WHERE id='11111111-1111-4111-8111-111111111111';
SELECT local_assert('inactive partner',get_user_partner_id() IS NULL);
UPDATE partner_accounts SET ativo=true,deleted_at=now() WHERE id='11111111-1111-4111-8111-111111111111';
SELECT local_assert('deleted partner',get_user_partner_id() IS NULL);
UPDATE partner_accounts SET deleted_at=NULL,commercial_owner_organization_id=NULL WHERE id='11111111-1111-4111-8111-111111111111';
SELECT local_assert('missing owner',get_user_partner_id() IS NULL);
UPDATE partner_accounts SET commercial_owner_organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' WHERE id='11111111-1111-4111-8111-111111111111';
SELECT local_assert('owner mismatch',get_user_partner_id() IS NULL);
UPDATE partner_accounts SET commercial_owner_organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' WHERE id='11111111-1111-4111-8111-111111111111';
INSERT INTO platform_org_admin_invites VALUES(auth.uid(),'processing',NULL);
SELECT local_assert('processing access operation',get_user_partner_id() IS NULL);
UPDATE platform_org_admin_invites SET access_operation_status=NULL,access_valid_after=now()+interval '1 day';
SELECT set_config('request.jwt.claims','{"iat":1}',true);
SELECT local_assert('stale first access token',get_user_partner_id() IS NULL);
DELETE FROM platform_org_admin_invites;
-- Only isolated schema; NEVER drop production UNIQUE to test cardinality.
ALTER TABLE partner_users DROP CONSTRAINT partner_users_user_id_key;
INSERT INTO partner_users VALUES(auth.uid(),'22222222-2222-4222-8222-222222222222','gestor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,now());
SELECT local_assert('two links scalar null',get_user_partner_id() IS NULL AND get_partner_papel(auth.uid()) IS NULL);
UPDATE partner_accounts SET ativo=false WHERE id='22222222-2222-4222-8222-222222222222';
SELECT local_assert('two unrevoked one eligible still null',get_user_partner_id() IS NULL);
UPDATE partner_users SET revoked_at=now() WHERE partner_id='22222222-2222-4222-8222-222222222222';
SELECT local_assert('one active plus history',get_user_partner_id()='11111111-1111-4111-8111-111111111111');
DELETE FROM partner_users;
SELECT local_assert('zero links',get_user_partner_id() IS NULL AND get_partner_papel(auth.uid()) IS NULL);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT local_assert('no actor',get_user_partner_id() IS NULL);
SELECT local_assert('anon cannot execute',NOT has_function_privilege('anon','public.get_user_partner_id()','EXECUTE'));
SELECT local_assert('grants retained',has_function_privilege('authenticated','public.get_partner_papel(uuid)','EXECUTE') AND has_function_privilege('service_role','public.get_partner_papel(uuid)','EXECUTE'));
ROLLBACK;
"""
        result=run(tests)
        print(result.stderr)
        if result.stderr.count('NOTICE:  PASS')!=22:
            raise RuntimeError('Unexpected assertion count')
        # Execute reviewer pre-proof against synthetic one eligible fixture; no live users.
        fixture=tests.split("SELECT set_config('request.jwt.claim.sub'")[0].replace('BEGIN;','')
        run(fixture)
        run((DOCS/'vinculos-b2b-f2b-preprova-20261018.sql').read_text())
        print('PASS pre-proof parsed and executed with isolated synthetic fixture, not hosted proof')
        run((DOCS/'vinculos-b2b-f2b-rollback-20261018.sql').read_text())
        checks="SELECT local_assert('exact rollback user helper',md5(pg_get_functiondef('public.get_user_partner_id()'::regprocedure))='77822b0ef57e42bfe9cd7075265402aa'); SELECT local_assert('exact rollback papel',md5(pg_get_functiondef('public.get_partner_papel(uuid)'::regprocedure))='c892ee1df845b69950344953757ab472');"
        print(run(checks).stderr)
        print('PASS local contract: 22 behavior assertions, 2 exact rollback hashes; no hosted RLS')
    finally:
        if started:
            subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True)
        shutil.rmtree(tmp)

if __name__=='__main__':
    main()
