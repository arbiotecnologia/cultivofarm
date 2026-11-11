"""Independent local clone; persistent payments and deterministic wait/revocation. No network."""
import concurrent.futures, hashlib, importlib.util, json, subprocess, sys, time, uuid
from pathlib import Path
H=Path(__file__).resolve().parent; ROOT=H.parents[1]
sys.path.insert(0,'/tmp/c2neg'); import db
assert '/tmp/felig' in db.PSQL and '55901' in db.PSQL
E=H/'evidence'; OUT=E/f"attempt-{max(int(p.name[-3:]) for p in E.glob('attempt-*'))+1:03d}";OUT.mkdir()
name='c2_follow_'+uuid.uuid4().hex[:8]; admin=db.DB('postgres')
admin.sql(f'CREATE DATABASE {name} TEMPLATE c2'); d=db.DB(name)
rows=[]; calls=[]
u=lambda n:f'00000000-0000-0000-0000-{n:012d}'
FIN=u(29); ORG=u(1)
def ok(label,condition,detail=None):
 rows.append(dict(test=label,status='PASS' if condition else 'FAIL',detail=detail)); print(rows[-1]['status'],label,flush=True)
def observe(label,detail):rows.append(dict(test=label,status='OBSERVED',detail=detail))
def raw(sql):
 r=d.raw('\\set VERBOSITY verbose\n'+sql);calls.append(dict(sql=sql,exit=r.returncode,out=r.stdout,err=r.stderr));return r
def actor(sql,role='service_role',app='audit_follow'):
 claims=json.dumps(dict(sub=FIN,role=role,iat=1,exp=4102444800))
 return raw(f"SET application_name='{app}';SET ROLE {role};SET request.jwt.claim.sub='{FIN}';SET request.jwt.claims='{claims}';"+sql)
def value(r):
 a=[l for l in r.stdout.splitlines() if l.startswith('{')];return json.loads(a[-1]) if a else None
def fp():
 return d.last("SELECT md5(jsonb_build_object('po',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM partner_orders x),'forecast',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM platform_private.b2b_financial_forecasts x),'titles',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable x),'installments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM accounts_receivable_installments x),'payments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM receivable_payments x),'events',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM fiscal_events x),'stock',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM estoque_produto x),'moves',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM estoque_movimentacoes x),'os',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM ordens_servico x),'delivery',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM entregas x))::text)")
