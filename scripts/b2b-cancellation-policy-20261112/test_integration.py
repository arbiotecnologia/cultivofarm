"""Actual callbacks/RPCs in disposable r12; no inserted final results."""
import concurrent.futures,hashlib,json,sys,uuid
from pathlib import Path
H=Path(__file__).resolve().parent;sys.path.insert(0,'/tmp/c2neg');import db
d=db.DB();assert '/tmp/felig' in d.psql()
out=H/'evidence'/('attempt-'+str(len(list((H/'evidence').glob('attempt-*')))+1).zfill(3));out.mkdir();rows=[];calls=[]
u=lambda n:f'00000000-0000-0000-0000-{n:012d}'
def run(q,uid=u(29),role='service_role'):
 c=json.dumps(dict(sub=uid,role=role,iat=1,exp=4102444800));r=d.raw('\\set VERBOSITY verbose\n'+f"SET ROLE {role};SET request.jwt.claim.sub='{uid}';SET request.jwt.claims='{c}';"+q);calls.append(dict(sql=q,actor=uid,exit=r.returncode,out=r.stdout,err=r.stderr));return r
def value(r):
 lines=[l for l in r.stdout.splitlines() if l.startswith('{')];return json.loads(lines[-1]) if lines else None
def ok(n,c,detail=None):rows.append(dict(test=n,status='PASS' if c else 'FAIL',detail=detail));print(rows[-1]['status'],n,flush=True)
invoice=u(900);title=d.last(f"select receivable_id from fiscal_invoices where id='{invoice}'");order=d.last(f"select partner_order_id from fiscal_invoices where id='{invoice}'")
def state():return json.loads(d.last(f"select jsonb_build_object('invoice',(select normalized_status from fiscal_invoices where id='{invoice}'),'title',(select status from accounts_receivable where id='{title}'),'forecast',(select to_jsonb(f) from platform_private.b2b_financial_forecasts f where order_id='{order}'),'stock',(select md5(jsonb_agg(to_jsonb(s) order by id)::text) from estoque_produto s),'delivery',(select md5(jsonb_agg(to_jsonb(e) order by id)::text) from entregas e),'payments',(select count(*) from receivable_payments p join accounts_receivable_installments i on i.id=p.installment_id where i.receivable_id='{title}'))"))
try:
 # Real service-only preparation and signing, input seam transmission only.
 event=value(run(f"SELECT rpc_fiscal_event_sefaz_prepare_v1('{invoice}','CANCELLATION','LOCAL POLICY CANCEL REASON','policy-{uuid.uuid4()}','{u(29)}');"));ok('preparo real',event is not None,event)
 eid=event['eventId'];sha=hashlib.sha256(b'local signed input').hexdigest()
 signed=run(f"SELECT rpc_fiscal_event_sefaz_mark_signed_v1('{eid}','eventos/local/policy.xml','{sha}','{u(29)}');");ok('assinatura real sobre entrada sintética',signed.returncode==0,signed.stderr)
 def callback(stat,paid=False,commit=False):
  tid=str(uuid.uuid4());body=json.dumps(dict(cStat=stat,nProt='LOCAL-POLICY-'+stat,chNFe=event['accessKey'],tpAmb='2',xMotivo='LOCAL POLICY RESULT'))
  setup=f"BEGIN;INSERT INTO fiscal_sefaz_transmissions(id,fiscal_invoice_id,fiscal_event_id,service,environment_code,endpoint_host,endpoint_url,idempotency_key,request_fingerprint,state,outcome,created_by) VALUES('{tid}','{invoice}','{eid}','NFeRecepcaoEvento4','2','hnfe.fazenda.mg.gov.br','https://hnfe.fazenda.mg.gov.br/LOCAL-NO-NETWORK','policy-{tid}','{sha}','SENT','PENDING','{u(29)}');"
  return run(setup+f"SELECT rpc_fiscal_sefaz_transmit_record_v1('{tid}','SUCCEEDED','{body}'::jsonb);SELECT jsonb_build_object('invoice',(select normalized_status from fiscal_invoices where id='{invoice}'),'title',(select status from accounts_receivable where id='{title}'));"+('COMMIT;' if commit else 'ROLLBACK;'))
 b=state()
 for stat in ['573','103','136']:
  r=callback(stat);s=value(r);ok(stat+' não cancela nota/título',r.returncode==0 and s==dict(invoice='AUTHORIZED',title='OPEN') and state()==b,dict(out=r.stdout,err=r.stderr))
 for stat in ['135','155']:
  r=callback(stat);s=value(r);ok(stat+' final vinculado cancela nota e título aberto na transação',r.returncode==0 and s==dict(invoice='CANCELED',title='CANCELED'),dict(out=r.stdout,err=r.stderr));ok(stat+' rollback conserva previsão/estoque/entrega/título',state()==b)
except Exception as e:ok('harness',False,repr(e))
(out/'checks.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False)+'\n');(out/'calls.json').write_text(json.dumps(calls,indent=2,ensure_ascii=False)+'\n');code=int(any(r['status']=='FAIL' for r in rows));(out/'exitcode').write_text(str(code)+'\n');sys.exit(code)