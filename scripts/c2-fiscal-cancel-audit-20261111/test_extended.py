"""Additional real local cancellation entries; results describe behavior, never authorize business policy."""
import concurrent.futures,hashlib,json,sys,uuid
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[1]
sys.path.insert(0,'/tmp/c2neg');sys.path.insert(0,str(ROOT/'scripts/c2-pilot-economic-approval-20261111'))
import db,fixture as X
d=db.DB('c2');m=X.Mirror.__new__(X.Mirror);m.d=d;X.A=X.u(1)
m.claims=lambda uid:f"SET ROLE authenticated;SET request.jwt.claim.sub='{uid}';SET request.jwt.claims='{json.dumps({'sub':uid,'role':'authenticated','iat':1,'exp':4102444800})}';"
E=H/'evidence';out=E/f"attempt-{max(int(p.name[-3:]) for p in E.glob('attempt-*'))+1:03d}";out.mkdir();rows=[];calls=[]
def run(uid,q,service=False,pre='',post=''):
 r=d.raw('\\set VERBOSITY verbose\n'+m.claims(uid).replace('SET ROLE authenticated','SET ROLE service_role' if service else 'SET ROLE authenticated')+pre+q+post);calls.append(dict(actor=uid,sql=pre+q+post,exit=r.returncode,out=r.stdout,err=r.stderr));return r
def val(r):
 a=[l for l in r.stdout.splitlines() if l.startswith('{')];return json.loads(a[-1]) if a else None
def ok(n,c,detail=None):rows.append(dict(test=n,status='PASS' if c else 'FAIL',detail=detail));print(rows[-1]['status'],n,flush=True)
def note(n,detail):rows.append(dict(test=n,status='OBSERVED',detail=detail))
def fp(o):return d.last(f"SELECT md5(concat_ws('|',(SELECT to_jsonb(p)::text FROM public.partner_orders p WHERE id='{o}'),(SELECT to_jsonb(f)::text FROM platform_private.b2b_financial_forecasts f WHERE order_id='{o}'),(SELECT count(*) FROM public.accounts_receivable),(SELECT count(*) FROM public.ordens_servico),(SELECT count(*) FROM public.entregas),(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'[]') FROM public.estoque_produto s)))")
# Fresh C2 order from normal creators, no final-result SQL.
PB=m.buyer_quote_order();response=m.respond_quote(PB);ok('novo pedido C2 criado e cotado por writers',response[0] is not None,response)
pre='SET c2pilot.expected_ref=\'swzpzcwiasxmjutrmvkm\';'+f"SET c2pilot.order_id='{PB}';SET c2pilot.commercial_actor='{X.UGC}';SET c2pilot.credit_actor='{X.UFIN}';SET c2pilot.hours='4';SET c2pilot.reason='LOCAL CANCEL MATRIX';"
r=d.raw(pre+(ROOT/'scripts/c2-pilot-economic-approval-20261111/05-pilot-enable.sql.review').read_text());ok('habilitação econômica estreita fixture nova',r.returncode==0,r.stderr)
h=json.loads(d.last(f"SELECT platform_private.c2_pilot_econ_evidence_v1('{PB}')"))['evidence_hash']
for kind,uid,expected in [(None,X.UFIN,'00'),('commercial',X.UGC,'10'),('credit',X.UFIN,'11')]:
 if kind:
  ap=m.call(uid,f"public.c2_pilot_economic_approve_v1('{PB}','{kind}','audit-approval-{uuid.uuid4()}','{h}','LOCAL EXPLICIT')");ok('aprovação explícita '+kind,ap[0] is not None,ap)
 f=d.last(f"SELECT count(*) FROM platform_private.b2b_financial_forecasts WHERE order_id='{PB}'");b=fp(PB)
 r=run(X.UADM,f"SELECT public.reject_partner_order('{PB}','LOCAL BEFORE AFTER FORECAST');",pre='BEGIN;',post='ROLLBACK;')
 note('reprovação matriz '+expected,dict(exit=r.returncode,err=r.stderr,out=r.stdout,forecast_count=f));ok('reprovação matriz '+expected+' sem efeitos após rollback',fp(PB)==b)
 el=val(run(X.UFIN,f"SELECT public.fn_fiscal_invoice_eligibility('PARTNER_ORDER','{PB}');"));ok('matriz '+expected+' inelegível fiscal',el is not None and el['eligible'] is False,el)
