"""Integration audit against the restored r12 socket only. No network, no hosted credentials."""
import concurrent.futures,hashlib,json,sys,uuid
from pathlib import Path
H=Path(__file__).resolve().parent
sys.path.insert(0,'/tmp/c2neg');import db
d=db.DB('c2');assert '-h' in d.psql() and '/tmp/felig' in d.psql()
E=H/'evidence';E.mkdir(exist_ok=True);out=E/f"attempt-{max([int(p.name[-3:]) for p in E.glob('attempt-*')],default=0)+1:03d}";out.mkdir()
checks=[];calls=[]
u=lambda n:f'00000000-0000-0000-0000-{n:012d}'
ADM,FIN,COM,FOREIGN=u(24),u(29),u(30),u(25)
def claims(uid,role='authenticated'):
 return f"SET ROLE {role};SET request.jwt.claim.sub='{uid}';SET request.jwt.claims='{json.dumps({'sub':uid,'role':role,'iat':1,'exp':4102444800})}';"
def call(uid,q,role='authenticated',pre='',post=''):
 r=d.raw('\\set VERBOSITY verbose\n'+pre+claims(uid,role)+q+post);calls.append(dict(sql=pre+q+post,actor=uid,role=role,exit=r.returncode,stdout=r.stdout,stderr=r.stderr));return r
def last(r):
 lines=[l for l in r.stdout.splitlines() if l.startswith('{')];return json.loads(lines[-1]) if lines else None
def ok(name,c,detail=None):
 checks.append(dict(test=name,status='PASS' if c else 'FAIL',detail=detail));print(checks[-1]['status'],name,flush=True)
def info(name,detail):checks.append(dict(test=name,status='INFO',detail=detail))
def snapshot(order):
 return json.loads(d.last(f"""SELECT jsonb_build_object('order',(SELECT to_jsonb(p) FROM public.partner_orders p WHERE id='{order}'),
 'forecast',(SELECT to_jsonb(f) FROM platform_private.b2b_financial_forecasts f WHERE order_id='{order}'),
 'titles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM public.accounts_receivable r WHERE origin_id='{order}'),
 'os',(SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{order}'),'delivery',(SELECT count(*) FROM public.entregas WHERE partner_order_id='{order}'),
 'stock',(SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'[]')) FROM public.estoque_produto s),
 'moves',(SELECT count(*) FROM public.estoque_movimentacoes))::text"""))
PB=d.last("SELECT order_id FROM platform_private.c2_pilot_econ_approvals_v1 ORDER BY approved_at DESC LIMIT 1")
BASE=(H/'capture/eligibility.sql').read_text()
before=snapshot(PB)
denied_commercial=call(COM,f"SELECT public.fn_fiscal_invoice_eligibility('PARTNER_ORDER','{PB}');")
ok('gestor comercial não ganha acesso fiscal pelo diagnóstico',denied_commercial.returncode!=0 and 'H15_STAFF_FORBIDDEN' in denied_commercial.stderr)
for uid in (FIN,):
 for overload in (False,True):
  expr=f"SELECT public.fn_fiscal_invoice_eligibility('PARTNER_ORDER','{PB}'"+(',NULL)' if overload else ')')+';'
  new=last(call(uid,expr));old=last(call(uid,expr,pre='BEGIN;'+BASE+';',post='ROLLBACK;'))
  diag=new.get('economicDiagnosis',{})
  ok(f'diagnóstico econômico válido ator {uid[-2:]} overload {overload}',diag.get('commercial_explicit') is True and diag.get('credit_explicit') is True and diag.get('accounting_pending') is True and diag.get('operational_commercial_registered') is False,new)
  ok(f'mesma elegibilidade/motivos/IDs overload {overload}',{k:v for k,v in new.items() if k!='economicDiagnosis'}==old and new['eligible'] is False)
  ok('diagnóstico não expõe autor/hash/previsão/IDs adicionais',not any(k in json.dumps(diag) for k in ['approved_by','evidence_hash','forecast_id','partner_id','order_id']))
for name,seam in [('gate-off','UPDATE platform_private.c2_pilot_econ_gate_v1 SET enabled=false;'),('revoked-viewer',f"UPDATE platform_private.c2_pilot_econ_allowlist_v1 SET revoked_at=clock_timestamp() WHERE order_id='{PB}' AND actor_id='{FIN}';"),('revoked-approver',f"UPDATE platform_private.c2_pilot_econ_allowlist_v1 SET revoked_at=clock_timestamp() WHERE order_id='{PB}' AND actor_id='{COM}';"),('expired',f"UPDATE platform_private.c2_pilot_econ_allowlist_v1 SET valid_until=valid_from+interval '1 second' WHERE order_id='{PB}';")]:
 r=call(FIN,f"SELECT public.fn_fiscal_invoice_eligibility('PARTNER_ORDER','{PB}');",pre='BEGIN;'+seam,post='ROLLBACK;');v=last(r);diag=(v or {}).get('economicDiagnosis',{})
 ok(name+' não reconhece aprovação vigente',r.returncode==0 and v['eligible'] is False and (diag.get('commercial_explicit') is not True),v)