try:
 ok('candidato event-sequence exato',d.md5('public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)')=='aa4153c528a3c73311969e07cabf3fd4')
 ok('candidato diagnóstico exato',d.md5('public.fn_fiscal_invoice_eligibility(text,uuid)')=='9eab0ceb7796f6a2421617dfb4013849')
 ok('duas FKs presentes/validadas',d.last("SELECT count(*) FROM pg_constraint WHERE conname IN ('profiles_user_id_fkey','user_roles_user_id_fkey') AND convalidated")=='2')
 # Local capability seam only: source clone had deny-only rollback ACL. Reverted at the end.
 acl=d.last("SELECT proacl::text FROM pg_proc WHERE oid='rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)'::regprocedure")
 d.sql('GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid) TO service_role')
 F=ROOT/'scripts/c2-pilot-economic-approval-20261111/billing-delivery-20261111/fiscal-final-20261111/harness-diff/r12-forecast_residual_scenario.py'
 spec=importlib.util.spec_from_file_location('follow_scenario',F);S=importlib.util.module_from_spec(spec);spec.loader.exec_module(S)
 class B:
  run_raw=staticmethod(raw);last=staticmethod(d.last);sql=staticmethod(d.sql)
 class Q:
  A=ORG;UADM=u(24);u=staticmethod(u)
 order=d.last(f"SELECT partner_order_id FROM fiscal_invoices WHERE id='{u(900)}'")
 partner=d.last(f"SELECT partner_id FROM partner_orders WHERE id='{order}'")
 item=d.last(f"SELECT id FROM partner_order_items WHERE order_id='{order}' LIMIT 1")
 company=d.last(f"SELECT company_settings_id FROM fiscal_invoices WHERE id='{u(900)}'")
 # Document/XML/SENT transmission are synthetic inputs; no terminal authorization/title/allocation is inserted.
 nf=S.insert_invoice(B,Q,order,partner,company,item,10,7800,'2027-02-03')
 invoice=nf['invoice']
 prepare=lambda key:f"SELECT public.rpc_fiscal_event_sefaz_prepare_v1('{invoice}','CANCELLATION','LOCAL FOLLOWUP CANCEL REASON','{key}','{FIN}');"
 before=fp(); pending=actor('BEGIN;'+prepare('pending-before-auth')+'ROLLBACK;')
 ok('SENT/PENDING sem protocolo nega preparo sem efeitos',pending.returncode!=0 and 'FISCAL_EVENT_INVOICE_NOT_AUTHORIZED' in pending.stderr and fp()==before,pending.stderr)
 auth=S.authorize(B,nf,nf['tx'],'LOCAL-FOLLOW-CLOSE-PENDING','2027-02-03T12:00:00Z')
 state=d.sql(f"SELECT jsonb_build_object('invoice',to_jsonb(i),'transmissions',(SELECT jsonb_agg(to_jsonb(t)) FROM fiscal_sefaz_transmissions t WHERE fiscal_invoice_id=i.id),'allocations',(SELECT count(*) FROM platform_private.b2b_fiscal_allocations WHERE document_id=i.id)) FROM fiscal_invoices i WHERE id='{invoice}'") if d.last("SELECT to_regclass('platform_private.b2b_fiscal_allocations') IS NOT NULL")=='t' else d.sql(f"SELECT to_jsonb(i) FROM fiscal_invoices i WHERE id='{invoice}'")
 observe('autorização efetiva pelo H13 com financeiro pendente por excesso do controle',dict(callback=value(auth),exit=auth.returncode,state=state))
 ok('callback real registra autorização fiscal com reconciliação pendente',auth.returncode==0 and value(auth).get('reconciliationPending') is True,value(auth))
 before=fp(); normal=actor('BEGIN;'+prepare('normal-rollback')+'ROLLBACK;')
 ok('preparo aceita evidência autorizada mesmo close-pending; rollback sem efeitos',normal.returncode==0 and value(normal).get('eventId') and fp()==before,dict(out=normal.stdout,err=normal.stderr))
 # Holder/waiter proved with pg_blocking_pids AND an ungranted lock. No time-based race assumption.
 for label,mutation,restore in [('actor',f"UPDATE profiles SET ativo=false WHERE user_id='{FIN}'",f"UPDATE profiles SET ativo=true WHERE user_id='{FIN}'"),('company',f"UPDATE organizations SET ativo=false WHERE id='{ORG}'",f"UPDATE organizations SET ativo=true WHERE id='{ORG}'")]:
  before=fp();holder=subprocess.Popen(d.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
  holder.stdin.write(f"BEGIN;SELECT id FROM fiscal_invoices WHERE id='{invoice}' FOR UPDATE;SELECT 'HOLDER:'||pg_backend_pid();\n");holder.stdin.flush()
  while True:
   line=holder.stdout.readline().strip()
   if line.startswith('HOLDER:'):pid=int(line.split(':')[1]);break
   if holder.poll() is not None:raise RuntimeError('holder failed')
  key='wait-'+label+'-'+uuid.uuid4().hex;app='wait_'+label
  with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
   future=pool.submit(actor,prepare(key),'service_role',app)
   deadline=time.monotonic()+15;proof=None
   while time.monotonic()<deadline:
    text=d.last(f"SELECT jsonb_build_object('holder',{pid},'waiter',a.pid,'blocking',pg_blocking_pids(a.pid),'ungranted',(SELECT count(*) FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted)) FROM pg_stat_activity a WHERE a.application_name='{app}' AND {pid}=ANY(pg_blocking_pids(a.pid)) AND EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted)")
    if text:proof=json.loads(text);break
    time.sleep(.03)
   if not proof:raise RuntimeError('wait not demonstrated')
   revoked=raw(mutation+';');ok(label+' revogado em conexão separada após espera comprovada',revoked.returncode==0,proof)
   holder.stdin.write('ROLLBACK;\n');holder.stdin.close();holder.wait(timeout=15)
   denied=future.result(timeout=20)
  ok(label+' revalidação pós-lock nega 42501 sem efeitos',denied.returncode!=0 and '42501' in denied.stderr and fp()==before,dict(proof=proof,err=denied.stderr))
  retry=actor(prepare(key));ok(label+' reexecução revogada também nega sem efeitos',retry.returncode!=0 and fp()==before,retry.stderr)
  raw(restore+';');control=actor('BEGIN;'+prepare(key)+'ROLLBACK;')
  ok(label+' controle restaurado aceita e rollback preserva estado',control.returncode==0 and fp()==before,control.stderr)
 # Persist a genuine partial receipt, then use a fresh connection for cancellation.
 title=d.last(f"SELECT receivable_id FROM fiscal_invoices WHERE id='{u(900)}'");inst=d.last(f"SELECT id FROM accounts_receivable_installments WHERE receivable_id='{title}' LIMIT 1")
 payload=json.dumps(dict(amount_received=1,payment_method_id=u(92),payment_date='2027-02-03',idempotency_key='follow-payment-'+uuid.uuid4().hex,has_receipt=True))
 payment=f"SELECT public.rpc_register_receivable_payment('{inst}','{payload}'::jsonb);"
 pay=actor(payment,'authenticated');ok('pagamento R$1 real COMMIT antes de cancelamento',pay.returncode==0,pay.stdout+pay.stderr)
 paid=json.loads(d.last(f"SELECT jsonb_build_object('title',to_jsonb(r),'installment',to_jsonb(i),'payments',(SELECT jsonb_agg(to_jsonb(p)) FROM receivable_payments p WHERE installment_id=i.id)) FROM accounts_receivable r JOIN accounts_receivable_installments i ON i.receivable_id=r.id WHERE i.id='{inst}'"))
 ok('nova conexão comprova título R$10 parcial R$1 persistido',paid['installment']['original_amount']==10 and paid['installment']['received_amount']==1 and paid['installment']['status']=='PARTIAL',paid)
 before=fp();cancel=f"SELECT public.rpc_cancel_accounts_receivable('{title}','LOCAL PERSISTED PAYMENT DENIAL');"
 denied=actor(cancel,'authenticated');ok('outra transação nega cancelar pago parcialmente sem efeito',denied.returncode!=0 and '23514' in denied.stderr and fp()==before,denied.stderr)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  p=pool.submit(actor,payment,'authenticated');c=pool.submit(actor,cancel,'authenticated');pr,cr=p.result(),c.result()
 ok('replay pagamento concorrente com cancelamento não duplica nem estorna',pr.returncode==0 and cr.returncode!=0 and '23514' in cr.stderr and fp()==before,dict(payment=pr.stdout,cancel=cr.stderr))
 payload2=json.loads(payload);payload2['idempotency_key']='follow-second-'+uuid.uuid4().hex
 payment2=f"SELECT public.rpc_register_receivable_payment('{inst}','{json.dumps(payload2)}'::jsonb);"
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  p=pool.submit(actor,payment2,'authenticated');c=pool.submit(actor,cancel,'authenticated');pr,cr=p.result(),c.result()
 ok('novo pagamento concorrente R$1 vence; cancelamento nega recebimento já persistido',pr.returncode==0 and cr.returncode!=0 and '23514' in cr.stderr and d.last(f"SELECT received_amount FROM accounts_receivable_installments WHERE id='{inst}'")=='2.00',dict(payment=pr.stdout,cancel=cr.stderr))
 before=fp()
 rolled=actor('BEGIN;'+prepare('after-partial-payment')+'ROLLBACK;');ok('preparo fiscal não decide estorno do título pago; rollback sem efeitos',rolled.returncode==0 and fp()==before,rolled.stderr)
 prepared=actor(prepare('paid-fiscal-event'));event=value(prepared)
 ok('preparo com título parcial mantém porta fiscal sem política financeira inventada',prepared.returncode==0,event)
 if event:
  eid=event['eventId'];sig=hashlib.sha256(b'local-follow-event-signature').hexdigest();tid=str(uuid.uuid4())
  signed=actor(f"SELECT public.rpc_fiscal_event_sefaz_mark_signed_v1('{eid}','eventos/local/follow.xml','{sig}','{FIN}');")
  ok('assinatura entrada sintética registrada pela RPC',signed.returncode==0,signed.stderr)
  transmission=actor(f"INSERT INTO fiscal_sefaz_transmissions(id,fiscal_invoice_id,fiscal_event_id,service,environment_code,endpoint_host,endpoint_url,idempotency_key,request_fingerprint,state,outcome,created_by) VALUES('{tid}','{invoice}','{eid}','NFeRecepcaoEvento4','2','hnfe.fazenda.mg.gov.br','https://hnfe.fazenda.mg.gov.br/LOCAL-NO-NETWORK','follow-{tid}','{sig}','SENT','PENDING','{FIN}')")
  ok('transmissão sintética respeita ator/empresa pelo trigger real',transmission.returncode==0,transmission.stderr)
  body=json.dumps(dict(cStat='135',nProt='LOCAL-FOLLOW-PAID-CANCEL',chNFe=nf['access_key'],tpAmb='2',xMotivo='LOCAL REGISTERED'))
  financial=d.last(f"SELECT md5(concat_ws('|',(SELECT to_jsonb(r)::text FROM accounts_receivable r WHERE id='{title}'),(SELECT to_jsonb(i)::text FROM accounts_receivable_installments i WHERE id='{inst}'),(SELECT jsonb_agg(to_jsonb(p) ORDER BY id)::text FROM receivable_payments p WHERE installment_id='{inst}'))) ")
  callback=actor(f"SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{tid}','SUCCEEDED','{body}'::jsonb);")
  financial2=d.last(f"SELECT md5(concat_ws('|',(SELECT to_jsonb(r)::text FROM accounts_receivable r WHERE id='{title}'),(SELECT to_jsonb(i)::text FROM accounts_receivable_installments i WHERE id='{inst}'),(SELECT jsonb_agg(to_jsonb(p) ORDER BY id)::text FROM receivable_payments p WHERE installment_id='{inst}'))) ")
  ok('callback de documento close-pending do MESMO pedido mantém título pago de OUTRA NF',callback.returncode==0 and financial==financial2 and d.last(f"SELECT count(*) FROM fiscal_events WHERE related_event_id='{eid}' AND event_type='SEFAZ_EVENT_REGISTERED'")=='1',dict(out=callback.stdout,err=callback.stderr))
  paid_tx=d.last(f"SELECT id FROM fiscal_sefaz_transmissions WHERE fiscal_invoice_id='{u(900)}' AND fiscal_event_id IS NOT NULL AND outcome='EVENT_REGISTERED' ORDER BY created_at LIMIT 1")
  paid_body=d.last(f"SELECT response_summary::text FROM fiscal_sefaz_transmissions WHERE id='{paid_tx}'")
  before=fp();paid_cb=actor(f"SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{paid_tx}','SUCCEEDED','{paid_body.replace(chr(39),chr(39)*2)}'::jsonb);")
  ok('replay callback da própria NF paga preserva pagamento e demais efeitos',paid_cb.returncode==0 and fp()==before,dict(out=paid_cb.stdout,err=paid_cb.stderr))
  observe('limite pagamento/fiscal','Cancelamento financeiro novo testado na própria NF paga; callback novo usa documento close-pending do mesmo pedido, sem título próprio. Na própria NF paga foi testado replay de registro anterior, não primeiro registro após pagamento. Não certifica cascata nem política.')
 d.sql('REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid) FROM service_role')
 ok('ACL deny-only restaurada',d.last("SELECT proacl::text FROM pg_proc WHERE oid='rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)'::regprocedure")==acl)
 observe('limite', 'Clone independente da restauração r12 previamente limpa; resultados fiscais/financeiros só por callbacks/RPCs. Auth e configuração são sintéticos; nenhuma prova hosted/JWT/RLS/Storage. Não define política de cancelamento.')
except Exception as exc:
 ok('harness completion',False,repr(exc))
finally:
 (OUT/'checks.json').write_text(json.dumps(dict(database=name,rows=rows),indent=2,ensure_ascii=False)+'\n')
 (OUT/'calls.json').write_text(json.dumps(calls,indent=2,ensure_ascii=False)+'\n')
 code=int(any(r['status']=='FAIL' for r in rows));(OUT/'exitcode').write_text(str(code)+'\n');print(OUT);sys.exit(code)