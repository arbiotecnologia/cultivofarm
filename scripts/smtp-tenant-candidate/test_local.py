"""Disposable PostgreSQL only; actual candidate SQL, Auth/readiness/Vault stubs."""
from pathlib import Path
import os,subprocess,tempfile,shutil
ROOT=Path(__file__).parent

def main():
 tmp=Path(tempfile.mkdtemp(prefix='smtp-t1-',dir='/tmp'));tmp.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 try:
  subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55493','start'],check=True,capture_output=True)
  sql="""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA vault;
GRANT USAGE ON SCHEMA public,auth,platform_private TO authenticated,anon,service_role;
CREATE TYPE public.app_role AS ENUM('administrador','gestor','financeiro','cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico','superadmin');
CREATE TABLE public.organizations(id uuid PRIMARY KEY,ativo boolean DEFAULT true);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid,ativo boolean DEFAULT true,senha_provisoria boolean DEFAULT false);
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2)$$;
CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT public.has_role($1,'superadmin')$$;
CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=$1 AND ativo AND NOT senha_provisoria)$$;
-- Vault simulation ONLY: counts mutations, stores no secret value.
CREATE SEQUENCE vault.attempts;
CREATE TABLE vault.calls(id uuid PRIMARY KEY,rotations int NOT NULL DEFAULT 1);
CREATE FUNCTION vault.create_secret(text,text,text,uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$DECLARE v uuid:=gen_random_uuid(); BEGIN PERFORM nextval('vault.attempts'); IF $1='fail-vault' THEN RAISE EXCEPTION 'unsafe provider failure'; END IF; INSERT INTO vault.calls VALUES(v,1); RETURN v;END$$;
CREATE FUNCTION vault.update_secret(uuid,text,text,text,uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$BEGIN PERFORM nextval('vault.attempts'); IF $2='fail-vault' THEN RAISE EXCEPTION 'unsafe provider failure'; END IF;UPDATE vault.calls SET rotations=rotations+1 WHERE id=$1;END$$;
REVOKE ALL ON FUNCTION vault.create_secret(text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION vault.update_secret(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
"""
  candidate=(ROOT/'20261016_smtp_t1.sql').read_text()
  # Regression against exact identities: defaults allow 3/4 argument CALLS,
  # never make those shorter identities exist in pg_proc.
  sql+="""
DO $identities$ BEGIN
 IF to_regprocedure('vault.create_secret(text,text,text)') IS NOT NULL
 OR to_regprocedure('vault.update_secret(uuid,text,text,text)') IS NOT NULL
 OR to_regprocedure('vault.create_secret(text,text,text,uuid)') IS NULL
 OR to_regprocedure('vault.update_secret(uuid,text,text,text,uuid)') IS NULL THEN
  RAISE EXCEPTION 'FAIL Vault real signatures';
 END IF;
 RAISE NOTICE 'PASS Vault real identities and absent short overloads';
END $identities$;
"""
  sql+=candidate
  # Execute twice: additive migration idempotency (no body changes).
  sql+=(ROOT/'20261016_smtp_t1.sql').read_text()
  a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';u='11111111-1111-4111-8111-111111111111';v='22222222-2222-4222-8222-222222222222'
  cfg="""'{"host":"smtp.provider.com","port":465,"tls_mode":"implicit_tls","username":"user","from_email":"sender@provider.com","reply_to":"","from_name":"Cultivo Farm"}'::jsonb"""
  sql+=f"INSERT INTO organizations VALUES('{a}',true),('{b}',true);INSERT INTO profiles(user_id,organization_id) VALUES('{u}','{a}'),('{v}','{b}');INSERT INTO user_roles VALUES('{u}','administrador'),('{v}','administrador');"
  sql+="""
CREATE FUNCTION pg_temp.assert_true(label text,result boolean) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label;END IF;RAISE NOTICE 'PASS %',label;END$$;
CREATE FUNCTION pg_temp.expect_error(label text,query text,code text) RETURNS void LANGUAGE plpgsql AS $$DECLARE got text;BEGIN BEGIN EXECUTE query;EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS got=RETURNED_SQLSTATE;IF got=code THEN RAISE NOTICE 'PASS %',label;RETURN;END IF;RAISE EXCEPTION 'FAIL % unexpected code %',label,got;END;RAISE EXCEPTION 'FAIL % no error',label;END$$;
SELECT pg_temp.assert_true('private refs no client ACL',NOT has_table_privilege('authenticated','platform_private.communication_tenant_email_secret_refs','SELECT'));
SELECT pg_temp.assert_true('private refs no service ACL',NOT has_table_privilege('service_role','platform_private.communication_tenant_email_secret_refs','SELECT'));
SELECT pg_temp.assert_true('anon no RPC',NOT has_function_privilege('anon','public.tenant_email_settings_get()','EXECUTE'));
SELECT pg_temp.assert_true('service no RPC',NOT has_function_privilege('service_role','public.tenant_email_settings_save(bigint,jsonb,text)','EXECUTE'));
SELECT pg_temp.assert_true('public wrappers INVOKER',(SELECT count(*)=3 AND bool_and(NOT prosecdef) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('tenant_email_settings_scope','tenant_email_settings_get','tenant_email_settings_save')));
SELECT pg_temp.assert_true('private cores DEFINER',(SELECT count(*)=3 AND bool_and(prosecdef) FROM pg_proc WHERE pronamespace='platform_private'::regnamespace AND proname IN ('tenant_email_settings_scope','tenant_email_settings_get','tenant_email_settings_save')));
SELECT pg_temp.assert_true('private core anon service denied',NOT has_function_privilege('anon','platform_private.tenant_email_settings_save(bigint,jsonb,text)','EXECUTE') AND NOT has_function_privilege('service_role','platform_private.tenant_email_settings_save(bigint,jsonb,text)','EXECUTE'));
SELECT pg_temp.assert_true('no direct insert',NOT has_table_privilege('authenticated','public.communication_tenant_email_settings','INSERT'));
"""
  def actor(uid):return f"SELECT set_config('request.jwt.claim.sub','{uid}',false);SET ROLE authenticated;"
  sql+=actor(u)+f"DO $gate$ BEGIN BEGIN PERFORM public.tenant_email_settings_save(0,{cfg},'test-only');EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS database review gate OFF';RETURN;END;RAISE EXCEPTION 'FAIL database review gate';END $gate$;RESET ROLE;SELECT pg_temp.assert_true('gate rollback no Vault mutation',(SELECT count(*) FROM vault.calls)=0);"
  sql+=actor(u)+"SELECT pg_temp.expect_error('gate before invalid config',$q$SELECT public.tenant_email_settings_save(-1,NULL,'fail-vault')$q$,'42501');RESET ROLE;SELECT pg_temp.assert_true('gate prevents Vault ATTEMPT not just rollback',(SELECT is_called=false FROM vault.attempts));UPDATE platform_private.communication_tenant_email_review_gate SET approved=true WHERE id=true;"
  sql+=actor(u)+f"SELECT pg_temp.assert_true('admin A scope',public.tenant_email_settings_scope());SELECT pg_temp.assert_true('A empty draft',public.tenant_email_settings_get()->>'version'='0');SELECT pg_temp.assert_true('A save',public.tenant_email_settings_save(0,{cfg},'test-only')->>'version'='1');RESET ROLE;"
  sql+=actor(v)+f"SELECT pg_temp.assert_true('B empty independent',public.tenant_email_settings_get()->>'version'='0');SELECT pg_temp.assert_true('B RLS cannot read A',(SELECT count(*) FROM public.communication_tenant_email_settings)=0);SELECT pg_temp.assert_true('B save',public.tenant_email_settings_save(0,{cfg},'test-only')->>'version'='1');RESET ROLE;"
  sql+=actor(u)+f"SELECT pg_temp.assert_true('A RLS sees only A',(SELECT count(*) FROM public.communication_tenant_email_settings)=1);SELECT pg_temp.assert_true('A audit only A',(SELECT count(*) FROM public.communication_tenant_email_audit)=1);SELECT pg_temp.assert_true('rotation stays draft',public.tenant_email_settings_save(1,{cfg},'test-only-rotated')->>'dispatch_enabled'='false');"
  def error(label,query,code):return "SELECT pg_temp.expect_error('"+label+"',$q$"+query+"$q$,'"+code+"');"
  sql+=error('stale version no retry',f"SELECT public.tenant_email_settings_save(1,{cfg},'test-only')",'40001')
  sql+=error('Vault failure safe rollback',f"SELECT public.tenant_email_settings_save(2,{cfg},'fail-vault')",'P0001')
  sql+=error('injection rejected',f"SELECT public.tenant_email_settings_save(2,jsonb_set({cfg},'{{from_name}}',to_jsonb(E'bad\\r\\nDATA'::text)),'test-only')",'22023')
  sql+=error('forged organization key',f"SELECT public.tenant_email_settings_save(2,{cfg}||jsonb_build_object('organization_id','{b}'),'test-only')",'22023')
  sql+=error('direct mutation ACL',"UPDATE public.communication_tenant_email_settings SET dispatch_enabled=true",'42501')
  sql+="RESET ROLE;SELECT pg_temp.assert_true('atomic metadata version',(SELECT version FROM communication_tenant_email_settings WHERE organization_id='"+a+"')=2);SELECT pg_temp.assert_true('atomic Vault rollback',(SELECT sum(rotations) FROM vault.calls)=3);SELECT pg_temp.assert_true('no audit credential/value', (SELECT array_agg(column_name::text) FROM information_schema.columns WHERE table_schema='public' AND table_name='communication_tenant_email_audit') @> ARRAY['actor_id','action','version'] AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='communication_tenant_email_audit' AND column_name IN ('password','config','secret_id')));"
  for role in ['gestor','financeiro','cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico','superadmin']:
   sql+=f"UPDATE user_roles SET role='{role}' WHERE user_id='{u}';"+actor(u)+error(role+' save denied',f"SELECT public.tenant_email_settings_save(2,{cfg},'test-only')",'42501')+"SELECT pg_temp.assert_true('role RLS empty',(SELECT count(*) FROM communication_tenant_email_settings)=0);RESET ROLE;"
  sql+=f"UPDATE user_roles SET role='administrador' WHERE user_id='{u}';"
  for field,val in [('ativo','false'),('senha_provisoria','true'),('organization_id','NULL')]:
   restore="true" if field=='ativo' else "false" if field=='senha_provisoria' else f"'{a}'"
   sql+=f"UPDATE profiles SET {field}={val} WHERE user_id='{u}';"+actor(u)+error(field+' denied',"SELECT public.tenant_email_settings_get()",'42501')+f"RESET ROLE;UPDATE profiles SET {field}={restore} WHERE user_id='{u}';"
  sql+=f"UPDATE organizations SET ativo=false WHERE id='{a}';"+actor(u)+error('inactive organization denied',"SELECT public.tenant_email_settings_get()",'42501')+f"RESET ROLE;UPDATE organizations SET ativo=true WHERE id='{a}';"
  sql+=actor('')+error('no JWT denied',"SELECT public.tenant_email_settings_get()",'42501')+"RESET ROLE;"
  sql+=error('even owner cannot activate',f"UPDATE communication_tenant_email_settings SET dispatch_enabled=true,version=version+1 WHERE organization_id='{a}'",'22023')
  sql+=error('immutable audit',"UPDATE communication_tenant_email_audit SET action='other'",'42501')
  sql+=(ROOT/'rollback.sql').read_text()
  sql+="SELECT pg_temp.assert_true('rollback closes read',NOT has_table_privilege('authenticated','communication_tenant_email_settings','SELECT'));SELECT pg_temp.assert_true('rollback preserves rows',(SELECT count(*) FROM communication_tenant_email_settings)=2);SELECT pg_temp.assert_true('rollback preserves Vault',(SELECT count(*) FROM vault.calls)=2);"
  run=subprocess.run(['psql','-X','-h',str(tmp),'-p','55493','-U','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
  print('\n'.join(line for line in run.stderr.splitlines() if 'PASS' in line or 'ERROR' in line));assert run.returncode==0,run.stderr[-2500:]
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp)
if __name__=='__main__':main()