foreign=last(call(FOREIGN,f"SELECT public.fn_fiscal_invoice_eligibility('PARTNER_ORDER','{PB}');"))
missing=last(call(FOREIGN,f"SELECT public.fn_fiscal_invoice_eligibility('PARTNER_ORDER','{uuid.uuid4()}');"))
ok('estrangeiro e inexistente uniformes sem IDs ou diagnóstico',foreign==missing and foreign.get('orderId') is None and 'economicDiagnosis' not in foreign,foreign)
ok('diagnóstico sem efeito no cabeçalho/previsão/estoque',snapshot(PB)==before)
# Re-run the logistics prerequisite with a dynamically located writer-created approved control.
CTRL=d.last(f"SELECT id FROM public.partner_orders p WHERE partner_id='{u(11)}' AND status='aprovado' AND NOT EXISTS(SELECT 1 FROM public.ordens_servico WHERE partner_order_id=p.id) ORDER BY created_at LIMIT 1")
for order,want in [(PB,False),(CTRL,True)]:
 item=d.last(f"SELECT id FROM public.partner_order_items WHERE order_id='{order}' ORDER BY created_at LIMIT 1");exp=d.last(f"SELECT updated_at FROM public.partner_orders WHERE id='{order}'")
 seam=f"BEGIN;GRANT EXECUTE ON FUNCTION public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text) TO authenticated;UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true;INSERT INTO platform_private.resale_pilot_allowlist_v1(gate,operation,actor_id,organization_id,partner_id,order_id,order_item_id,product_id,synthetic,created_by,valid_until) SELECT 'b2b_resale','os_create','{ADM}','{u(1)}',po.partner_id,po.id,i.id,i.product_id,true,'{ADM}',now()+interval '1 hour' FROM public.partner_orders po JOIN public.partner_order_items i ON i.order_id=po.id WHERE po.id='{order}' AND i.id='{item}';"
 b=snapshot(order);r=call(ADM,f"SELECT public.rpc_b2b_resale_os_create_v1('{order}','{item}','{exp}','audit-os-{uuid.uuid4()}');",pre=seam,post='ROLLBACK;')
 ok('OS controle positivo revertido' if want else 'C2 nega entrada real da entrega',r.returncode==0 and last(r).get('ok') is True if want else r.returncode!=0 and 'B2B_RESALE_ORDER_CONFLICT' in r.stderr,dict(exit=r.returncode,error=r.stderr))
 ok('OS/entrega/saldo sem efeitos persistentes',snapshot(order)==b)
# Real entry points: commercially rejecting is not canceling an approved order.
for order,label in [(PB,'C2 pós-previsão'),(CTRL,'aprovado'),(d.last("SELECT partner_order_id FROM public.fiscal_invoices WHERE normalized_status='AUTHORIZED' LIMIT 1"),'parcial autorizado')]:
 b=snapshot(order)
 for uid in (COM,FOREIGN):
  r=call(uid,f"SELECT public.reject_partner_order('{order}','auditoria local sem efeitos');",pre='BEGIN;',post='ROLLBACK;')
  ok('reprovação '+label+' isolada/atômica',snapshot(order)==b,dict(exit=r.returncode,error=r.stderr,result=r.stdout))
  info('resultado real reprovação '+label,dict(actor=uid,exit=r.returncode,error=r.stderr,result=r.stdout))
 r=call(FIN,f"SELECT public.cancel_b2b_receivable_secure('{order}','auditoria sem efeitos');")
 ok('cancelamento cobrança B2B fechado '+label,r.returncode!=0 and 'permission denied' in r.stderr and snapshot(order)==b)
 v=d.last(f"SELECT version FROM platform_private.b2b_financial_forecasts WHERE order_id='{order}'")
 if v:
  r=call(FIN,f"SELECT public.rpc_b2b_forecast_cancel_residual_v1('{order}',{v},'auditoria local');",pre='BEGIN;',post='ROLLBACK;')
  info('cancelamento residual porta vigente '+label,dict(exit=r.returncode,error=r.stderr,out=r.stdout));ok('cancelamento residual fechado/revertido '+label,snapshot(order)==b)
