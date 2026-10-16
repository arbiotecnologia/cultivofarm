"""Disposable PostgreSQL only. Reuses the F2/F3 harness setup verbatim, then applies F4 twice. Never remote."""
from pathlib import Path
import subprocess,tempfile,os,shutil,hashlib
R=Path(__file__).parent; F23=R.parent/'f2f3'
def harness_setup():
 src=(F23/'test_sql.py').read_text().splitlines()
 start=next(i for i,l in enumerate(src) if l.strip().startswith('base=(R.parent'))
 end=next(i for i,l in enumerate(src) if "tenant_email_settings_save(0,'{cfg}'" in l)
 ns={'R':F23,'Path':Path}
 exec('\n'.join(l[2:] for l in src[start:end+1]),ns)
 return ns
def main():
 ns=harness_setup();sql=ns['sql'];v,u,b,a=ns['u'],ns['v'],ns['a'],ns['b']  # v=configured Admin (org b), u=other tenant
 t=Path(tempfile.mkdtemp(dir='/tmp',prefix='smtp-f4-'));t.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 cmd=['psql','-X','-h',str(t),'-p','55495','-U','postgres','-v','ON_ERROR_STOP=1']
 try:
  subprocess.run(prefix+['initdb','-D',str(t/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'-l',str(t/'log'),'-o',f'-k {t} -h "" -p 55495','start'],check=True,capture_output=True)
  f4=(R/'20261016_smtp_f4_sender_activation.sql').read_text()
  sql+="RESET ROLE;"+f4+f4
  sql+="""
CREATE FUNCTION pg_temp.ok(label text,result boolean) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label;END IF;RAISE NOTICE 'PASS %',label;END$$;
CREATE FUNCTION pg_temp.err(label text,q text,c text) RETURNS void LANGUAGE plpgsql AS $$DECLARE got text;BEGIN BEGIN EXECUTE q;EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS got=RETURNED_SQLSTATE;IF got=c THEN RAISE NOTICE 'PASS %',label;RETURN;END IF;RAISE EXCEPTION 'FAIL % code %',label,got;END;RAISE EXCEPTION 'FAIL % no error',label;END$$;
CREATE TEMP TABLE w(k text PRIMARY KEY,v jsonb);GRANT ALL ON w TO authenticated,service_role;
"""
  def actor(x):return f"RESET ROLE;SELECT set_config('request.jwt.claim.sub','{x}',false);SET ROLE authenticated;"
  def err(l,q,c):return f"SELECT pg_temp.err('{l}',$q${q}$q$,'{c}');"
  def ok(l,q):return f"SELECT pg_temp.ok('{l}',{q});"
  K1='a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';K2='b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';K3='c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';CK='d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4'
  claim=lambda k,ver=1:f"SELECT public.tenant_smtp_sender_challenge_claim({ver},'{k}')"
  # ACL
  sql+="RESET ROLE;"+ok('anon no F4 RPC',"NOT has_function_privilege('anon','public.tenant_smtp_sender_challenge_claim(bigint,uuid)','EXECUTE')")
  sql+=ok('client cannot prepare',"NOT has_function_privilege('authenticated','public.tenant_smtp_sender_challenge_prepare(uuid,uuid,uuid,text,text)','EXECUTE')")
  sql+=ok('service cannot claim/confirm',"NOT has_function_privilege('service_role','public.tenant_smtp_sender_challenge_confirm(uuid,bigint,text)','EXECUTE')")
  sql+=ok('private tables closed',"NOT has_table_privilege('authenticated','platform_private.tenant_smtp_sender_challenges','SELECT') AND NOT has_table_privilege('service_role','platform_private.tenant_smtp_sender_challenges','SELECT')")
  sql+=ok('platform_private still closed to service',"NOT has_schema_privilege('service_role','platform_private','USAGE')")
  sql+=ok('public F4 wrappers INVOKER',"(SELECT bool_and(NOT prosecdef) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'tenant_smtp_%' AND proname ~ '(f4|sender|activation)')")
  # gate closed → unavailable
  sql+=actor(v)+err('F4 gate closed',claim(K1),'42501')
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_f4_gate SET approved=true;UPDATE platform_private.tenant_smtp_test_gate SET approved=true;"
  sql+=actor(v)+err('no connection PASS',claim(K1),'42501')+err('CAS version',claim(K1,2),'40001')
  sql+=actor(u)+err('cross-tenant actor without settings',claim(K1),'40001')
  # synthetic connection PASS receipt for v (org b, version 1)
  sql+=f"RESET ROLE;INSERT INTO comunicacao_eventos(id,event_key,source_type,source_id,created_by,idempotency_key,status,payload) VALUES('{CK}','tenant.smtp.diagnostic','tenant_smtp_diagnostic_v1','{b}','{v}','f4-fixture','processed','{{}}');"
  sql+="ALTER TABLE comunicacao_outbox DISABLE TRIGGER USER;"
  sql+=f"INSERT INTO comunicacao_outbox(id,event_id,template_chave,template_versao,template_snapshot,canal,recipient_user_id,status,idempotency_key) VALUES('{CK}','{CK}','t',1,'{{}}','email','{v}','dead_letter','f4-fixture');ALTER TABLE comunicacao_outbox ENABLE TRIGGER USER;"
  sql+=f"INSERT INTO platform_private.tenant_smtp_test_receipts(id,organization_id,actor_id,version,actor_iat,mode,request_key,fence,outbox_id,state,code,completed_at) VALUES(gen_random_uuid(),'{b}','{v}',1,1,'connection','{CK}',gen_random_uuid(),'{CK}','complete','smtp_connection_ok',clock_timestamp());"
  sql+=actor(v)+f"INSERT INTO w VALUES('c1',({claim(K1)[7:]}));"
  sql+=ok('replay same key no new job',f"({claim(K1)[7:]})->>'replay'='true'")+err('concurrent pending',claim(K2),'40001')
  prep=lambda salt,h,act=v:f"SELECT public.tenant_smtp_sender_challenge_prepare((SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c1'),(SELECT (v->>'fence')::uuid FROM w WHERE k='c1'),'{act}','{salt}','{h}')"
  sql+="RESET ROLE;SET ROLE service_role;"+err('forged actor prepare',prep('0'*32,'0'*64,u),'42501')+err('bad hash',prep('0'*32,'zz'),'22023')
  sql+="RESET ROLE;CREATE TEMP TABLE hv(h text);GRANT ALL ON hv TO service_role;"
  sql+="INSERT INTO hv SELECT encode(sha256(convert_to(repeat('ab',16)||':'||(SELECT v->>'challenge_id' FROM w WHERE k='c1')||':12345678','UTF8')),'hex');GRANT SELECT ON hv TO service_role;"
  sql+="SET ROLE service_role;"+ok('prepare returns sender as recipient',f"({prep('ab'*16,'X')[7:].replace(chr(39)+'X'+chr(39),'(SELECT h FROM hv)')})->>'recipient'='sender@provider.com'")
  sql+=err('prepare twice denied',prep('ab'*16,'0'*64),'42501')
  fin=lambda c:f"SELECT public.tenant_smtp_sender_challenge_finish((SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c1'),(SELECT (v->>'fence')::uuid FROM w WHERE k='c1'),'{v}','{c}')"
  sql+=fin('challenge_sent')+';'+fin('challenge_sent')+';'+err('finish conflicting code',fin('challenge_failed'),'40001')
  sql+="RESET ROLE;"+ok('no plaintext code stored',"NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_sender_challenges WHERE row_to_json(tenant_smtp_sender_challenges)::text LIKE '%12345678%')")
  sql+=ok('audit has no code',"NOT EXISTS(SELECT 1 FROM communication_tenant_email_audit WHERE action LIKE '%12345678%')")
  conf=lambda code,ver=1:f"SELECT public.tenant_smtp_sender_challenge_confirm((SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c1'),{ver},'{code}')"
  sql+=actor(u)+ok('other tenant admin cannot confirm',f"({conf('12345678')[7:]})->>'code'='SENDER_CHALLENGE_INVALID'")
  sql+=actor(v)+err('malformed code',conf('1234'),'22023')
  sql+=ok('mismatch counted',f"({conf('00000000')[7:]})->>'attempts_left'='4'")
  sql+=err('activation before verify',"SELECT public.tenant_smtp_activation_set(1,true)",'42501')
  sql+=ok('correct code verifies',f"({conf('12345678')[7:]})->>'code'='SENDER_VERIFIED'")
  sql+=ok('replayed code single use',f"({conf('12345678')[7:]})->>'code'='SENDER_CHALLENGE_INVALID'")
  sql+=ok('status verified',"(public.tenant_smtp_f4_status()->>'sender_verified')::boolean")
  sql+=ok('activation sets active',"(public.tenant_smtp_activation_set(1,true)->>'active')::boolean")
  sql+=ok('dispatch remains false',"(public.tenant_smtp_f4_status()->>'dispatch_enabled')='false'")
  sql+="RESET ROLE;SET ROLE service_role;"+ok('dispatch_ready true for active',f"tenant_smtp_executor.tenant_smtp_dispatch_ready('{b}')")+ok('dispatch_ready false other tenant',f"NOT tenant_smtp_executor.tenant_smtp_dispatch_ready('{a}')")
  # edit config → invalidation
  cfg2=ns['cfg'].replace('sender@provider.com','other@provider.com')
  sql+=actor(v)+f"SELECT public.tenant_email_settings_save(1,'{cfg2}');"
  sql+=ok('edit invalidates verification',"NOT (public.tenant_smtp_f4_status()->>'sender_verified')::boolean")
  sql+=ok('edit invalidates activation',"NOT (public.tenant_smtp_f4_status()->>'active')::boolean")
  sql+="RESET ROLE;SET ROLE service_role;"+ok('dispatch_ready false after edit',f"NOT tenant_smtp_executor.tenant_smtp_dispatch_ready('{b}')")
  sql+=actor(v)+err('stale version activation',"SELECT public.tenant_smtp_activation_set(1,true)",'40001')
  sql+=ok('pause always allowed',"NOT (public.tenant_smtp_activation_set(2,false)->>'active')::boolean")
  # exhaustion + expiry on a fresh challenge (version 2)
  sql+=f"RESET ROLE;UPDATE platform_private.tenant_smtp_sender_challenges SET created_at=clock_timestamp()-interval '61 seconds';UPDATE platform_private.tenant_smtp_test_receipts SET version=2;"
  sql+=actor(v)+f"INSERT INTO w VALUES('c2',({claim(K3,2)[7:]}));"
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_sender_challenges SET state='sent',code_salt=repeat('ab',16),code_hash=repeat('0',64),expires_at=clock_timestamp()+interval '1 minute' WHERE id=(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c2');"
  c2=lambda code:f"SELECT public.tenant_smtp_sender_challenge_confirm((SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c2'),2,'{code}')"
  sql+=actor(v)+''.join(f"SELECT {c2('1111111'+str(i))[7:]};" for i in range(4))
  sql+=ok('fifth attempt exhausts',f"({c2('22222222')[7:]})->>'code'='SENDER_CHALLENGE_EXHAUSTED'")
  sql+=ok('exhausted stays closed',f"({c2('22222222')[7:]})->>'code'='SENDER_CHALLENGE_INVALID'")
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_sender_challenges SET created_at=clock_timestamp()-interval '61 seconds';"
  sql+=actor(v)+"INSERT INTO w VALUES('c3',(SELECT public.tenant_smtp_sender_challenge_claim(2,'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5')));"
  sql+=err('cooldown 60s',claim('f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6',2),'40001')
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_sender_challenges SET state='sent',code_salt=repeat('ab',16),code_hash=repeat('0',64),expires_at=clock_timestamp()-interval '1 second' WHERE id=(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c3');"
  sql+=actor(v)+ok('expired code rejected',"(public.tenant_smtp_sender_challenge_confirm((SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c3'),2,'12345678'))->>'code'='SENDER_CHALLENGE_EXPIRED'")
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_sender_challenges SET created_at=clock_timestamp()-interval '25 hours' WHERE false;"
  sql+="INSERT INTO platform_private.tenant_smtp_sender_challenges(id,organization_id,actor_id,version,from_email,request_key,fence,actor_iat,state,created_at) SELECT gen_random_uuid(),organization_id,actor_id,2,from_email,gen_random_uuid(),gen_random_uuid(),1,'failed',clock_timestamp()-interval '2 minutes' FROM platform_private.tenant_smtp_sender_challenges LIMIT 2;"
  sql+=actor(v)+err('daily quota',claim('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',2),'40001')
  # rollback
  sql+="RESET ROLE;"+(R/'rollback.sql').read_text()
  sql+=ok('rollback gate false',"NOT (SELECT approved FROM platform_private.tenant_smtp_f4_gate)")+ok('rollback no active',"NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_activation WHERE active)")
  sql+=ok('rollback history preserved',"(SELECT count(*) FROM platform_private.tenant_smtp_sender_challenges)>0")
  sql+=ok('rollback revokes client',"NOT has_function_privilege('authenticated','public.tenant_smtp_sender_challenge_claim(bigint,uuid)','EXECUTE')")
  r=subprocess.run(cmd,input=sql,text=True,capture_output=True)
  passes=[x for x in r.stderr.splitlines() if 'PASS' in x]
  print('\n'.join(passes[-60:]))
  assert r.returncode==0,r.stderr[-2500:]
  print(f'F4 SQL PASS {len(passes)} checks')
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(t,ignore_errors=True)
if __name__=='__main__':main()
