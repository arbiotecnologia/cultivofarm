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
  # Realistic prerequisites: real F2/F3 claim -> service prepare -> finish (no trigger disabling).
  def conn(k,key,ver):
   q=actor(v)+f"INSERT INTO w VALUES('{k}',(SELECT public.tenant_smtp_test_claim('connection',{ver},'{key}',false)));RESET ROLE;SET ROLE service_role;"
   args=f"(SELECT (v->>'job_id')::uuid FROM w WHERE k='{k}'),(SELECT (v->>'fence')::uuid FROM w WHERE k='{k}'),'{v}'"
   return q+f"SELECT public.tenant_smtp_test_prepare({args});SELECT public.tenant_smtp_test_finish({args},'smtp_connection_ok');RESET ROLE;"
  def cargs(k,act=None):return f"(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='{k}'),(SELECT (v->>'fence')::uuid FROM w WHERE k='{k}'),'{act or v}'"
  def hsql(k,code):return f"encode(sha256(convert_to(repeat('ab',16)||':'||(SELECT v->>'challenge_id' FROM w WHERE k='{k}')||':{code}','UTF8')),'hex')"
  def cprep(k,code='12345678'):return f"SELECT public.tenant_smtp_sender_challenge_prepare({cargs(k)},repeat('ab',16),{hsql(k,code)})"
  def cfin(k,c='challenge_sent'):return f"SELECT public.tenant_smtp_sender_challenge_finish({cargs(k)},'{c}')"
  def flow(k,key,ver,code='12345678',fin=True):
   return actor(v)+f"INSERT INTO w VALUES('{k}',({claim(key,ver)[7:]}));RESET ROLE;SET ROLE service_role;"+cprep(k,code)+';'+(cfin(k)+';' if fin else '')+'RESET ROLE;'
  backdate="RESET ROLE;UPDATE platform_private.tenant_smtp_sender_challenges SET created_at=created_at-interval '61 seconds';UPDATE platform_private.tenant_smtp_test_receipts SET created_at=created_at-interval '61 seconds';"
  sql+=conn('r1','e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1',1)
  sql+=ok('no trigger disabled',"(SELECT bool_and(tgenabled<>'D') FROM pg_trigger WHERE tgrelid='public.comunicacao_outbox'::regclass)")
  sql+=actor(v)+f"INSERT INTO w VALUES('c1',({claim(K1)[7:]}));"
  sql+=ok('replay same key no new job',f"({claim(K1)[7:]})->>'replay'='true'")+err('concurrent pending',claim(K2),'40001')
  sql+="RESET ROLE;SET ROLE service_role;"+err('forged actor prepare',f"SELECT public.tenant_smtp_sender_challenge_prepare({cargs('c1',u)},repeat('ab',16),repeat('0',64))",'42501')
  sql+=err('bad hash',f"SELECT public.tenant_smtp_sender_challenge_prepare({cargs('c1')},repeat('ab',16),'zz')",'22023')
  sql+=ok('prepare returns sender as recipient',f"({cprep('c1')[7:]})->>'recipient'='sender@provider.com'")
  sql+=err('prepare twice denied',cprep('c1'),'42501')
  sql+=cfin('c1')+';'+cfin('c1')+';'+err('finish conflicting code',cfin('c1','challenge_failed'),'40001')
  sql+="RESET ROLE;"+ok('no plaintext code stored',"NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_sender_challenges x WHERE row_to_json(x)::text LIKE '%12345678%')")
  sql+=ok('audit has no code',"NOT EXISTS(SELECT 1 FROM communication_tenant_email_audit WHERE action LIKE '%12345678%')")
  conf=lambda code,k='c1',ver=1:f"SELECT public.tenant_smtp_sender_challenge_confirm((SELECT (v->>'challenge_id')::uuid FROM w WHERE k='{k}'),{ver},'{code}')"
  sql+=actor(u)+ok('other tenant admin cannot confirm',f"({conf('12345678')[7:]})->>'code'='SENDER_CHALLENGE_INVALID'")
  sql+=actor(v)+err('malformed code',conf('1234'),'22023')
  sql+=ok('mismatch counted',f"({conf('00000000')[7:]})->>'attempts_left'='4'")
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_f4_gate SET approved=false;"+actor(v)+err('closed F4 gate blocks confirm',conf('12345678'),'42501')
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_f4_gate SET approved=true;UPDATE platform_private.tenant_smtp_test_gate SET approved=false;"+actor(v)+err('closed F2F3 gate blocks confirm',conf('12345678'),'42501')
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_test_gate SET approved=true;"+ok('closed-gate confirm consumed no attempt',"(SELECT attempts FROM platform_private.tenant_smtp_sender_challenges WHERE id=(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c1'))=1")
  sql+=actor(v)+err('operational activation refused',"SELECT public.tenant_smtp_activation_set(1,true)",'42501')
  sql+=ok('correct code verifies',f"({conf('12345678')[7:]})->>'code'='SENDER_VERIFIED'")
  sql+=ok('replayed code single use',f"({conf('12345678')[7:]})->>'code'='SENDER_CHALLENGE_INVALID'")
  sql+=ok('status verified',"(public.tenant_smtp_f4_status()->>'sender_verified')::boolean")
  sql+=err('activation refused even verified',"SELECT public.tenant_smtp_activation_set(1,true)",'42501')
  sql+=ok('status never active',"(public.tenant_smtp_f4_status()->>'active')='false' AND (public.tenant_smtp_f4_status()->>'dispatch_enabled')='false'")
  sql+=ok('pause allowed',"(public.tenant_smtp_activation_set(1,false)->>'active')='false'")
  sql+="RESET ROLE;SET ROLE service_role;"+ok('dispatch_ready false in F4a',f"NOT tenant_smtp_executor.tenant_smtp_dispatch_ready('{b}')")
  # executing challenge invalidated by config change; late finish cannot reopen it
  sql+=backdate+flow('c2',K3,1,fin=False)
  cfg2=ns['cfg'].replace('sender@provider.com','other@provider.com')
  sql+=actor(v)+f"SELECT public.tenant_email_settings_save(1,'{cfg2}');"
  sql+=ok('edit invalidates verification',"NOT (public.tenant_smtp_f4_status()->>'sender_verified')::boolean")
  sql+="RESET ROLE;"+ok('edit invalidates executing',"(SELECT state FROM platform_private.tenant_smtp_sender_challenges WHERE id=(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c2'))='invalidated'")
  sql+="SET ROLE service_role;"+cfin('c2')+";RESET ROLE;"+ok('late finish does not reopen',"(SELECT state='invalidated' AND code_hash IS NULL FROM platform_private.tenant_smtp_sender_challenges WHERE id=(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c2'))")
  sql+=actor(v)+err('stale version pause',"SELECT public.tenant_smtp_activation_set(1,false)",'40001')
  # orphan: claim without prepare blocks only until reconciliation window
  sql+=backdate+conn('r2','e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2',2)+backdate
  sql+=actor(v)+f"INSERT INTO w VALUES('c3',({claim('e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5',2)[7:]}));"+backdate
  sql+=actor(v)+err('orphan blocks within window',claim('f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6',2),'40001')
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_sender_challenges SET created_at=created_at-interval '3 minutes' WHERE id=(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c3');"
  sql+=actor(v)+f"INSERT INTO w VALUES('c4',({claim('f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6',2)[7:]}));"
  sql+="RESET ROLE;"+ok('orphan reconciled invalidated, audited',"(SELECT state='invalidated' AND code_hash IS NULL FROM platform_private.tenant_smtp_sender_challenges WHERE id=(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c3')) AND EXISTS(SELECT 1 FROM communication_tenant_email_audit WHERE action='sender_challenge_reconciled')")
  sql+="SET ROLE service_role;"+err('reconciled orphan never prepared',cprep('c3'),'42501')+"RESET ROLE;"
  # failed prepare (stale window) leaves no permanent block
  sql+="UPDATE platform_private.tenant_smtp_sender_challenges SET created_at=created_at-interval '40 seconds' WHERE id=(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c4');SET ROLE service_role;"+err('late prepare refused',cprep('c4'),'42501')
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_sender_challenges SET created_at=created_at-interval '3 minutes' WHERE id=(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c4');"
  sql+=flow('c5','a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5',2)
  sql+=ok('failed prepare not permanent',"(SELECT state FROM platform_private.tenant_smtp_sender_challenges WHERE id=(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c5'))='sent'")
  sql+=actor(v)+err('cooldown 60s',claim('a6a6a6a6-a6a6-4a6a-8a6a-a6a6a6a6a6a6',2),'40001')
  sql+=actor(v)+''.join(f"SELECT {conf('1111111'+str(i),'c5',2)[7:]};" for i in range(4))
  sql+=ok('fifth attempt exhausts',f"({conf('22222222','c5',2)[7:]})->>'code'='SENDER_CHALLENGE_EXHAUSTED'")
  sql+=ok('exhausted stays closed',f"({conf('12345678','c5',2)[7:]})->>'code'='SENDER_CHALLENGE_INVALID'")
  sql+=backdate+flow('c6','a8a8a8a8-a8a8-4a8a-8a8a-a8a8a8a8a8a8',2)
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_sender_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE id=(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c6');"
  sql+=actor(v)+ok('expired code rejected',f"({conf('12345678','c6',2)[7:]})->>'code'='SENDER_CHALLENGE_EXPIRED'")
  sql+=backdate+actor(v)+err('daily quota (6th in 24h)',claim('a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7',2),'40001')
  sql+="RESET ROLE;"+ok('quota count is 6 real claims',"(SELECT count(*) FROM platform_private.tenant_smtp_sender_challenges)=6")
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