# Actual fiscal event callback chain. Event and signature are input seams, not final results.
INV=d.last("SELECT id FROM public.fiscal_invoices WHERE normalized_status='AUTHORIZED' ORDER BY id LIMIT 1");ORDER=d.last(f"SELECT partner_order_id FROM public.fiscal_invoices WHERE id='{INV}'");state0=snapshot(ORDER)
prepare=lambda key:f"SELECT public.rpc_fiscal_event_sefaz_prepare_v1('{INV}','CANCELLATION','Justificativa sintética para auditoria local','{key}','{FIN}');"
r=call(FIN,prepare('audit-client-denied'));ok('preparo evento direto authenticated negado',r.returncode!=0 and 'permission denied' in r.stderr)
foreign=call(FOREIGN,prepare('audit-foreign'),'service_role');ok('preparo evento estrangeiro negado',foreign.returncode!=0)
key='audit-event-'+uuid.uuid4().hex
pre=call(FIN,prepare(key),'service_role');event=last(pre);ok('preparo evento por backend com ator real',pre.returncode==0 and event is not None,dict(err=pre.stderr,result=event))
if event:
 replay=call(FIN,prepare(key),'service_role');ok('preparo replay mesma chave mesmo ID',replay.returncode==0 and last(replay)['eventId']==event['eventId'] and last(replay)['idempotentReplay'] is True)
 eid=event['eventId'];tx=str(uuid.uuid4());sig=hashlib.sha256(b'local synthetic signed event').hexdigest()
 signed=call(FIN,f"SELECT public.rpc_fiscal_event_sefaz_mark_signed_v1('{eid}','local/synthetic-event.xml','{sig}','{FIN}');",'service_role')
 ok('assinatura sintética registrada via RPC real',signed.returncode==0,signed.stderr)
 # Local transmission input is exactly what transport begin normally persists; never set a terminal outcome.
 d.sql(f"INSERT INTO public.fiscal_sefaz_transmissions(id,fiscal_invoice_id,fiscal_event_id,service,environment_code,endpoint_host,endpoint_url,idempotency_key,request_fingerprint,state,outcome,created_by) VALUES('{tx}','{INV}','{eid}','NFeRecepcaoEvento4','2','hnfe.fazenda.mg.gov.br','https://hnfe.fazenda.mg.gov.br/LOCAL-NO-NETWORK','audit-event-tx:{tx}','{sig}','SENT','PENDING','{FIN}');")
 body=json.dumps({'cStat':'135','nProt':'LOCAL-CANCEL-PROTOCOL','chNFe':event['accessKey'],'tpAmb':'2','xMotivo':'Evento registrado sintético','dhRecbto':'2027-02-02T12:00:00Z'})
 cb=lambda:f"SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{tx}','SUCCEEDED','{body}'::jsonb);"
 rolled=call(FIN,cb(),'service_role',pre='BEGIN;',post='ROLLBACK;');ok('callback cancelamento rollback sem efeitos financeiros/físicos',rolled.returncode==0 and snapshot(ORDER)==state0,rolled.stderr)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:rs=list(pool.map(lambda _:call(FIN,cb(),'service_role'),range(2)))
 persisted=d.last(f"SELECT count(*) FROM public.fiscal_events WHERE related_event_id='{eid}' AND event_type='SEFAZ_EVENT_REGISTERED'")
 ok('callback concorrente persistiu um evento de registro',persisted=='1',[(x.returncode,x.stderr,x.stdout) for x in rs])
 replay=call(FIN,cb(),'service_role');ok('callback replay sem duplicação',replay.returncode==0 and d.last(f"SELECT count(*) FROM public.fiscal_events WHERE related_event_id='{eid}' AND event_type='SEFAZ_EVENT_REGISTERED'")=='1')
 after=snapshot(ORDER);status=d.last(f"SELECT normalized_status FROM public.fiscal_invoices WHERE id='{INV}'")
 info('cancelamento confirmado pelo callback: efeito real',dict(invoice=status,event_state=d.last(f"SELECT state FROM public.v_fiscal_sefaz_event_state WHERE event_id='{eid}'"),before=state0,after=after))
 ok('callback não estorna/repoe/cancela título implicitamente',after==state0)
 ok('após evento registrado novo preparo é negado',call(FIN,prepare('new-after-registered'),'service_role').returncode!=0)
ok('C2 preservado com residual 20 zero título/OS/entrega',snapshot(PB)==before and before['forecast']['residual_amount']==20 and before['titles']==[] and before['os']==0 and before['delivery']==0)
(out/'checks.json').write_text(json.dumps(dict(pb=PB,control=CTRL,checks=checks),indent=2,ensure_ascii=False)+'\n');(out/'calls.json').write_text(json.dumps(calls,indent=2,ensure_ascii=False)+'\n');(out/'exitcode').write_text('1\n' if any(c['status']=='FAIL' for c in checks) else '0\n');print(out);sys.exit(1 if any(c['status']=='FAIL' for c in checks) else 0)