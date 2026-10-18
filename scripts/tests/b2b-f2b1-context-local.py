"""Real SQL candidates/baseline, synthetic Auth/dependencies; never hosted proof."""
from pathlib import Path
import os, shutil, subprocess, tempfile
ROOT=Path(__file__).resolve().parents[2]
D=ROOT/'docs/auditorias'
P='vinculos-b2b-f2b1-'
def main():
    tmp=Path(tempfile.mkdtemp(prefix='f2b1-',dir='/tmp')); tmp.chmod(0o777)
    prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
    started=False
    def run(sql,success=True):
        r=subprocess.run(['psql','-h',str(tmp),'-p','55490','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
        if (r.returncode==0)!=success: raise RuntimeError(r.stderr)
        return r
    try:
        subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'server.log'),'-o',f'-k {tmp} -h "" -p 55490','start'],check=True,capture_output=True); started=True
        # Reduced synthetic schema: no claim of parity/security guards/JWT transport.
        run(r"""
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE profiles(user_id uuid PRIMARY KEY,organization_id uuid,ativo boolean,senha_provisoria boolean);
CREATE TYPE app_role AS ENUM ('administrador','gestor_comercial','gestor','tecnico_agronomo','consultor_tecnico','parceiro_b2b','parceiro_b2b_tecnico','superadmin');
CREATE TABLE user_roles(user_id uuid,role app_role);
CREATE TABLE organizations(id uuid PRIMARY KEY,ativo boolean,status text,partner_account_id uuid);
CREATE TABLE partner_accounts(id uuid PRIMARY KEY,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz,codigo text DEFAULT 'P',razao_social text DEFAULT 'Synthetic',nome_fantasia text);
CREATE TABLE partner_users(user_id uuid,partner_id uuid,papel text,tenant_id uuid,valid_from timestamptz,revoked_at timestamptz,CONSTRAINT partner_users_user_id_key UNIQUE(user_id));
CREATE TABLE partner_clients(partner_id uuid,cliente_id uuid,active boolean);
CREATE TABLE partner_user_clients(user_id uuid,partner_id uuid,cliente_id uuid,user_role text,active boolean);
CREATE FUNCTION platform_private.platform_actor_access_ready(u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=u AND ativo AND NOT senha_provisoria) AND coalesce(current_setting('test.fresh',true),'true')='true' $$;
CREATE FUNCTION h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$ SELECT organization_id FROM public.profiles WHERE user_id=auth.uid() AND platform_private.platform_actor_access_ready(user_id) $$;
CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql AS $$ SELECT 'catalogo_precos' WHERE coalesce(current_setting('test.entitled',true),'true')='true' $$;
CREATE FUNCTION has_role(u uuid,r app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) AND platform_private.platform_actor_access_ready(u) $$;
CREATE FUNCTION is_platform_superadmin(u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT public.has_role(u,'superadmin') $$;
CREATE FUNCTION local_assert(label text,ok boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END $$;
""")
        baseline=(D/(P+'baseline-20261018.sql')).read_text()
        run(baseline+(D/'vinculos-b2b-f2b-baseline-20261018.sql').read_text())
        signatures=['platform_private.b2b_commercial_context()','platform_private.b2b_actor_scope(uuid)','platform_private.b2b_phase1_partner_visible(uuid,boolean)','platform_private.b2b_commercial_partner_projection()']
        run('\n'.join(f'REVOKE ALL ON FUNCTION {s} FROM PUBLIC; GRANT EXECUTE ON FUNCTION {s} TO authenticated,service_role;' for s in signatures))
        # Full candidate preflight must refuse missing production policy manifest.
        candidate=(D/(P+'b1b-migracao-20261018.sql')).read_text()
        rejection=run(candidate,False)
        if 'F2B1_POLICY_DRIFT' not in rejection.stderr: raise RuntimeError('Unexpected preflight refusal: '+rejection.stderr)
        print('PASS B1b full preflight refused missing policy manifest')
        run(candidate.split('-- BEGIN B1B CANDIDATE\n')[1].split('-- END B1B CANDIDATE')[0])
        sql=r"""
BEGIN;
INSERT INTO organizations VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,'ativa',NULL),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,'ativa','11111111-1111-4111-8111-111111111111'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,'ativa',NULL);
INSERT INTO partner_accounts(id,commercial_owner_organization_id,ativo) VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),('22222222-2222-4222-8222-222222222222','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
INSERT INTO profiles VALUES('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,false),('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,false),('66666666-6666-4666-8666-666666666666','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,false);
INSERT INTO user_roles VALUES('44444444-4444-4444-8444-444444444444','parceiro_b2b'),('55555555-5555-4555-8555-555555555555','parceiro_b2b_tecnico'),('66666666-6666-4666-8666-666666666666','administrador');
INSERT INTO partner_users VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','gestor','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now(),NULL),('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','tecnico','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now(),NULL);
SELECT set_config('test.uid','44444444-4444-4444-8444-444444444444',true);
SELECT local_assert('owner current context',platform_private.b2b_commercial_context()->>'mode'='commercial_owner');
SELECT local_assert('projection current',platform_private.b2b_commercial_partner_projection()->>'id'='11111111-1111-4111-8111-111111111111');
UPDATE partner_users SET revoked_at=now() WHERE user_id=auth.uid();
SELECT local_assert('revoked owner context',platform_private.b2b_commercial_context() IS NULL);
SELECT local_assert('revoked projection',platform_private.b2b_commercial_partner_projection() IS NULL);
UPDATE partner_users SET revoked_at=NULL,valid_from=now()+interval '1 day' WHERE user_id=auth.uid();
SELECT local_assert('future context',platform_private.b2b_commercial_context() IS NULL);
UPDATE partner_users SET valid_from=now(),tenant_id=NULL WHERE user_id=auth.uid();
SELECT local_assert('null tenant',platform_private.b2b_commercial_context() IS NULL);
UPDATE partner_users SET tenant_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' WHERE user_id=auth.uid();
SELECT local_assert('wrong owner tenant',platform_private.b2b_commercial_context() IS NULL);
UPDATE partner_users SET tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' WHERE user_id=auth.uid();
UPDATE profiles SET organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' WHERE user_id=auth.uid();
SELECT local_assert('valid legacy context preserved',platform_private.b2b_commercial_context()->>'mode'='legacy_partner_tenant');
SELECT local_assert('legacy keeps actor tenant',platform_private.b2b_commercial_context()->>'organization_id'='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
UPDATE partner_users SET revoked_at=now() WHERE user_id=auth.uid();
SELECT local_assert('legacy revoked blocked',platform_private.b2b_commercial_context() IS NULL);
UPDATE partner_users SET revoked_at=NULL WHERE user_id=auth.uid();
UPDATE organizations SET partner_account_id='22222222-2222-4222-8222-222222222222' WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SELECT local_assert('legacy wrong organization partner',platform_private.b2b_commercial_context() IS NULL);
UPDATE organizations SET partner_account_id='11111111-1111-4111-8111-111111111111' WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
UPDATE profiles SET ativo=false WHERE user_id=auth.uid();
SELECT local_assert('legacy inactive profile',platform_private.b2b_commercial_context() IS NULL);
UPDATE profiles SET ativo=true,senha_provisoria=true WHERE user_id=auth.uid();
SELECT local_assert('legacy first access',platform_private.b2b_commercial_context() IS NULL);
UPDATE profiles SET senha_provisoria=false WHERE user_id=auth.uid();
SELECT set_config('test.entitled','false',true);
SELECT local_assert('legacy no entitlement',platform_private.b2b_commercial_context() IS NULL);
SELECT set_config('test.entitled','true',true);
UPDATE partner_accounts SET ativo=false WHERE id='11111111-1111-4111-8111-111111111111';
SELECT local_assert('legacy inactive partner',platform_private.b2b_commercial_context() IS NULL);
UPDATE partner_accounts SET ativo=true,deleted_at=now() WHERE id='11111111-1111-4111-8111-111111111111';
SELECT local_assert('legacy deleted partner',platform_private.b2b_commercial_context() IS NULL);
UPDATE partner_accounts SET deleted_at=NULL WHERE id='11111111-1111-4111-8111-111111111111';
UPDATE user_roles SET role='parceiro_b2b_tecnico' WHERE user_id=auth.uid(); UPDATE partner_users SET papel='tecnico' WHERE user_id=auth.uid();
SELECT local_assert('legacy technical preserved',platform_private.b2b_commercial_context()->>'role'='parceiro_b2b_tecnico');
UPDATE partner_users SET papel='gestor' WHERE user_id=auth.uid();
SELECT local_assert('role papel mismatch',platform_private.b2b_commercial_context() IS NULL);
UPDATE partner_users SET papel='tecnico' WHERE user_id=auth.uid();
ALTER TABLE partner_users DROP CONSTRAINT partner_users_user_id_key;
INSERT INTO partner_users VALUES(auth.uid(),'22222222-2222-4222-8222-222222222222','tecnico','cccccccc-cccc-4ccc-8ccc-cccccccccccc',now(),NULL);
SELECT local_assert('multiple unrevoked fail closed',platform_private.b2b_commercial_context() IS NULL);
UPDATE partner_users SET revoked_at=now() WHERE partner_id='22222222-2222-4222-8222-222222222222';
SELECT local_assert('one plus revoked history',platform_private.b2b_commercial_context()->>'mode'='legacy_partner_tenant');
INSERT INTO user_roles VALUES(auth.uid(),'administrador');
SELECT local_assert('mixed role denied',platform_private.b2b_commercial_context() IS NULL);
DELETE FROM public.user_roles WHERE user_id=auth.uid() AND role='administrador';
UPDATE profiles SET organization_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' WHERE user_id=auth.uid();
SELECT local_assert('tenant C no legacy proof',platform_private.b2b_commercial_context() IS NULL);
-- BASELINE trigger demonstration: SQL target differs from actor, not impersonation proof.
SELECT set_config('test.uid','66666666-6666-4666-8666-666666666666',true);
CREATE TRIGGER trg_validate_puc BEFORE INSERT OR UPDATE ON partner_user_clients FOR EACH ROW EXECUTE FUNCTION validate_partner_user_client_fn();
INSERT INTO partner_clients VALUES('11111111-1111-4111-8111-111111111111','99999999-9999-4999-8999-999999999999',true);
INSERT INTO partner_user_clients VALUES('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','99999999-9999-4999-8999-999999999999',NULL,true);
SELECT local_assert('baseline actor differs target',(SELECT user_role FROM partner_user_clients)='parceiro_b2b_tecnico' AND auth.uid()<>'55555555-5555-4555-8555-555555555555'::uuid);
SELECT local_assert('target eligibility is not actor authorization',platform_private.b2b_assignment_identity_coherent('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
SELECT local_assert('target wrong tenant false',NOT platform_private.b2b_assignment_identity_coherent('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc'));
UPDATE partner_users SET revoked_at=now() WHERE user_id='55555555-5555-4555-8555-555555555555';
SELECT local_assert('known baseline revoked target still eligible',is_valid_b2b_partner_user('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111'));
UPDATE partner_user_clients SET active=false;
SELECT local_assert('baseline allows deactivate eligible revoked target',(SELECT active FROM partner_user_clients)=false);
UPDATE profiles SET ativo=false WHERE user_id='55555555-5555-4555-8555-555555555555';
DO $$ BEGIN
 BEGIN UPDATE partner_user_clients SET active=false; RAISE EXCEPTION 'UNEXPECTED_ACCEPT';
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM NOT LIKE 'Usuário % não é um usuário B2B válido do parceiro %' THEN RAISE; END IF;
 END;
 PERFORM local_assert('known baseline inactive target blocks cleanup',true);
END $$;
SELECT local_assert('admin no implicit context',platform_private.b2b_commercial_context() IS NULL);
UPDATE user_roles SET role='superadmin' WHERE user_id=auth.uid();
SELECT local_assert('superadmin no implicit context',platform_private.b2b_commercial_context() IS NULL);
SELECT set_config('test.uid','',true);
SELECT local_assert('no actor context',platform_private.b2b_commercial_context() IS NULL);
SELECT local_assert('anon ACL closed',NOT has_function_privilege('anon','platform_private.b2b_commercial_context()','EXECUTE'));
ROLLBACK;
"""
        r=run(sql); count=r.stderr.count('NOTICE:  PASS'); print(r.stderr)
        if count!=32: raise RuntimeError(f'Expected 32 got {count}')
        run((D/(P+'b1b-rollback-20261018.sql')).read_text())
        run("SELECT local_assert('exact context rollback',md5(pg_get_functiondef('platform_private.b2b_commercial_context()'::regprocedure))='02158d4204dea67308558f649113ba6d');")
        print('PASS 32 SQL assertions; exact baseline context rollback; synthetic Auth, no hosted RLS')
    finally:
        if started: subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True)
        shutil.rmtree(tmp)
if __name__=='__main__': main()