# Financial cancel with and without payment, actual RPCs, local transaction only.
INV=d.last("SELECT id FROM public.fiscal_invoices WHERE normalized_status='AUTHORIZED' ORDER BY id LIMIT 1");O=d.last(f"SELECT partner_order_id FROM public.fiscal_invoices WHERE id='{INV}'");TITLE=d.last(f"SELECT receivable_id FROM public.fiscal_invoices WHERE id='{INV}'");INST=d.last(f"SELECT id FROM public.accounts_receivable_installments WHERE receivable_id='{TITLE}' LIMIT 1");b=fp(O)
for uid,name in [(X.UFIN,'own'),(X.UADMF,'foreign')]:
 r=run(uid,f"SELECT public.rpc_cancel_accounts_receivable('{TITLE}','LOCAL CANCEL TITLE ONLY');",pre='BEGIN;',post='ROLLBACK;');note('cancel título '+name,dict(exit=r.returncode,out=r.stdout,err=r.stderr));ok('cancel título '+name+' rollback sem efeitos',fp(O)==b)
payload=json.dumps(dict(amount_received=1,payment_method_id=X.u(92),payment_date='2027-02-02',idempotency_key='local-payment-'+uuid.uuid4().hex,has_receipt=True))
payment=f"SELECT public.rpc_register_receivable_payment('{INST}','{payload}'::jsonb);"
r=run(X.UFIN,payment+f"SELECT public.rpc_cancel_accounts_receivable('{TITLE}','LOCAL MUST DENY PAID');",pre='BEGIN;',post='ROLLBACK;')
note('pagamento real seguido cancelamento na mesma transação',dict(exit=r.returncode,err=r.stderr,out=r.stdout));ok('pagamento+cancelamento aborta atomicamente sem efeito',r.returncode!=0 and fp(O)==b)
# Provider rejected, pending and registered returns on real event inputs; each case rolls back.
for stat,outcome in [('573','SUCCEEDED'),('103','SUCCEEDED'),('135','SUCCEEDED')]:
 event=str(uuid.uuid4());tx=str(uuid.uuid4());key='cancel-case-'+uuid.uuid4().hex
 prepare=f"SELECT public.rpc_fiscal_event_sefaz_prepare_v1('{INV}','CANCELLATION','LOCAL SYNTHETIC CANCEL REASON','{key}','{X.UFIN}');"
 # Previous integrated run already registered cancellation: prove subsequent prepare stays closed.
 r=run(X.UFIN,prepare,True,pre='BEGIN;',post='ROLLBACK;');ok('preparo após registro nega caso '+stat,r.returncode!=0 and 'FISCAL_EVENT_ALREADY_REGISTERED' in r.stderr,r.stderr)
# Distinct-key concurrent prepare on a newly authorized NF fixture from real callback, not SQL final state.
import importlib.util
F=ROOT/'scripts/c2-pilot-economic-approval-20261111/billing-delivery-20261111/fiscal-final-20261111/harness-diff/r12-forecast_residual_scenario.py'
spec=importlib.util.spec_from_file_location('r12_scenarios',F);S=importlib.util.module_from_spec(spec);spec.loader.exec_module(S)
class B:
 run_raw=staticmethod(d.raw);last=staticmethod(d.last);sql=staticmethod(d.sql)
class Q:
 UADM=X.UADM;A=X.A;u=staticmethod(X.u)
