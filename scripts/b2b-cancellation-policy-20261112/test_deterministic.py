"""Disposable callbacks: deterministic wait detection, recovery, opaque negatives."""
import concurrent.futures,hashlib,json,subprocess,sys,time,uuid
from pathlib import Path
sys.path.insert(0,'/tmp/c2neg');import db
H=Path(__file__).resolve().parent;out=H/'evidence'/('deterministic-'+uuid.uuid4().hex[:8]);out.mkdir();rows=[]
u=lambda n:f'00000000-0000-0000-0000-{n:012d}'
base=db.DB();invoice=u(900);order=base.last(f"select partner_order_id from fiscal_invoices where id='{invoice}'");partner=base.last(f"select partner_id from partner_orders where id='{order}'")
def check(n,c,detail=None):
 rows.append(dict(test=n,status='PASS' if c else 'FAIL',detail=detail));print(rows[-1]['status'],n,flush=True)
def call(d,q,uid=u(29),role='service_role',tag=''):
 claims=json.dumps(dict(sub=uid,role=role,iat=1,exp=4102444800))
 return d.raw('\\set VERBOSITY verbose\n'+f"SET application_name='{tag}';SET ROLE {role};SET request.jwt.claim.sub='{uid}';SET request.jwt.claims='{claims}';"+q)
def val(r):
 lines=[x for x in r.stdout.splitlines() if x.startswith('{')];return json.loads(lines[-1]) if lines else None
def clone():
 name='det_'+uuid.uuid4().hex[:12];db.DB('postgres').sql(f'CREATE DATABASE {name} TEMPLATE c2');return db.DB(name)
def snapshot(d):
 return d.last("select md5(jsonb_build_object('notes',(select jsonb_agg(to_jsonb(x) order by id) from fiscal_invoices x),'titles',(select jsonb_agg(to_jsonb(x) order by id) from accounts_receivable x),'installments',(select jsonb_agg(to_jsonb(x) order by id) from accounts_receivable_installments x),'stock',(select jsonb_agg(to_jsonb(x) order by id) from estoque_produto x),'delivery',(select jsonb_agg(to_jsonb(x) order by id) from entregas x),'os',(select jsonb_agg(to_jsonb(x) order by id) from ordens_servico x),'forecast',(select jsonb_agg(to_jsonb(x) order by id) from platform_private.b2b_financial_forecasts x))::text)")
def prepared(d,variant='normal'):
 e=val(call(d,f"SELECT rpc_fiscal_event_sefaz_prepare_v1('{invoice}','CANCELLATION','LOCAL DETERMINISTIC CANCEL','det-{uuid.uuid4()}','{u(29)}');"));assert e
 sha=hashlib.sha256(b'local deterministic signed input').hexdigest();r=call(d,f"SELECT rpc_fiscal_event_sefaz_mark_signed_v1('{e['eventId']}','eventos/local/det.xml','{sha}','{u(29)}');");assert r.returncode==0,r.stderr
 tid=str(uuid.uuid4());event_sql='NULL' if variant=='sem-evento' else "'"+e['eventId']+"'";r=call(d,f"INSERT INTO fiscal_sefaz_transmissions(id,fiscal_invoice_id,fiscal_event_id,service,environment_code,endpoint_host,endpoint_url,idempotency_key,request_fingerprint,state,outcome,created_by) VALUES('{tid}','{invoice}',{event_sql},'NFeRecepcaoEvento4','2','hnfe.fazenda.mg.gov.br','https://hnfe.fazenda.mg.gov.br/LOCAL-NO-NETWORK','{tid}','{sha}','SENT','PENDING','{u(29)}');")
 if variant=='sem-evento':return tid,r
 assert r.returncode==0,r.stderr
 body=json.dumps(dict(cStat='136' if variant=='registro-nao-cancelamento' else '135',nProt='LOCAL-DETERMINISTIC',chNFe='9'*44 if variant=='chave' else e['accessKey'],tpAmb='2',xMotivo='LOCAL FINAL'))
 return tid,f"SELECT rpc_fiscal_sefaz_transmit_record_v1('{tid}','SUCCEEDED','{body}'::jsonb);"
def authq(d):
 tx=d.last(f"select id from fiscal_sefaz_transmissions where fiscal_invoice_id='{invoice}' and outcome='AUTHORIZED' order by id limit 1")
 return tx,f"SELECT rpc_fiscal_sefaz_transmit_record_v1('{tx}','SUCCEEDED','{{}}'::jsonb);"
