"""Disposable PostgreSQL only (initdb in /tmp). Real F2/F3+F4a+F4b SQL, synthetic fixtures, SET ROLE service_role. Never remote, no network."""
from pathlib import Path
import subprocess,tempfile,os,shutil,importlib.util
R=Path(__file__).parent
spec=importlib.util.spec_from_file_location('f4sql',R.parent/'f4/test_sql.py');f4=importlib.util.module_from_spec(spec);spec.loader.exec_module(f4)
ADM='11111111-1111-4111-8111-111111111111';ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'   # configured tenant admin
ADM2='22222222-2222-4222-8222-222222222222';ORG2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' # other tenant admin (no settings)
CON='c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';CON2='c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';NOROLE='c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2'
CLI='d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0';CLI2='d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1'
def sol(i):return f'e{i:07d}-0000-4000-8000-000000000000'
def main():
 ns=f4.harness_setup();sql=ns['sql']
 t=Path(tempfile.mkdtemp(dir='/tmp',prefix='smtp-f4b-'));t.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 cmd=['psql','-X','-h',str(t),'-p','55496','-U','postgres','-v','ON_ERROR_STOP=1']
 try:
  subprocess.run(prefix+['initdb','-D',str(t/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'-l',str(t/'log'),'-o',f'-k {t} -h "" -p 55496','start'],check=True,capture_output=True)
  sql+="RESET ROLE;"+(R.parent/'f4/20261016_smtp_f4_sender_activation.sql').read_text()
  # Minimal source-domain stubs (columns used by the contract only) + hosted global claim verbatim.
  sql+=f"""ALTER TYPE public.app_role ADD VALUE 'consultor_tecnico';ALTER TYPE public.app_role ADD VALUE 'tecnico_agronomo';
CREATE TABLE public.clientes(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE public.portal_solicitacoes(id uuid PRIMARY KEY,cliente_id uuid,consultor_atribuido uuid,numero_solicitacao text,tipo_demanda text,urgencia text,status text);
GRANT SELECT,UPDATE ON public.portal_solicitacoes TO authenticated;
INSERT INTO public.clientes VALUES('{CLI}','{ORG}'),('{CLI2}','{ORG2}');
INSERT INTO public.profiles(user_id,organization_id) VALUES('{CON}','{ORG}'),('{CON2}','{ORG2}'),('{NOROLE}','{ORG}');
INSERT INTO auth.users VALUES('{CON}','consultor@tenant-a.test',now()),('{CON2}','consultor@tenant-b.test',now()),('{NOROLE}','norole@tenant-a.test',now());
"""
  sql+=f"INSERT INTO public.user_roles VALUES('{CON}','consultor_tecnico'),('{CON2}','tecnico_agronomo');"
  sql+="INSERT INTO public.portal_solicitacoes(id,cliente_id,numero_solicitacao,tipo_demanda,urgencia) SELECT ('e'||lpad(g::text,7,'0')||'-0000-4000-8000-000000000000')::uuid,"+f"CASE WHEN g=9 THEN '{CLI2}'::uuid ELSE '{CLI}'::uuid END,'SOL-'||g||'<b>x</b>','praga','alta' FROM generate_series(1,20) g;"
  sql+="""CREATE OR REPLACE FUNCTION public.rpc_claim_communication_outbox(p_batch_size integer,p_worker_id text,p_lease_seconds integer DEFAULT 60) RETURNS SETOF comunicacao_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN RETURN QUERY WITH candidatos AS (SELECT id FROM public.comunicacao_outbox WHERE ((status='pending' AND next_attempt_at<=now()) OR (status='processing' AND lease_expires_at IS NOT NULL AND lease_expires_at<now())) ORDER BY next_attempt_at LIMIT p_batch_size FOR UPDATE SKIP LOCKED),
 updated AS (UPDATE public.comunicacao_outbox o SET status='processing',locked_at=now(),locked_by=p_worker_id,lease_expires_at=now()+make_interval(secs=>p_lease_seconds),attempts=o.attempts+1 FROM candidatos c WHERE o.id=c.id RETURNING o.*) SELECT * FROM updated; END$f$;
GRANT EXECUTE ON FUNCTION public.rpc_claim_communication_outbox(integer,text,integer) TO service_role;
"""
  f4b=(R/'20261016_smtp_f4b_tenant_dispatch.sql').read_text()
  sql+=f4b+f4b
  sql+="""
CREATE FUNCTION pg_temp.ok(label text,result boolean) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label;END IF;RAISE NOTICE 'PASS %',label;END$$;
CREATE FUNCTION pg_temp.err(label text,q text,c text) RETURNS void LANGUAGE plpgsql AS $$DECLARE got text;BEGIN BEGIN EXECUTE q;EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS got=RETURNED_SQLSTATE;IF got=c THEN RAISE NOTICE 'PASS %',label;RETURN;END IF;RAISE EXCEPTION 'FAIL % code %',label,got;END;RAISE EXCEPTION 'FAIL % no error',label;END$$;
CREATE TEMP TABLE w(k text PRIMARY KEY,v jsonb);GRANT ALL ON w TO authenticated,service_role;
"""
  def actor(x):return f"RESET ROLE;SELECT set_config('request.jwt.claim.sub','{x}',false);SET ROLE authenticated;"
  def err(l,q,c):return f"SELECT pg_temp.err('{l}',$q${q}$q$,'{c}');"
  def ok(l,q):return f"SELECT pg_temp.ok('{l}',{q});"
  svc="RESET ROLE;SET ROLE service_role;"
  def assign(i,who=CON):return f"RESET ROLE;UPDATE public.portal_solicitacoes SET consultor_atribuido='{who}' WHERE id='{sol(i)}';"
  job=lambda i:f"(SELECT state FROM platform_private.tenant_smtp_dispatch_jobs WHERE source_id='{sol(i)}')"
  def lclaim(k):return svc+f"INSERT INTO w VALUES('{k}',public.tenant_smtp_lane_claim('lane-test')) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v;"
  def fin(k,o,fence=None):return f"SELECT public.tenant_smtp_lane_finish((SELECT (v->>'outbox_id')::uuid FROM w WHERE k='{k}'),{fence or f"(SELECT (v->>'fence')::uuid FROM w WHERE k='{k}')"},'{o}')"
  act=lambda on:f"SELECT public.tenant_smtp_activation_set(1,{on})"
  # ACL
  sql+="RESET ROLE;"+ok('client cannot claim lane',"NOT has_function_privilege('authenticated','public.tenant_smtp_lane_claim(text)','EXECUTE')")
  sql+=ok('anon cannot finish lane',"NOT has_function_privilege('anon','public.tenant_smtp_lane_finish(uuid,uuid,text)','EXECUTE')")
  sql+=ok('service can claim lane',"has_function_privilege('service_role','public.tenant_smtp_lane_claim(text)','EXECUTE')")
  sql+=ok('lane tables private',"NOT has_table_privilege('service_role','platform_private.tenant_smtp_dispatch_jobs','SELECT') AND NOT has_table_privilege('authenticated','platform_private.tenant_smtp_dispatch_jobs','SELECT')")
  sql+=ok('platform_private still closed to service',"NOT has_schema_privilege('service_role','platform_private','USAGE')")
  sql+=ok('public lane wrappers INVOKER',"(SELECT bool_and(NOT prosecdef) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'tenant_smtp_%')")
  sql+=ok('private definers search_path empty',"(SELECT bool_and(proconfig @> ARRAY['search_path=\"\"']) FROM pg_proc WHERE prosecdef AND pronamespace IN ('platform_private'::regnamespace,'tenant_smtp_executor'::regnamespace) AND proname LIKE 'tenant_smtp_%')")
  sql+=ok('dispatch gate inserted false',"NOT (SELECT approved FROM platform_private.tenant_smtp_dispatch_gate)")
  # Prerequisites: gates F2/F3+F4 open, real connection receipt, real sender verification.
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_f4_gate SET approved=true;UPDATE platform_private.tenant_smtp_test_gate SET approved=true;"
  sql+=f4_prereqs(actor,svc)
  sql+=actor(ADM)+ok('verified before activation',"(public.tenant_smtp_f4_status()->>'sender_verified')::boolean")
  sql+=err('dispatch gate closed refuses activation',act('true'),'42501')
  sql+=assign(1)+"RESET ROLE;"+ok('not ready: no enqueue',f"{job(1)} IS NULL AND NOT EXISTS(SELECT 1 FROM comunicacao_outbox WHERE template_chave='solicitacao_atribuida_consultor_v1')")
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_dispatch_gate SET approved=true;"
  sql+=actor(ADM2)+err('other tenant admin cannot activate tenant A',act('true'),'40001')
  sql+=actor(CON)+err('consultor cannot activate',act('true'),'42501')
  sql+=actor(ADM)+err('CAS version activation',"SELECT public.tenant_smtp_activation_set(2,true)",'40001')
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_test_receipts SET completed_at=completed_at-interval '11 minutes';"+actor(ADM)+err('stale connection refuses activation',act('true'),'42501')
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_test_receipts SET completed_at=clock_timestamp();"
  sql+=actor(ADM)+ok('activation ok',f"({act('true')[7:]})->>'active'='true'")+ok('dispatch ready',"(public.tenant_smtp_f4_status()->>'dispatch_enabled')='true'")
  sql+="RESET ROLE;"+ok('activation audited',"EXISTS(SELECT 1 FROM communication_tenant_email_audit WHERE action='tenant_smtp_activated')")
  sql+="RESET ROLE;UPDATE public.portal_solicitacoes SET consultor_atribuido=NULL WHERE id='"+sol(1)+"';"+assign(1)
  sql+="RESET ROLE;"+ok('future event enqueued',f"{job(1)}='queued'")
  sql+=ok('lane row invisible to global claim shape',f"(SELECT status='processing' AND lease_expires_at IS NULL AND attempts=0 AND max_attempts=1 FROM comunicacao_outbox o JOIN platform_private.tenant_smtp_dispatch_jobs j ON j.outbox_id=o.id WHERE j.source_id='{sol(1)}')")
  sql+=ok('payload sanitized no markup',f"(SELECT payload_snapshot->>'numero'='SOL-1bxb' FROM comunicacao_outbox o JOIN platform_private.tenant_smtp_dispatch_jobs j ON j.outbox_id=o.id WHERE j.source_id='{sol(1)}')")
  sql+=svc+ok('global claim never takes lane rows',"(SELECT count(*) FROM public.rpc_claim_communication_outbox(10,'global',60))=0")
  sql+="RESET ROLE;UPDATE public.portal_solicitacoes SET consultor_atribuido=NULL WHERE id='"+sol(1)+"';"+assign(1)+"RESET ROLE;"+ok('reassign same recipient idempotent',f"(SELECT count(*) FROM platform_private.tenant_smtp_dispatch_jobs WHERE source_id='{sol(1)}')=1")
  sql+=assign(9)+"RESET ROLE;"+ok('cross-tenant source (cliente org B, consultor org A) not enqueued',f"{job(9)} IS NULL")
  sql+=assign(2,CON2)+"RESET ROLE;"+ok('recipient from other tenant not enqueued',f"{job(2)} IS NULL")
  sql+=assign(3,NOROLE)+"RESET ROLE;"+ok('recipient without technical role not enqueued',f"{job(3)} IS NULL")
  sql+=assign(4,ADM)+"RESET ROLE;"+ok('admin (non consultant) not enqueued',f"{job(4)} IS NULL")
  sql+="RESET ROLE;"+ok('business updates preserved',f"(SELECT count(*) FROM portal_solicitacoes WHERE consultor_atribuido IS NOT NULL)>=5")
  sql+=svc+f"INSERT INTO public.comunicacao_eventos(id,event_key,source_type,source_id,payload,idempotency_key,status) VALUES('f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0','tenant.smtp.solicitacao_atribuida','portal_solicitacoes','{sol(5)}','{{}}','forged-event-0001','processed');"
  sql+=f"INSERT INTO public.comunicacao_outbox(id,event_id,template_chave,template_versao,template_snapshot,canal,recipient_user_id,status,attempts,max_attempts,locked_by,idempotency_key) VALUES('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1','f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0','solicitacao_atribuida_consultor_v1',1,'{{}}','email','{CON}','processing',0,1,'tenant_smtp_lane','forged-outbox-0001');"
  sql+="RESET ROLE;"+ok('forged service insert without ticket dropped',"NOT EXISTS(SELECT 1 FROM comunicacao_outbox WHERE id='f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1')")
  # Claim/finish
  sql+=lclaim('j1')+"RESET ROLE;"+ok('claim returns proven recipient only',"(SELECT v->>'recipient'='consultor@tenant-a.test' AND v ? 'password' AND v->'config'->>'port'='465' FROM w WHERE k='j1')")
  sql+=ok('claim moved to executing',f"{job(1)}='executing'")
  sql+=lclaim('none')+"RESET ROLE;"+ok('no second claim of executing job',"(SELECT v IS NULL OR v='null'::jsonb FROM w WHERE k='none')")
  sql+=svc+err('wrong fence finish',fin('j1','sent',"'99999999-9999-4999-8999-999999999999'::uuid"),'40001')
  sql+=svc+ok('finish sent',f"({fin('j1','sent')[7:]})->>'state'='sent'")+ok('finish replay idempotent',f"({fin('j1','sent')[7:]})->>'replay'='true'")
  sql+="RESET ROLE;"+ok('outbox sent',f"(SELECT o.status='sent' FROM comunicacao_outbox o JOIN platform_private.tenant_smtp_dispatch_jobs j ON j.outbox_id=o.id WHERE j.source_id='{sol(1)}')")
  sql+=ok('no secret in ledger/outbox/audit',"NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs x WHERE row_to_json(x)::text LIKE '%synthetic-only%') AND NOT EXISTS(SELECT 1 FROM comunicacao_outbox x WHERE row_to_json(x)::text LIKE '%synthetic-only%') AND NOT EXISTS(SELECT 1 FROM communication_tenant_email_audit x WHERE row_to_json(x)::text LIKE '%synthetic-only%')")
  # Ambiguous: dead_letter, never re-claimed.
  sql+=assign(5)+lclaim('j5')+svc+ok('ambiguous terminal',f"({fin('j5','ambiguous')[7:]})->>'state'='ambiguous'")
  sql+="RESET ROLE;"+ok('ambiguous -> dead_letter',f"(SELECT o.status='dead_letter' FROM comunicacao_outbox o JOIN platform_private.tenant_smtp_dispatch_jobs j ON j.outbox_id=o.id WHERE j.source_id='{sol(5)}')")
  sql+=lclaim('after5')+"RESET ROLE;"+ok('ambiguous never re-claimed',"(SELECT v IS NULL OR v='null'::jsonb FROM w WHERE k='after5')")
  # Lease expired after IO: terminal, late finish cannot reopen.
  sql+=assign(6)+lclaim('j6')+f"RESET ROLE;UPDATE platform_private.tenant_smtp_dispatch_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE source_id='{sol(6)}';"
  sql+=lclaim('after6')+"RESET ROLE;"+ok('expired lease reconciled terminal',f"{job(6)}='lease_expired'")
  sql+=ok('expired lease outbox dead_letter',f"(SELECT o.status='dead_letter' FROM comunicacao_outbox o JOIN platform_private.tenant_smtp_dispatch_jobs j ON j.outbox_id=o.id WHERE j.source_id='{sol(6)}')")
  sql+=svc+ok('late finish does not reopen',f"({fin('j6','sent')[7:]})->>'state'='lease_expired'")
  # Recipient loses proof between enqueue and claim.
  sql+=assign(7)+f"RESET ROLE;UPDATE public.profiles SET ativo=false WHERE user_id='{CON}';"+lclaim('j7')+"RESET ROLE;"+ok('recipient re-proven before IO',f"{job(7)}='cancelled' AND (SELECT v->>'skipped'='true' FROM w WHERE k='j7')")
  sql+=f"RESET ROLE;UPDATE public.profiles SET ativo=true WHERE user_id='{CON}';"
  # Pause during lease: executing job unaffected (finishes honestly), queued cancelled, no new claims.
  sql+=assign(8)+assign(10)+lclaim('j8')+actor(ADM)+ok('pause ok',f"({act('false')[7:]})->>'active'='false'")
  sql+="RESET ROLE;"+ok('pause cancels queued',f"{job(10)}='cancelled'")+ok('pause keeps executing for honest finish',f"{job(8)}='executing'")
  sql+=ok('pause audited',"EXISTS(SELECT 1 FROM communication_tenant_email_audit WHERE action='tenant_smtp_paused')")
  sql+=svc+ok('in-flight finish after pause',f"({fin('j8','failed')[7:]})->>'state'='failed'")
  sql+=assign(11)+"RESET ROLE;"+ok('paused tenant: no new enqueue',f"{job(11)} IS NULL")
  # Reactivate, then config edit invalidates activation and queued jobs.
  sql+=actor(ADM)+ok('reactivate',f"({act('true')[7:]})->>'active'='true'")+assign(12)
  sql+="RESET ROLE;UPDATE communication_tenant_email_settings SET version=version+1 WHERE organization_id='"+ORG+"';"
  sql+=ok('config edit deactivates',"NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_activation WHERE active)")+ok('config edit cancels queued',f"{job(12)}='cancelled'")
  sql+=ok('config edit invalidates verification',"NOT platform_private.tenant_smtp_f4_verified('"+ORG+"')")
  sql+=lclaim('after12')+"RESET ROLE;"+ok('no claim after config edit',"(SELECT v IS NULL OR v='null'::jsonb FROM w WHERE k='after12')")
  # Rollback (non-destructive)
  sql+="RESET ROLE;"+(R/'rollback.sql').read_text()
  sql+=ok('rollback gate false',"NOT (SELECT approved FROM platform_private.tenant_smtp_dispatch_gate)")
  sql+=ok('rollback trigger removed',"NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='tenant_smtp_lane_solicitacao_atribuida')")
  sql+=ok('rollback history preserved',"(SELECT count(*) FROM platform_private.tenant_smtp_dispatch_jobs)>=6")
  sql+=ok('rollback revokes service',"NOT has_function_privilege('service_role','public.tenant_smtp_lane_claim(text)','EXECUTE')")
  sql+=ok('rollback readiness false',"NOT tenant_smtp_executor.tenant_smtp_dispatch_ready('"+ORG+"')")
  r=subprocess.run(cmd,input=sql,text=True,capture_output=True)
  passes=[x.split('PASS',1)[1].strip() for x in r.stderr.splitlines() if 'NOTICE:  PASS' in x]
  print('\n'.join('PASS '+p for p in passes[-70:]))
  assert r.returncode==0,r.stderr[-2500:]
  print(f'F4b SQL PASS {len(passes)} checks')
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(t,ignore_errors=True)
def f4_prereqs(actor,svc):
 """Real F2/F3 connection receipt + real F4a challenge/confirm. No trigger disabling, no direct state writes."""
 K='a9a9a9a9-a9a9-4a9a-8a9a-a9a9a9a9a9a9';CK='e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'
 q=actor(ADM)+f"INSERT INTO w VALUES('r1',(SELECT public.tenant_smtp_test_claim('connection',1,'{CK}',false)));"+svc
 a=f"(SELECT (v->>'job_id')::uuid FROM w WHERE k='r1'),(SELECT (v->>'fence')::uuid FROM w WHERE k='r1'),'{ADM}'"
 q+=f"SELECT public.tenant_smtp_test_prepare({a});SELECT public.tenant_smtp_test_finish({a},'smtp_connection_ok');"
 q+=actor(ADM)+f"INSERT INTO w VALUES('c1',public.tenant_smtp_sender_challenge_claim(1,'{K}'));"+svc
 c=f"(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c1'),(SELECT (v->>'fence')::uuid FROM w WHERE k='c1'),'{ADM}'"
 h="encode(sha256(convert_to(repeat('ab',16)||':'||(SELECT v->>'challenge_id' FROM w WHERE k='c1')||':12345678','UTF8')),'hex')"
 q+=f"SELECT public.tenant_smtp_sender_challenge_prepare({c},repeat('ab',16),{h});SELECT public.tenant_smtp_sender_challenge_finish({c},'challenge_sent');"
 q+=actor(ADM)+"SELECT public.tenant_smtp_sender_challenge_confirm((SELECT (v->>'challenge_id')::uuid FROM w WHERE k='c1'),1,'12345678');RESET ROLE;"
 return q
if __name__=='__main__':main()