item=d.last(f"SELECT id FROM public.partner_order_items WHERE order_id='{O}' LIMIT 1");partner=d.last(f"SELECT partner_id FROM public.partner_orders WHERE id='{O}'");company=d.last(f"SELECT company_settings_id FROM public.fiscal_invoices WHERE id='{INV}'")
# Existing first NF allocated one package of two; second synthetic document uses the real remaining quantity.
nf=dict(invoice=X.u(4501),xml_run=X.u(4502),tx=X.u(4503),access_key=S._key(4501)) if d.last(f"SELECT count(*) FROM public.fiscal_invoices WHERE id='{X.u(4501)}'")=='1' else S.insert_invoice(B,Q,O,partner,company,item,10,4501,'2027-02-02')
auth=S.authorize(B,nf,nf['tx'],'LOCAL-SECOND-NF','2027-02-02T12:00:00Z');ok('NF2 entrada sintética autorização pelo callback real',auth.returncode==0 and val(auth).get('reconciliationPending') is False,dict(err=auth.stderr,out=auth.stdout))
def prepare2(key):return f"SELECT public.rpc_fiscal_event_sefaz_prepare_v1('{nf['invoice']}','CANCELLATION','LOCAL CONCURRENT CANCEL REASON','{key}','{X.UFIN}');"
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:res=list(pool.map(lambda k:run(X.UFIN,prepare2('distinct-'+k),True),[uuid.uuid4().hex,uuid.uuid4().hex]))
note('preparo concorrente chaves distintas',[(r.returncode,r.stderr,val(r)) for r in res])
ok('preparo concorrente não cria resultados financeiros/físicos',d.last(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{nf['invoice']}'")=='1')
# Callback reject/pending/register on actual prepared event, local transmission inputs, each rollback.
prepared=[val(r) for r in res if r.returncode==0 and val(r)];
if prepared:
 eid=prepared[0]['eventId'];sig=hashlib.sha256(b'local signed event input').hexdigest()
 signed=run(X.UFIN,f"SELECT public.rpc_fiscal_event_sefaz_mark_signed_v1('{eid}','eventos/local/extended.xml','{sig}','{X.UFIN}');",True)
 ok('pré-requisito assinatura evento via RPC real',signed.returncode==0,signed.stderr)
 for stat in ('573','103','135'):
  tid=str(uuid.uuid4());seam=f"BEGIN;INSERT INTO public.fiscal_sefaz_transmissions(id,fiscal_invoice_id,fiscal_event_id,service,environment_code,endpoint_host,endpoint_url,idempotency_key,request_fingerprint,state,outcome,created_by) VALUES('{tid}','{nf['invoice']}','{eid}','NFeRecepcaoEvento4','2','hnfe.fazenda.mg.gov.br','https://hnfe.fazenda.mg.gov.br/LOCAL-NO-NETWORK','case-{tid}','{sig}','SENT','PENDING','{X.UFIN}');"
  body=json.dumps(dict(cStat=stat,nProt='LOCAL-EVENT-'+stat,chNFe=nf['access_key'],tpAmb='2',xMotivo='LOCAL PROVIDER RESPONSE'))
  b=fp(O);r=run(X.UFIN,f"SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{tid}','SUCCEEDED','{body}'::jsonb);",True,pre=seam,post='ROLLBACK;');note('callback cancel status '+stat,dict(exit=r.returncode,err=r.stderr,out=r.stdout));ok('callback '+stat+' rollback preserva financeiro/físico',r.returncode==0 and fp(O)==b)
 # Authorization replay racing cancellation callback uses the same invoice lock in real record routine.
 tid=str(uuid.uuid4());run(X.UFIN,f"INSERT INTO public.fiscal_sefaz_transmissions(id,fiscal_invoice_id,fiscal_event_id,service,environment_code,endpoint_host,endpoint_url,idempotency_key,request_fingerprint,state,outcome,created_by) VALUES('{tid}','{nf['invoice']}','{eid}','NFeRecepcaoEvento4','2','hnfe.fazenda.mg.gov.br','https://hnfe.fazenda.mg.gov.br/LOCAL-NO-NETWORK','race-{tid}','{sig}','SENT','PENDING','{X.UFIN}');",True)
 body=json.dumps(dict(cStat='135',nProt='LOCAL-RACE-CANCEL',chNFe=nf['access_key'],tpAmb='2',xMotivo='LOCAL REGISTERED'))
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  a=pool.submit(S.authorize,B,nf,nf['tx'],'LOCAL-SECOND-NF','2027-02-02T12:00:00Z');c=pool.submit(run,X.UFIN,f"SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{tid}','SUCCEEDED','{body}'::jsonb);",True);ar,cr=a.result(),c.result()
 note('autorização replay × confirmação cancelamento',dict(auth_exit=ar.returncode,auth_err=ar.stderr,cancel_exit=cr.returncode,cancel_err=cr.stderr,cancel_out=cr.stdout));ok('corrida não duplica título NF2',d.last(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{nf['invoice']}'")=='1')
(out/'checks.json').write_text(json.dumps(dict(order=PB,rows=rows),indent=2,ensure_ascii=False)+'\n');(out/'calls.json').write_text(json.dumps(calls,indent=2,ensure_ascii=False)+'\n');(out/'exitcode').write_text('1\n' if any(r['status']=='FAIL' for r in rows) else '0\n');print(out);sys.exit(1 if any(r['status']=='FAIL' for r in rows) else 0)