def blocked(d,locksql,query,mutation,uid=u(29),role='service_role'):
 tag='wait_'+uuid.uuid4().hex;holder=subprocess.Popen(d.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 holder.stdin.write('BEGIN;'+locksql+';SELECT pg_backend_pid();\n');holder.stdin.flush()
 while True:
  line=holder.stdout.readline().strip()
  if line.isdigit():pid=int(line);break
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
  work=pool.submit(call,d,query,uid,role,tag);seen=False
  for _ in range(400):
   if d.last(f"select exists(select 1 from pg_stat_activity a where a.application_name='{tag}' and {pid}=ANY(pg_blocking_pids(a.pid)) and exists(select 1 from pg_locks l where l.pid=a.pid and NOT l.granted))")=='t':seen=True;break
   time.sleep(.025)
  check('holder + waiter não concedido '+tag,seen)
  if seen:d.sql(mutation)
  holder.stdin.write('COMMIT;\n');holder.stdin.flush();holder.stdin.close();holder.wait(timeout=10)
  r=work.result(timeout=20);return r
try:
 # Canonical recovery: generate close-pending by replaying the captured pre-candidate bridge.
 d=clone();tx,q=authq(d);d.sql((H/'capture/bridge.sql').read_text());r=call(d,q)
 check('reprodução causa forbidden_partner gera CLOSE_PENDING',r.returncode==0 and d.last(f"select count(*) from platform_private.fiscal_close_pending where transmission_id='{tx}' and error_code='FISCAL_AUTHORIZATION_CLOSE_PENDING'")=='1',r.stdout)
 candidate=base.body('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)');d.sql(candidate);before=snapshot(d);r=call(d,q)
 check('recuperação canônica remove pendência sem recriar título/parcela',r.returncode==0 and d.last(f"select count(*) from platform_private.fiscal_close_pending where transmission_id='{tx}'")=='0' and snapshot(d)==before,r.stdout)
 tid,cancel=prepared(d);r=call(d,cancel);check('após recuperação cancela uma vez',r.returncode==0 and d.last(f"select normalized_status from fiscal_invoices where id='{invoice}'")=='CANCELED',r.stderr)
 s=snapshot(d);r=call(d,q);check('replay autorização terminal não ressuscita NF ou título',r.returncode==0 and snapshot(d)==s and d.last(f"select count(*) from platform_private.fiscal_close_pending where transmission_id='{tx}'")=='0',r.stdout)
 # True pending: revoke accounting validation input, preserving immutable events.
 d=clone();tx,q=authq(d);r=call(d,f"UPDATE company_fiscal_settings SET configuration_status='PENDING_ACCOUNTING',accounting_validated_at=NULL WHERE id=(select company_settings_id from fiscal_invoices where id='{invoice}');");assert r.returncode==0,r.stderr
 r=call(d,q)
 check('contabilidade inválida mantém pendência real',d.last(f"select count(*) from platform_private.fiscal_close_pending where transmission_id='{tx}'")=='1',r.stdout)
 _,cancel=prepared(d);before=snapshot(d);r=call(d,cancel);check('pendência verdadeira bloqueia cancelamento financeiro',snapshot(d)==before and 'FISCAL_AUTHORIZATION_RECONCILIATION_PENDING' in r.stdout,r.stdout)
 r=call(d,f"UPDATE company_fiscal_settings SET configuration_status='VALIDATED',accounting_validated_at=clock_timestamp() WHERE id=(select company_settings_id from fiscal_invoices where id='{invoice}');");assert r.returncode==0,r.stderr
 r=call(d,q);check('reconciliação após validação contábil real remove pendência',r.returncode==0 and d.last(f"select count(*) from platform_private.fiscal_close_pending where transmission_id='{tx}'")=='0')
 r=call(d,cancel);check('recuperação após pendência verdadeira cancela sem duplicar',r.returncode==0 and d.last(f"select normalized_status from fiscal_invoices where id='{invoice}'")=='CANCELED' and d.last(f"select count(*) from financial_audit_log where action='AR_CANCELED' AND entity_id=(select receivable_id from fiscal_invoices where id='{invoice}')")=='1',r.stderr)
 # Both deterministic orders: lock invoice until the other callback is waiting.
 for first in ['authorization','cancellation']:
  d=clone();_,cancel=prepared(d);_,q=authq(d)
  r=blocked(d,f"SELECT id FROM fiscal_invoices WHERE id='{invoice}' FOR UPDATE",q if first=='cancellation' else cancel,'SELECT 1')
  check('espera callback '+first,r.returncode==0,r.stderr)
  r=call(d,cancel if first=='cancellation' else q);check('ordem '+first+' final e auditoria única',r.returncode==0 and d.last(f"select normalized_status from fiscal_invoices where id='{invoice}'")=='CANCELED' and d.last(f"select count(*) from financial_audit_log where action='AR_CANCELED' AND entity_id=(select receivable_id from fiscal_invoices where id='{invoice}')")=='1',r.stderr)
 # Revocation under a proven invoice wait, rolled back/re-authorized control in each clone.
 for kind,mutation,restore in [
  ('ator',f"UPDATE profiles SET ativo=false WHERE user_id='{u(29)}'",f"UPDATE profiles SET ativo=true WHERE user_id='{u(29)}'"),
  ('empresa',f"UPDATE profiles SET organization_id='{u(2)}' WHERE user_id='{u(29)}'",f"UPDATE profiles SET organization_id='{u(1)}' WHERE user_id='{u(29)}'"),
  ('gate','UPDATE platform_private.b2b_cancel_policy_gate_v1 SET enabled=false','UPDATE platform_private.b2b_cancel_policy_gate_v1 SET enabled=true'),
  ('concessão','UPDATE platform_private.b2b_cancel_policy_allowlist_v1 SET revoked_at=clock_timestamp()','UPDATE platform_private.b2b_cancel_policy_allowlist_v1 SET revoked_at=NULL')]:
  d=clone();_,cancel=prepared(d);before=snapshot(d)
  r=blocked(d,f"SELECT id FROM fiscal_invoices WHERE id='{invoice}' FOR UPDATE",cancel,mutation)
  check(kind+' revogado durante espera nega sem efeitos',snapshot(d)==before and (r.returncode!=0 or '"final": false' in r.stdout or '"reconciliationPending": true' in r.stdout),dict(out=r.stdout,err=r.stderr))
  d.sql(restore);r=call(d,cancel);check(kind+' controle reautorizado recupera',r.returncode==0 and d.last(f"select normalized_status from fiscal_invoices where id='{invoice}'")=='CANCELED',r.stderr)
 # Event provenance negatives and scope uniformity.
 for kind in ['sem-evento','chave','evento-empresa','ator-empresa','registro-nao-cancelamento']:
  d=clone();tid,cancel=prepared(d,kind)
  if kind=='sem-evento':check('entrada sem evento negada pela guarda real',cancel.returncode!=0 and 'SEFAZ_EVENT_REQUIRED' in cancel.stderr,cancel.stderr);continue
  if kind=='evento-empresa':
   claims=json.dumps(dict(sub=u(29),role='authenticated',iat=1));r=d.raw(f"SET request.jwt.claim.sub='{u(29)}';SET request.jwt.claims='{claims}';UPDATE fiscal_events SET organization_id='{u(2)}' WHERE id=(select fiscal_event_id from fiscal_sefaz_transmissions where id='{tid}');")
   if r.returncode!=0:check('evento estrangeiro barrado por integridade real', 'tenant_scope_violation' in r.stderr,r.stderr);continue
  before=snapshot(d);r=call(d,cancel,u(25) if kind=='ator-empresa' else u(29));check(kind+' não cancela documento/título/estoque/OS/entrega',snapshot(d)==before and (r.returncode!=0 or '"final": true' not in r.stdout),dict(out=r.stdout,err=r.stderr))
 # Residual capability and writer negative states; only input seams, rollback assertions.
 for kind in ['pendente','sem-previsao','sem-concessao','estrangeiro']:
  d=clone();version=d.last(f"select version from platform_private.b2b_financial_forecasts where order_id='{order}'")
  d.sql(f"INSERT INTO platform_private.b2b_forecast_lifecycle_allowlist_v1(operation,actor_id,organization_id,partner_id,order_id,synthetic,valid_until,created_by) VALUES('forecast_cancel','{u(30)}','{u(1)}','{partner}','{order}',true,now()+interval '1 hour','{u(24)}')")
  if kind in ['pendente','sem-previsao']:
   items=json.dumps([dict(item_id=u(32),item_tipo='produto',packaging_id=u(51),quantidade=2)])
   current=int(d.last(f"select max(version) from platform_private.b2b_condition_versions where plan_id='{u(81)}' and method='boleto'"))
   choice=json.dumps(dict(payment_method='boleto',payment_condition_version=current,payment_deadline_days=30))
   r=call(d,f"UPDATE company_fiscal_settings SET configuration_status='PENDING_ACCOUNTING',accounting_validated_at=NULL WHERE id=(select company_settings_id from fiscal_invoices where id='{invoice}');");assert r.returncode==0,r.stderr
   r=call(d,f"SELECT simulate_b2b_payment_condition_secure('{partner}','{u(81)}','{items}'::jsonb,'{choice}'::jsonb);",u(21),'authenticated');sim=val(r);assert sim,r.stderr
   journal=val(call(d,f"SELECT recover_partner_order_attempt_v1('{partner}',NULL,NULL,false,NULL);",u(21),'authenticated'));assert journal
   if journal.get('state')=='committed':journal=val(call(d,f"SELECT recover_partner_order_attempt_v1('{partner}','{journal['key']}',{journal['generation']},true,'{journal['order_id']}');",u(21),'authenticated'))
   r=call(d,f"SELECT create_partner_order_condition_secure('{partner}',NULL,'{items}'::jsonb,NULL,'{u(81)}','{sim['cart_hash']}','{journal['key']}','{choice}'::jsonb);",u(21),'authenticated');created=val(r);assert created,r.stderr
   target=created['id'];check(kind+' entrada real C2 pendente sem previsão',d.last(f"select (approved_at IS NULL AND approved_by IS NULL AND c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' AND internal_economic_snapshot IS NULL AND NOT EXISTS(select 1 from platform_private.b2b_financial_forecasts where order_id=po.id)) from partner_orders po where id='{target}'")=='t')
   d.sql(f"INSERT INTO platform_private.b2b_forecast_lifecycle_allowlist_v1(operation,actor_id,organization_id,partner_id,order_id,synthetic,valid_until,created_by) VALUES('forecast_cancel','{u(30)}','{u(1)}','{partner}','{target}',true,now()+interval '1 hour','{u(24)}')")
  else:target=order
  if kind=='sem-concessao':d.sql(f"UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET revoked_at=now() WHERE actor_id='{u(30)}'")
  actor=u(25) if kind=='estrangeiro' else u(30);before=snapshot(d)
  r=call(d,f"SELECT rpc_b2b_cancel_residual_capability_v1('{target}');",actor,'authenticated');check(kind+' capacidade opaca indisponível',val(r)=={'available':False},dict(out=r.stdout,err=r.stderr))
  r=call(d,f"SELECT rpc_b2b_forecast_cancel_residual_v1('{target}',{version},'LOCAL NEGATIVE');",actor,'authenticated');check(kind+' writer nega sem efeitos',r.returncode!=0 and snapshot(d)==before,r.stderr)
 # Residual revocation after a proven order wait, same canonical grant/gate.
 for kind,mutation in [('ator',f"UPDATE profiles SET ativo=false WHERE user_id='{u(30)}'"),('empresa',f"UPDATE profiles SET organization_id='{u(2)}' WHERE user_id='{u(30)}'"),('gate','UPDATE platform_private.b2b_cancel_policy_gate_v1 SET enabled=false'),('concessão',f"UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET revoked_at=clock_timestamp() WHERE actor_id='{u(30)}'")]:
  d=clone();v=d.last(f"select version from platform_private.b2b_financial_forecasts where order_id='{order}'")
  d.sql(f"INSERT INTO platform_private.b2b_forecast_lifecycle_allowlist_v1(operation,actor_id,organization_id,partner_id,order_id,synthetic,valid_until,created_by) VALUES('forecast_cancel','{u(30)}','{u(1)}','{partner}','{order}',true,now()+interval '1 hour','{u(24)}')")
  before=snapshot(d);q=f"SELECT rpc_b2b_forecast_cancel_residual_v1('{order}',{v},'LOCAL WAIT');"
  r=blocked(d,f"SELECT id FROM partner_orders WHERE id='{order}' FOR UPDATE",q,mutation,u(30),'authenticated')
  check('residual '+kind+' revogado após espera nega e preserva 1+1',r.returncode!=0 and '42501' in r.stderr and snapshot(d)==before,r.stderr)
except Exception as e:check('harness',False,repr(e))
(out/'checks.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n');code=int(any(x['status']=='FAIL' for x in rows));(out/'exitcode').write_text(str(code));print(out);sys.exit(code)