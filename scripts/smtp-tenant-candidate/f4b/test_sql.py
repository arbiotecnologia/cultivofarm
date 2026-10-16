"""Disposable PostgreSQL only (initdb in /tmp). Real F2/F3+F4a+F4b SQL, synthetic fixtures, SET ROLE service_role. Never remote, no network."""
from pathlib import Path
import subprocess,tempfile,os,shutil,importlib.util
R=Path(__file__).parent
spec=importlib.util.spec_from_file_location('f4sql',R.parent/'f4/test_sql.py');f4=importlib.util.module_from_spec(spec);spec.loader.exec_module(f4)
ADM='11111111-1111-4111-8111-111111111111';ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'   # configured tenant A admin
ADM2='22222222-2222-4222-8222-222222222222';ORG2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' # tenant B admin
CON='c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0';CON2='c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';NOROLE='c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2';CON3='c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3'
CLI='d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0';CLI2='d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';CLI3='d3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3';CLI4='d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4'
CLI5='d5d5d5d5-d5d5-4d5d-8d5d-d5d5d5d5d5d5';CLI6='d6d6d6d6-d6d6-4d6d-8d6d-d6d6d6d6d6d6';CLI7='d7d7d7d7-d7d7-4d7d-8d7d-d7d7d7d7d7d7'
def sol(i):return f'e{i:07d}-0000-4000-8000-000000000000'
def main():
 ns=f4.harness_setup();sql=ns['sql'];cfg=ns['cfg']
 t=Path(tempfile.mkdtemp(dir='/tmp',prefix='smtp-f4b-'));t.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 cmd=['psql','-X','-h',str(t),'-p','55496','-U','postgres','-v','ON_ERROR_STOP=1']
 try:
  subprocess.run(prefix+['initdb','-D',str(t/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'-l',str(t/'log'),'-o',f'-k {t} -h "" -p 55496','start'],check=True,capture_output=True)
  sql+="RESET ROLE;"+(R.parent/'f4/20261016_smtp_f4_sender_activation.sql').read_text()
  # Source-domain stubs: only columns the contract reads (names/types/defaults as hosted: status text default 'pendente', status_cliente enum).
  sql+=f"""ALTER TYPE public.app_role ADD VALUE 'consultor_tecnico';ALTER TYPE public.app_role ADD VALUE 'tecnico_agronomo';
CREATE TYPE public.cliente_status AS ENUM('prospect','ativo','inativo','bloqueado_financeiro');
CREATE TABLE public.clientes(id uuid PRIMARY KEY,organization_id uuid,status_cliente public.cliente_status NOT NULL DEFAULT 'ativo');
CREATE TABLE public.portal_solicitacoes(id uuid PRIMARY KEY,cliente_id uuid,consultor_atribuido uuid,numero_solicitacao text,tipo_demanda text,urgencia text,status text DEFAULT 'pendente');
INSERT INTO public.clientes VALUES('{CLI}','{ORG}'),('{CLI2}','{ORG2}'),('{CLI3}','{ORG}'),('{CLI4}','{ORG}'),('{CLI5}','{ORG}'),('{CLI6}','{ORG}'),('{CLI7}','{ORG}');
CREATE TABLE public.user_clientes(user_id uuid,cliente_id uuid,is_active boolean,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz,access_level text);
INSERT INTO public.user_clientes VALUES('{CON}','{CLI}',true,NULL,NULL,NULL,'execute'),('{CON}','{CLI3}',true,NULL,NULL,NULL,'read'),('{CON}','{CLI4}',true,NULL,NULL,NULL,'manage'),
 ('{CON}','{CLI5}',true,NULL,NULL,NULL,'execute'),('{CON}','{CLI6}',true,NULL,NULL,NULL,'execute'),('{CON}','{CLI7}',true,NULL,now()-interval '2 days',now()-interval '1 day','execute'),
 ('{CON3}','{CLI}',true,NULL,NULL,NULL,'execute'),('{CON2}','{CLI2}',true,NULL,NULL,NULL,'execute'),('{NOROLE}','{CLI}',true,NULL,NULL,NULL,'execute');
INSERT INTO public.profiles(user_id,organization_id) VALUES('{CON}','{ORG}'),('{CON2}','{ORG2}'),('{NOROLE}','{ORG}'),('{CON3}','{ORG}');
INSERT INTO auth.users VALUES('{CON}','consultor@tenant-a.test',now()),('{CON2}','consultor@tenant-b.test',now()),('{NOROLE}','norole@tenant-a.test',now()),('{CON3}','consultor3@tenant-a.test',now());
"""
  sql+=f"INSERT INTO public.user_roles VALUES('{CON}','consultor_tecnico'),('{CON2}','tecnico_agronomo'),('{CON3}','consultor_tecnico');"
  sql+=("INSERT INTO public.portal_solicitacoes(id,cliente_id,numero_solicitacao,tipo_demanda,urgencia) SELECT ('e'||lpad(g::text,7,'0')||'-0000-4000-8000-000000000000')::uuid,"
   f"CASE WHEN g=9 OR g BETWEEN 81 AND 89 THEN '{CLI2}'::uuid WHEN g=24 THEN '{CLI3}'::uuid WHEN g=26 THEN '{CLI4}'::uuid WHEN g=27 THEN '{CLI5}'::uuid WHEN g=36 THEN '{CLI6}'::uuid WHEN g=28 THEN '{CLI7}'::uuid ELSE '{CLI}'::uuid END,'SOL-'||g||'<b>x</b>','praga','alta' FROM generate_series(1,120) g;")
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
  code=lambda i:f"(SELECT result_code FROM platform_private.tenant_smtp_dispatch_jobs WHERE source_id='{sol(i)}')"
  obx=lambda i:f"(SELECT o.status::text FROM comunicacao_outbox o JOIN platform_private.tenant_smtp_dispatch_jobs j ON j.outbox_id=o.id WHERE j.source_id='{sol(i)}')"
  def lclaim(k):return svc+f"INSERT INTO w VALUES('{k}',public.tenant_smtp_lane_claim('lane-test')) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v;"
  ref=lambda k:f"(SELECT (v->>'outbox_id')::uuid FROM w WHERE k='{k}'),(SELECT (v->>'fence')::uuid FROM w WHERE k='{k}')"
  def auth(k):return f"SELECT public.tenant_smtp_lane_authorize({ref(k)})"
  def fin(k,o):return f"SELECT public.tenant_smtp_lane_finish({ref(k)},{o if o=='NULL' else repr(o)})"
  empty=lambda k:f"(SELECT v IS NULL OR v='null'::jsonb FROM w WHERE k='{k}')"
  act=lambda on,ver=1:f"SELECT public.tenant_smtp_activation_set({ver},{on})"
  # ACL
  sql+="RESET ROLE;"+ok('client cannot claim lane',"NOT has_function_privilege('authenticated','public.tenant_smtp_lane_claim(text)','EXECUTE')")
  sql+=ok('client cannot authorize lane',"NOT has_function_privilege('authenticated','public.tenant_smtp_lane_authorize(uuid,uuid)','EXECUTE')")
  sql+=ok('anon cannot finish lane',"NOT has_function_privilege('anon','public.tenant_smtp_lane_finish(uuid,uuid,text)','EXECUTE')")
  sql+=ok('service can claim lane',"has_function_privilege('service_role','public.tenant_smtp_lane_claim(text)','EXECUTE')")
  sql+=ok('lane tables private',"NOT has_table_privilege('service_role','platform_private.tenant_smtp_dispatch_jobs','SELECT') AND NOT has_table_privilege('authenticated','platform_private.tenant_smtp_lane_audit','SELECT')")
  sql+=ok('platform_private still closed to service',"NOT has_schema_privilege('service_role','platform_private','USAGE')")
  sql+=ok('public lane wrappers INVOKER',"(SELECT bool_and(NOT prosecdef) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'tenant_smtp_%')")
  sql+=ok('private definers search_path empty',"(SELECT bool_and(proconfig @> ARRAY['search_path=\"\"']) FROM pg_proc WHERE prosecdef AND pronamespace IN ('platform_private'::regnamespace,'tenant_smtp_executor'::regnamespace) AND proname LIKE 'tenant_smtp_%')")
  sql+=ok('dispatch gate inserted false',"NOT (SELECT approved FROM platform_private.tenant_smtp_dispatch_gate)")
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_f4_gate SET approved=true;UPDATE platform_private.tenant_smtp_test_gate SET approved=true;"
  sql+=prereqs(actor,svc,ADM,'a')
  sql+=actor(ADM)+ok('verified before activation',"(public.tenant_smtp_f4_status()->>'sender_verified')::boolean")
  sql+=err('dispatch gate closed refuses activation',act('true'),'42501')
  sql+=assign(1)+"RESET ROLE;"+ok('not ready: no enqueue',f"{job(1)} IS NULL AND NOT EXISTS(SELECT 1 FROM comunicacao_outbox WHERE template_chave='solicitacao_atribuida_consultor_v1')")
  sql+=svc+ok('closed gate claim returns nothing, no heartbeat',"public.tenant_smtp_lane_claim('lane-test') IS NULL")+"RESET ROLE;"+ok('no heartbeat while closed',"NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_lane_heartbeat)")
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_dispatch_gate SET approved=true;"
  sql+=actor(ADM2)+err('other tenant admin cannot activate tenant A',act('true'),'40001')
  sql+=actor(CON)+err('consultor cannot activate',act('true'),'42501')
  sql+=actor(ADM)+err('CAS version activation',act('true',2),'40001')
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_test_receipts SET completed_at=completed_at-interval '11 minutes';"+actor(ADM)+err('stale connection refuses activation',act('true'),'42501')
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_test_receipts SET completed_at=clock_timestamp();"
  sql+=actor(ADM)+ok('activation ok',f"({act('true')[7:]})->>'active'='true'")
  sql+=ok('no lane run yet: UI not operational',"(public.tenant_smtp_f4_status()->>'dispatch_enabled')='false'")
  sql+="RESET ROLE;"+ok('activation audited with real actor',f"EXISTS(SELECT 1 FROM communication_tenant_email_audit WHERE action='tenant_smtp_activated' AND actor_id='{ADM}')")
  sql+="RESET ROLE;UPDATE public.portal_solicitacoes SET consultor_atribuido=NULL WHERE id='"+sol(1)+"';"+actor(CON3)+"RESET ROLE;"+assign(1)
  sql+="RESET ROLE;"+ok('future event enqueued',f"{job(1)}='queued'")
  sql+=ok('enqueue audited with source/outbox/activated_by',f"EXISTS(SELECT 1 FROM platform_private.tenant_smtp_lane_audit a JOIN platform_private.tenant_smtp_dispatch_jobs j ON j.outbox_id=a.outbox_id WHERE a.event='enqueued' AND a.source_id='{sol(1)}' AND a.activated_by='{ADM}')")
  sql+=ok('lane row invisible to global claim shape',f"(SELECT o.status='processing' AND o.lease_expires_at IS NULL AND o.attempts=0 AND o.max_attempts=1 FROM comunicacao_outbox o JOIN platform_private.tenant_smtp_dispatch_jobs j ON j.outbox_id=o.id WHERE j.source_id='{sol(1)}')")
  sql+=ok('payload sanitized no markup',f"(SELECT payload_snapshot->>'numero'='SOL-1bx/b' FROM comunicacao_outbox o JOIN platform_private.tenant_smtp_dispatch_jobs j ON j.outbox_id=o.id WHERE j.source_id='{sol(1)}')")
  sql+=svc+ok('global claim never takes lane rows',"(SELECT count(*) FROM public.rpc_claim_communication_outbox(10,'global',60))=0")
  sql+="RESET ROLE;UPDATE public.portal_solicitacoes SET consultor_atribuido=NULL WHERE id='"+sol(1)+"';"+assign(1)+"RESET ROLE;"+ok('reassign same recipient idempotent',f"(SELECT count(*) FROM platform_private.tenant_smtp_dispatch_jobs WHERE source_id='{sol(1)}')=1")
  sql+=assign(9)+"RESET ROLE;"+ok('cross-tenant source (cliente org B, consultor org A) not enqueued',f"{job(9)} IS NULL")
  sql+=assign(2,CON2)+"RESET ROLE;"+ok('recipient from other tenant not enqueued',f"{job(2)} IS NULL")
  sql+=assign(3,NOROLE)+"RESET ROLE;"+ok('recipient without technical role not enqueued',f"{job(3)} IS NULL")
  sql+=assign(4,ADM)+"RESET ROLE;"+ok('admin (non consultant) not enqueued',f"{job(4)} IS NULL")
  sql+=assign(28)+"RESET ROLE;"+ok('expired portfolio window not enqueued',f"{job(28)} IS NULL")
  sql+=f"RESET ROLE;UPDATE public.portal_solicitacoes SET status='concluida' WHERE id='{sol(5)}';"+assign(5)+"RESET ROLE;"+ok('ineligible source state not enqueued',f"{job(5)} IS NULL")
  sql+="RESET ROLE;"+f"INSERT INTO public.comunicacao_eventos(id,event_key,source_type,source_id,payload,idempotency_key,status) VALUES('f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0','tenant.smtp.solicitacao_atribuida','portal_solicitacoes','{sol(6)}','{{}}','forged-event-0001','processed');"
  sql+=f"INSERT INTO public.comunicacao_outbox(id,event_id,template_chave,template_versao,template_snapshot,canal,recipient_user_id,status,attempts,max_attempts,locked_by,idempotency_key) VALUES('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1','f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0','solicitacao_atribuida_consultor_v1',1,'{{}}','email','{CON}','processing',0,1,'tenant_smtp_lane','forged-outbox-0001');"
  sql+="RESET ROLE;"+ok('forged insert without ticket dropped',"NOT EXISTS(SELECT 1 FROM comunicacao_outbox WHERE id='f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1')")
  # Happy path with server authorization before envelope.
  sql+=lclaim('j1')+"RESET ROLE;"+ok('claim returns proven recipient only',"(SELECT v->>'recipient'='consultor@tenant-a.test' AND v ? 'password' AND v->'config'->>'port'='465' FROM w WHERE k='j1')")
  sql+=ok('heartbeat recorded by real claim',"EXISTS(SELECT 1 FROM platform_private.tenant_smtp_lane_heartbeat)")
  sql+=actor(ADM)+ok('UI operational only after lane run',"(public.tenant_smtp_f4_status()->>'dispatch_enabled')='true'")
  sql+=svc+err('finish sent without authorization conflicts',fin('j1','sent'),'40001')
  sql+=svc+err('authorize wrong fence',f"SELECT public.tenant_smtp_lane_authorize((SELECT (v->>'outbox_id')::uuid FROM w WHERE k='j1'),'99999999-9999-4999-8999-999999999999')",'40001')
  sql+=svc+ok('authorize ok',f"({auth('j1')[7:]})->>'ok'='true'")+ok('authorize twice refused (single use)',f"({auth('j1')[7:]})->>'ok'='false'")
  sql+=err('NULL outcome refused',fin('j1','NULL'),'22023')
  sql+=ok('finish sent',f"({fin('j1','sent')[7:]})->>'state'='sent'")+ok('same outcome replay idempotent',f"({fin('j1','sent')[7:]})->>'replay'='true'")
  sql+=err('different outcome replay conflicts',fin('j1','failed'),'40001')
  sql+="RESET ROLE;"+ok('outbox sent',f"{obx(1)}='sent'")
  # Source revocation between enqueue and claim: cancellation, deletion, reassignment, unassignment, client/tenant change.
  for i in (20,21,22,23,24,25,26,27): sql+=assign(i)
  sql+="RESET ROLE;"+ok('eight revocation fixtures queued',f"(SELECT count(*) FROM platform_private.tenant_smtp_dispatch_jobs WHERE state='queued')=8")
  sql+=f"""RESET ROLE;UPDATE public.portal_solicitacoes SET consultor_atribuido=NULL WHERE id='{sol(20)}';
UPDATE public.portal_solicitacoes SET consultor_atribuido='{CON3}' WHERE id='{sol(21)}';
UPDATE public.portal_solicitacoes SET status='cancelada' WHERE id='{sol(22)}';
DELETE FROM public.portal_solicitacoes WHERE id='{sol(23)}';
UPDATE public.clientes SET status_cliente='inativo' WHERE id='{CLI3}';
UPDATE public.portal_solicitacoes SET cliente_id='{CLI2}' WHERE id='{sol(25)}';
UPDATE public.clientes SET organization_id='{ORG2}' WHERE id='{CLI4}';
UPDATE public.user_clientes SET revoked_at=now() WHERE user_id='{CON}' AND cliente_id='{CLI5}';"""
  sql+=lclaim('rev')+"RESET ROLE;"+ok('revoked sources never return recipient or credential',empty('rev'))
  for i,c in ((20,'source_unassigned'),(21,'source_reassigned'),(22,'source_state_ineligible'),(23,'source_missing'),(24,'client_ineligible'),(25,'source_client_changed'),(26,'client_tenant_changed'),(27,'recipient_portfolio_revoked')):
   sql+=ok(f'revoked {c} cancelled',f"{job(i)}='cancelled' AND {code(i)}='{c}' AND {obx(i)}='cancelled'")
  sql+=ok('cancellations audited per source',"(SELECT count(*) FROM platform_private.tenant_smtp_lane_audit WHERE event='cancelled')=8")
  # Pause between claim and authorize: no envelope.
  sql+=assign(30)+lclaim('j30')+actor(ADM)+ok('pause ok during lease',f"({act('false')[7:]})->>'active'='false'")
  sql+=svc+ok('authorize after pause withheld',f"({auth('j30')[7:]})->>'reason'='tenant_not_ready'")
  sql+="RESET ROLE;"+ok('withheld job cancelled + audited',f"{job(30)}='cancelled' AND {obx(30)}='cancelled' AND EXISTS(SELECT 1 FROM platform_private.tenant_smtp_lane_audit WHERE event='withheld' AND source_id='{sol(30)}')")
  sql+=ok('pause audited with real actor',f"EXISTS(SELECT 1 FROM communication_tenant_email_audit WHERE action='tenant_smtp_paused' AND actor_id='{ADM}')")
  sql+=svc+err('finish after withheld conflicts',fin('j30','sent'),'40001')
  sql+=assign(31)+"RESET ROLE;"+ok('paused tenant: no enqueue',f"{job(31)} IS NULL")
  sql+=actor(ADM)+ok('reactivate',f"({act('true')[7:]})->>'active'='true'")
  sql+="RESET ROLE;UPDATE public.portal_solicitacoes SET consultor_atribuido=NULL WHERE id='"+sol(31)+"';"+assign(31)
  # Ambiguous after authorization: dead_letter, never re-claimed.
  sql+=lclaim('j31')+svc+f"SELECT {auth('j31')[7:]};"+ok('ambiguous terminal',f"({fin('j31','ambiguous')[7:]})->>'state'='ambiguous'")
  sql+="RESET ROLE;"+ok('ambiguous -> dead_letter',f"{obx(31)}='dead_letter'")
  sql+=lclaim('after31')+"RESET ROLE;"+ok('ambiguous never re-claimed',empty('after31'))
  # Lease expired before authorization: failed, no message possible.
  sql+=assign(32)+lclaim('j32')+f"RESET ROLE;UPDATE platform_private.tenant_smtp_dispatch_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE source_id='{sol(32)}';"
  sql+=svc+ok('expired lease cannot authorize',f"({auth('j32')[7:]})->>'reason'='lease_lost'")
  sql+=lclaim('after32')+"RESET ROLE;"+ok('expired before auth -> failed',f"{job(32)}='failed' AND {code(32)}='lease_expired_before_auth' AND {obx(32)}='failed'")
  # Lease expired after authorization: terminal, late result is lost (not counted).
  sql+=assign(33)+lclaim('j33')+svc+f"SELECT {auth('j33')[7:]};"+f"RESET ROLE;UPDATE platform_private.tenant_smtp_dispatch_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE source_id='{sol(33)}';"
  sql+=lclaim('after33')+"RESET ROLE;"+ok('expired after auth -> lease_expired dead_letter',f"{job(33)}='lease_expired' AND {obx(33)}='dead_letter'")
  sql+=svc+ok('late finish reported lost',f"({fin('j33','sent')[7:]})->>'lost'='true'")+"RESET ROLE;"+ok('late finish audited, not reopened',f"{job(33)}='lease_expired' AND EXISTS(SELECT 1 FROM platform_private.tenant_smtp_lane_audit WHERE event='late_finish' AND source_id='{sol(33)}')")
  # Source revoked between claim and authorize.
  sql+=assign(34)+lclaim('j34')+f"RESET ROLE;UPDATE public.portal_solicitacoes SET consultor_atribuido=NULL WHERE id='{sol(34)}';"
  sql+=svc+ok('unassigned during lease withheld',f"({auth('j34')[7:]})->>'reason'='source_unassigned'")
  sql+=assign(36)+lclaim('j36')+f"RESET ROLE;UPDATE public.user_clientes SET is_active=false WHERE user_id='{CON}' AND cliente_id='{CLI6}';"
  sql+=svc+ok('portfolio deactivated during lease withheld',f"({auth('j36')[7:]})->>'reason'='recipient_portfolio_revoked'")
  sql+="RESET ROLE;"+ok('portfolio withheld job cancelled',f"{job(36)}='cancelled' AND {obx(36)}='cancelled'")
  sql+=assign(35)+lclaim('j35')+"RESET ROLE;"+ok('claim binds destination hash, not plaintext',f"(SELECT recipient_hash ~ '^[0-9a-f]{{64}}$' AND row_to_json(j)::text NOT LIKE '%consultor@%' FROM platform_private.tenant_smtp_dispatch_jobs j WHERE source_id='{sol(35)}')")
  sql+=f"RESET ROLE;UPDATE auth.users SET email='consultor-novo@tenant-a.test' WHERE id='{CON}';"
  sql+=svc+ok('Auth email changed (still confirmed) during lease withheld',f"({auth('j35')[7:]})->>'reason'='recipient_changed'")
  sql+="RESET ROLE;"+ok('stale destination cancelled + audited',f"{job(35)}='cancelled' AND {code(35)}='recipient_changed' AND EXISTS(SELECT 1 FROM platform_private.tenant_smtp_lane_audit WHERE event='withheld' AND result_code='recipient_changed' AND source_id='{sol(35)}')")
  sql+=f"RESET ROLE;UPDATE auth.users SET email='consultor@tenant-a.test' WHERE id='{CON}';"
  sql+="RESET ROLE;"+ok('authorize response has no secret',"NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_lane_audit x WHERE row_to_json(x)::text ~ '(synthetic-only|consultor@|Nova solicita)')")
  sql+="RESET ROLE;UPDATE platform_private.tenant_smtp_lane_heartbeat SET seen_at=clock_timestamp()-interval '11 minutes';"+actor(ADM)+ok('stale lane heartbeat: UI not operational',"(public.tenant_smtp_f4_status()->>'dispatch_enabled')='false'")
  # Tenant B fully configured (real save/connection/verification/activation) for fairness.
  sql+=actor(ADM2)+f"SELECT public.tenant_email_settings_save(0,'{cfg}','synthetic-only');"+prereqs(actor,svc,ADM2,'b')+actor(ADM2)+ok('tenant B activation',f"({act('true')[7:]})->>'active'='true'")
  for i in range(40,61): sql+=assign(i)
  sql+=assign(81,CON2)
  sql+=svc+"""DO $$DECLARE r jsonb; n int:=0; BEGIN
 LOOP r:=public.tenant_smtp_lane_claim('lane-fair'); EXIT WHEN r IS NULL OR n>40; n:=n+1;
  PERFORM public.tenant_smtp_lane_authorize((r->>'outbox_id')::uuid,(r->>'fence')::uuid);
  PERFORM public.tenant_smtp_lane_finish((r->>'outbox_id')::uuid,(r->>'fence')::uuid,'sent'); END LOOP; END$$;"""
  sql+="RESET ROLE;"+ok('fairness: tenant B served while A over quota',f"{job(81)}='sent' AND EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs WHERE organization_id='{ORG}' AND state='queued')")
  sql+=ok('tenant A capped at 20/hour',f"(SELECT count(*) FROM platform_private.tenant_smtp_dispatch_jobs WHERE organization_id='{ORG}' AND state IN ('executing','authorized','sent','ambiguous','lease_expired') AND started_at>clock_timestamp()-interval '1 hour')=20")
  sql+=ok('B recipient is B consultant only',f"(SELECT recipient_user_id='{CON2}' AND organization_id='{ORG2}' FROM platform_private.tenant_smtp_dispatch_jobs WHERE source_id='{sol(81)}')")
  sql+="RESET ROLE;UPDATE public.portal_solicitacoes SET consultor_atribuido='"+CON+"' WHERE id BETWEEN '"+sol(61)+"' AND '"+sol(80)+"' AND cliente_id='"+CLI+"';"
  sql+="RESET ROLE;"+ok('enqueue quota exactly 50/hour per tenant',f"(SELECT count(*) FROM platform_private.tenant_smtp_dispatch_jobs WHERE organization_id='{ORG}')=50")
  sql+=f"RESET ROLE;UPDATE platform_private.tenant_smtp_dispatch_jobs SET created_at=created_at-interval '61 minutes' WHERE organization_id='{ORG}';"
  sql+="RESET ROLE;UPDATE public.portal_solicitacoes SET consultor_atribuido='"+CON+"' WHERE id BETWEEN '"+sol(90)+"' AND '"+sol(119)+"';"
  sql+=assign(83,CON2)+"RESET ROLE;"+ok('saturated tenant A has 25+ queued ahead of B',f"(SELECT count(*) FROM platform_private.tenant_smtp_dispatch_jobs WHERE organization_id='{ORG}' AND state='queued' AND created_at<(SELECT created_at FROM platform_private.tenant_smtp_dispatch_jobs WHERE source_id='{sol(83)}'))>=25")
  sql+=lclaim('j83')+"RESET ROLE;"+ok('fairness: 25+ saturated jobs do not block next tenant',"(SELECT v->>'recipient'='consultor@tenant-b.test' FROM w WHERE k='j83')")
  sql+=svc+f"SELECT {auth('j83')[7:]};SELECT {fin('j83','sent')[7:]};"
  # Config edit between claim and authorize (tenant B): version CAS withholds.
  sql+=assign(82,CON2)+lclaim('j82')+f"RESET ROLE;UPDATE communication_tenant_email_settings SET version=version+1 WHERE organization_id='{ORG2}';"
  sql+=svc+ok('config edit during lease withheld',f"({auth('j82')[7:]})->>'reason'='tenant_not_ready'")
  # Config edit A: deactivation, queued cancelled, verification invalidated.
  sql+=f"RESET ROLE;UPDATE communication_tenant_email_settings SET version=version+1 WHERE organization_id='{ORG}';"
  sql+=ok('config edit deactivates',"NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_activation WHERE active)")
  sql+=ok('config edit cancels all queued',"NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs WHERE state='queued')")
  sql+=ok('config edit invalidates verification',"NOT platform_private.tenant_smtp_f4_verified('"+ORG+"')")
  sql+=lclaim('after_edit')+"RESET ROLE;"+ok('no claim after config edit',empty('after_edit'))
  sql+=ok('no secret in ledger/outbox/audits',"NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs x WHERE row_to_json(x)::text LIKE '%synthetic-only%') AND NOT EXISTS(SELECT 1 FROM comunicacao_outbox x WHERE row_to_json(x)::text LIKE '%synthetic-only%') AND NOT EXISTS(SELECT 1 FROM communication_tenant_email_audit x WHERE row_to_json(x)::text LIKE '%synthetic-only%') AND NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_lane_audit x WHERE row_to_json(x)::text LIKE '%synthetic-only%')")
  sql+=ok('no zero actor anywhere',"NOT EXISTS(SELECT 1 FROM communication_tenant_email_audit WHERE actor_id='00000000-0000-0000-0000-000000000000')")
  # Rollback (non-destructive)
  sql+="RESET ROLE;"+(R/'rollback.sql').read_text()
  sql+=ok('rollback gate false',"NOT (SELECT approved FROM platform_private.tenant_smtp_dispatch_gate)")
  sql+=ok('rollback trigger removed',"NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='tenant_smtp_lane_solicitacao_atribuida')")
  sql+=ok('rollback history preserved',"(SELECT count(*) FROM platform_private.tenant_smtp_dispatch_jobs)>=50 AND (SELECT count(*) FROM platform_private.tenant_smtp_lane_audit)>0")
  sql+=ok('rollback revokes service',"NOT has_function_privilege('service_role','public.tenant_smtp_lane_authorize(uuid,uuid)','EXECUTE')")
  sql+=ok('rollback readiness false',"NOT tenant_smtp_executor.tenant_smtp_dispatch_ready('"+ORG2+"')")
  r=subprocess.run(cmd,input=sql,text=True,capture_output=True)
  passes=[x.split('PASS',1)[1].strip() for x in r.stderr.splitlines() if 'NOTICE:  PASS' in x]
  print('\n'.join('PASS '+p for p in passes))
  assert r.returncode==0,r.stderr[-2500:]
  print(f'F4b SQL PASS {len(passes)} checks')
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(t/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(t,ignore_errors=True)
def prereqs(actor,svc,adm,p):
 """Real F2/F3 connection receipt + real F4a challenge/confirm for `adm`. No trigger disabling, no direct state writes."""
 K={'a':'a9a9a9a9-a9a9-4a9a-8a9a-a9a9a9a9a9a9','b':'b9b9b9b9-b9b9-4b9b-8b9b-b9b9b9b9b9b9'}[p];CK={'a':'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1','b':'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2'}[p]
 r,c=f'r_{p}',f'c_{p}'
 q=actor(adm)+f"INSERT INTO w VALUES('{r}',(SELECT public.tenant_smtp_test_claim('connection',1,'{CK}',false)));"+svc
 a=f"(SELECT (v->>'job_id')::uuid FROM w WHERE k='{r}'),(SELECT (v->>'fence')::uuid FROM w WHERE k='{r}'),'{adm}'"
 q+=f"SELECT public.tenant_smtp_test_prepare({a});SELECT public.tenant_smtp_test_finish({a},'smtp_connection_ok');"
 q+=actor(adm)+f"INSERT INTO w VALUES('{c}',public.tenant_smtp_sender_challenge_claim(1,'{K}'));"+svc
 g=f"(SELECT (v->>'challenge_id')::uuid FROM w WHERE k='{c}'),(SELECT (v->>'fence')::uuid FROM w WHERE k='{c}'),'{adm}'"
 h=f"encode(sha256(convert_to(repeat('ab',16)||':'||(SELECT v->>'challenge_id' FROM w WHERE k='{c}')||':12345678','UTF8')),'hex')"
 q+=f"SELECT public.tenant_smtp_sender_challenge_prepare({g},repeat('ab',16),{h});SELECT public.tenant_smtp_sender_challenge_finish({g},'challenge_sent');"
 q+=actor(adm)+f"SELECT public.tenant_smtp_sender_challenge_confirm((SELECT (v->>'challenge_id')::uuid FROM w WHERE k='{c}'),1,'12345678');RESET ROLE;"
 return q
if __name__=='__main__':main()
