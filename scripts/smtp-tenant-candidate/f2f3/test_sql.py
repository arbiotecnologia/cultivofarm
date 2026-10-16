"""Runs only disposable PostgreSQL, real candidate SQL, synthetic Auth/Vault. Never remote."""
from pathlib import Path
import subprocess,tempfile,os,shutil
R=Path(__file__).parent

def main():
 t=Path(tempfile.mkdtemp(dir='/tmp',prefix='smtp-f23-'));t.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 try:
  subprocess.run(prefix+['initdb','-D',str(t/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'-l',str(t/'log'),'-o',f'-k {t} -h "" -p 55494','start'],check=True,capture_output=True)
  base=(R.parent/'test_local.py').read_text().split('sql="""',1)[1].split('"""',1)[0]
  sql=base+"CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz); CREATE TABLE public.platform_org_admin_invites(user_id uuid,access_operation_status text,access_valid_after timestamptz);CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT jsonb_build_object('iat',extract(epoch FROM now())::bigint)$$; CREATE VIEW vault.decrypted_secrets AS SELECT id,'synthetic-only'::text decrypted_secret FROM vault.calls;"
  sql+=(R.parent/'20261016_smtp_t1.sql').read_text()
  original=Path('supabase/migrations/20260727035656_a798991d-480d-42a1-be84-e61b2d868f82.sql').read_text()
  sql+="CREATE TYPE comunicacao_canal AS ENUM('email','whatsapp','in_app','push'); CREATE TYPE comunicacao_outbox_status AS ENUM('pending','processing','sent','failed','cancelled','skipped','dead_letter'); CREATE TYPE comunicacao_evento_status AS ENUM('received','processed','skipped');"
  for name,end in [('comunicacao_eventos','CREATE OR REPLACE FUNCTION public.comunicacao_outbox_touch'),]:
   # Actual event + outbox DDL; FK-only template/rule dependencies mocked.
   sql+="CREATE TABLE comunicacao_regras(id uuid PRIMARY KEY);CREATE TABLE comunicacao_templates(id uuid PRIMARY KEY);"
   sql+=original[original.index('CREATE TABLE IF NOT EXISTS public.'+name):original.index(end)]
  sql+=Path('supabase/migrations/20261008041815_982505b2-b6f8-4351-a4ca-0185106a712b.sql').read_text().split('CREATE OR REPLACE FUNCTION platform_private.notification_outbox_closed()',1)[1]
  sql=sql.replace(" RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RETURN NULL; END $$;","CREATE OR REPLACE FUNCTION platform_private.notification_outbox_closed() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RETURN NULL; END $$;",1)
  sql+=(R/'20261016_smtp_f2f3.sql').read_text()*2
  sql+="REVOKE USAGE ON SCHEMA platform_private FROM service_role; CREATE FUNCTION platform_private.unrelated_service_core() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT 1$$;REVOKE ALL ON FUNCTION platform_private.unrelated_service_core() FROM PUBLIC;GRANT EXECUTE ON FUNCTION platform_private.unrelated_service_core() TO service_role;"
  delta=(R/'20261016_smtp_executor_schema_acl.sql').read_text()
  sql+=delta*2
  a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';u='11111111-1111-4111-8111-111111111111';v='22222222-2222-4222-8222-222222222222'
  key='33333333-3333-4333-8333-333333333333';key2='44444444-4444-4444-8444-444444444444'
  cfg='{"host":"smtp.provider.com","port":465,"tls_mode":"implicit_tls","username":"user","from_email":"sender@provider.com","reply_to":"","from_name":"Cultivo Farm"}'
  sql+=f"INSERT INTO organizations VALUES('{a}',true),('{b}',true);INSERT INTO profiles(user_id,organization_id) VALUES('{u}','{a}'),('{v}','{b}');INSERT INTO user_roles VALUES('{u}','administrador'),('{v}','administrador');INSERT INTO auth.users VALUES('{u}','admin@provider.com',now()),('{v}','other@provider.com',now());UPDATE platform_private.communication_tenant_email_review_gate SET approved=true;SELECT set_config('request.jwt.claim.sub','{u}',false);SET ROLE authenticated;SELECT public.tenant_email_settings_save(0,'{cfg}','synthetic-only');RESET ROLE;"
  sql+="""
CREATE FUNCTION pg_temp.ok(label text,result boolean) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label;END IF;RAISE NOTICE 'PASS %',label;END$$;
CREATE FUNCTION pg_temp.err(label text,q text,c text) RETURNS void LANGUAGE plpgsql AS $$DECLARE got text;BEGIN BEGIN EXECUTE q;EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS got=RETURNED_SQLSTATE;IF got=c THEN RAISE NOTICE 'PASS %',label;RETURN;END IF;RAISE EXCEPTION 'FAIL % code %',label,got;END;RAISE EXCEPTION 'FAIL % no error',label;END$$;
"""
  def actor(x):return f"SELECT set_config('request.jwt.claim.sub','{x}',false);SET ROLE authenticated;"
  def err(label,q,c):return f"SELECT pg_temp.err('{label}',$q${q}$q$,'{c}');"
  def claim(mode='connection',k=key,version=1,confirm='false'):return f"SELECT public.tenant_smtp_test_claim('{mode}',{version},'{k}',{confirm})"
  sql+=actor(u)+err('closed gate',claim(),'42501')+'RESET ROLE;UPDATE platform_private.tenant_smtp_test_gate SET approved=true;'
  sql+=actor(u)+err('CAS version',claim(version=2),'40001')+err('confirmation required',claim('send'),'22023')+err('no connection pass',claim('send',confirm='true'),'42501')
  sql+="RESET ROLE;CREATE TEMP TABLE work(v jsonb);GRANT ALL ON work TO authenticated,service_role;"+actor(u)+f"INSERT INTO work {claim()};"
  sql+="SELECT pg_temp.ok('replay never grants executor',("+claim().replace('SELECT ','',1)+")->>'replay'='true');"
  sql+=err('concurrent pending new key',claim(k=key2),'40001')+err('no client secret executor',f"SELECT public.tenant_smtp_test_prepare((SELECT (v->>'job_id')::uuid FROM work),(SELECT (v->>'fence')::uuid FROM work),'{u}')",'42501')+'RESET ROLE;'
  sql+=f"SELECT pg_temp.ok('job in existing outbox',(SELECT count(*) FROM comunicacao_outbox)=1);SELECT pg_temp.ok('no general worker grants',NOT has_function_privilege('authenticated','public.tenant_smtp_test_prepare(uuid,uuid,uuid)','EXECUTE'));"
  prep=f"SELECT public.tenant_smtp_test_prepare((SELECT (v->>'job_id')::uuid FROM work),(SELECT (v->>'fence')::uuid FROM work),'{u}')"
  sql+="SELECT pg_temp.ok('canonical service schema denied',NOT has_schema_privilege('service_role','platform_private','USAGE'));SELECT pg_temp.ok('dedicated service usage',has_schema_privilege('service_role','tenant_smtp_executor','USAGE'));SELECT pg_temp.ok('clients lack executor schema',NOT has_schema_privilege('authenticated','tenant_smtp_executor','USAGE') AND NOT has_schema_privilege('anon','tenant_smtp_executor','USAGE'));SELECT pg_temp.ok('only two dedicated cores',(SELECT count(*) FROM pg_proc WHERE pronamespace='tenant_smtp_executor'::regnamespace)=2);SET ROLE service_role;SELECT pg_temp.ok('real executor role',current_user='service_role');"
  sql+=err('unrelated private exec still blocked','SELECT platform_private.unrelated_service_core()','42501')+err('forged actor',prep.replace(u,v),'42501')+'RESET ROLE;'
  sql+=f"INSERT INTO platform_org_admin_invites VALUES('{u}','idle',clock_timestamp()+interval '1 minute');"
  sql+="SET ROLE service_role;"+err('stale actor invitation fence',prep,'42501')+"RESET ROLE;DELETE FROM platform_org_admin_invites;"
  sql+="SELECT pg_temp.ok('global worker cannot reclaim diagnostic',(SELECT bool_and(status='processing' AND lease_expires_at IS NULL AND max_attempts=1) FROM comunicacao_outbox));"
  sql+="SELECT pg_temp.ok('public executor is invoker',NOT(SELECT prosecdef FROM pg_proc WHERE oid='public.tenant_smtp_test_prepare(uuid,uuid,uuid)'::regprocedure));"
  sql+="SET ROLE service_role;SELECT pg_temp.ok('server confirmed recipient',("+prep.replace('SELECT ','',1)+")->>'recipient'='admin@provider.com');"
  sql+=err('executor cannot run twice',prep,'42501')
  finish=f"SELECT public.tenant_smtp_test_finish((SELECT (v->>'job_id')::uuid FROM work),(SELECT (v->>'fence')::uuid FROM work),'{u}','smtp_connection_ok')"
  sql+=finish+';'+finish+';RESET ROLE;'
  sql+=actor(u)+err('cooldown 60s',claim(k=key2),'40001')+"RESET ROLE;UPDATE platform_private.tenant_smtp_test_receipts SET created_at=clock_timestamp()-interval '61 seconds';"
  sql+=actor(u)+f"DELETE FROM work;INSERT INTO work {claim('send',key2,confirm='true')};RESET ROLE;SET ROLE service_role;"+prep+';'
  sql+=finish.replace('smtp_connection_ok','smtp_send_ambiguous')+';RESET ROLE;'
  sql+="UPDATE platform_private.tenant_smtp_test_receipts SET created_at=clock_timestamp()-interval '61 seconds';"
  sql+=actor(u)+err('ambiguity no blind resend',claim('send',key,confirm='true'),'40001')+'RESET ROLE;'
  for role in ['gestor','financeiro','cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico','superadmin']:
   sql+=f"UPDATE user_roles SET role='{role}' WHERE user_id='{u}';"+actor(u)+err(role+' denied',claim(),'42501')+'RESET ROLE;'
  sql+=f"UPDATE user_roles SET role='administrador' WHERE user_id='{u}';"
  sql+=actor(v)+err('other tenant CAS no data',claim(),'40001')+'RESET ROLE;'
  sql+=f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{u}';"+actor(u)+err('unconfirmed admin denied',claim(),'42501')+'RESET ROLE;'
  sql+="SELECT pg_temp.ok('DRAFT unchanged',(SELECT version=1 AND NOT dispatch_enabled AND NOT sender_verified FROM communication_tenant_email_settings));SELECT pg_temp.ok('private tickets consumed',(SELECT count(*) FROM platform_private.tenant_smtp_test_insert_tickets)=0);"
  sql+="""
SELECT pg_temp.ok('legacy outbox still contained', NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_insert_tickets));
"""
  sql+=(R/'rollback_executor_schema_acl.sql').read_text()*2
  sql+="SELECT pg_temp.ok('rollback dedicated usage closed',NOT has_schema_privilege('service_role','tenant_smtp_executor','USAGE'));SELECT pg_temp.ok('rollback private usage unchanged',NOT has_schema_privilege('service_role','platform_private','USAGE'));SELECT pg_temp.ok('rollback unrelated EXEC preserved',has_function_privilege('service_role','platform_private.unrelated_service_core()','EXECUTE'));"
  sql+=(R/'rollback.sql').read_text()
  sql+="SELECT pg_temp.ok('rollback gate closed',NOT(SELECT approved FROM platform_private.tenant_smtp_test_gate));SELECT pg_temp.ok('rollback preserves outbox',(SELECT count(*) FROM comunicacao_outbox)=2);SELECT pg_temp.ok('rollback revokes client',NOT has_function_privilege('authenticated','public.tenant_smtp_test_claim(text,bigint,uuid,boolean)','EXECUTE'));"
  run=subprocess.run(['psql','-X','-h',str(t),'-p','55494','-U','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
  print('\n'.join(x for x in run.stderr.splitlines() if 'PASS' in x or 'ERROR' in x));assert run.returncode==0,run.stderr[-2200:]
  # Two real concurrent connections in disposable PG only. Restore reviewed candidate
  # on the isolated backend, seed fresh B using synthetic Vault; never remote.
  cmd=['psql','-X','-h',str(t),'-p','55494','-U','postgres','-v','ON_ERROR_STOP=1']
  setup=(R/'20261016_smtp_f2f3.sql').read_text()+delta+f"UPDATE platform_private.tenant_smtp_test_gate SET approved=true;"+actor(v)+f"SELECT public.tenant_email_settings_save(0,'{cfg}','synthetic-only');RESET ROLE;"
  z=subprocess.run(cmd,input=setup,text=True,capture_output=True);assert z.returncode==0,z.stderr[-1000:]
  first=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  first.stdin.write("BEGIN;"+actor(v)+claim(k=key)+";SELECT pg_sleep(0.4);COMMIT;");first.stdin.close()
  import time
  time.sleep(0.12)
  second=subprocess.run(cmd,input=actor(v)+claim(k=key2)+";",text=True,capture_output=True)
  first.wait(timeout=10)
  assert first.returncode==0 and second.returncode!=0 and 'SMTP_BUSY' in second.stderr,'race must admit exactly one job'
  check=subprocess.run(cmd,input=f"SELECT count(*) FROM platform_private.tenant_smtp_test_receipts WHERE organization_id='{b}';",text=True,capture_output=True)
  assert '1' in check.stdout
  print('PASS two concurrent SQL sessions one claim, second SMTP_BUSY')
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(t)
if __name__=='__main__':main()
