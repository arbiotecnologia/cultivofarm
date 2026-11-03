"""SQL review probes: exact money, canceled middle document, configured tolerance, Price.
Fixtures are transactions in the disposable harness, never historical remediation.
"""
import json, subprocess
from decimal import Decimal

def run(h):
 pg=h.pg; q=h.q; uid=h.m.uid; check=h.check
 def ask(s):return pg.sql(h.scope()+s).splitlines()[-1]
 def invoke(s):
  r=subprocess.run(pg.psql(),input=(h.scope()+s).encode(),capture_output=True)
  return r.returncode,r.stdout.decode().splitlines()[-1] if r.returncode==0 else r.stderr.decode()
 for multi in [False,True]:
  # pg.sql opens a fresh session each call; fixtures use committed local imports,
  # then mark their scoped economic records canceled before the next tests.
  order=uid(910 if not multi else 920); item=uid(911 if not multi else 921)
  items=[(item,'100.01')]+([(uid(922),'50.02')] if multi else [])
  principal='150.03' if multi else '100.01'; financing='0.05' if multi else '0.02'
  rows=[{'installment_number':1,'principal_amount':float(principal),'interest_amount':float(financing),'amount':float(principal)+float(financing),'due_date':'2026-12-01'}]
  cond=json.loads(ask(f"SELECT platform_private.b2b_resolve_condition('{h.P}','{h.PLAN}',{q(h.CHOICE)}::jsonb)"));cond.update(installment_count=1,monthly_rate=0)
  pg.sql(f"INSERT INTO partner_orders(id,partner_id,status,total,final_amount_with_interest,receivable_generated) VALUES('{order}','{h.P}','aprovado',{principal}+{financing},{principal}+{financing},false)")
  for iid,amount in items:pg.sql(f"INSERT INTO partner_order_items(id,order_id,product_id,quantidade,preco_unitario,desconto_percentual,subtotal,created_at,unidade_medida) VALUES('{iid}','{order}','{iid}',3,{amount}/3,0,{amount},now(),'litro')")
  pg.sql(f"UPDATE partner_orders SET internal_economic_snapshot=jsonb_build_object('items',(SELECT jsonb_agg(to_jsonb(i)) FROM partner_order_items i WHERE order_id='{order}')) WHERE id='{order}';INSERT INTO platform_private.b2b_order_condition_snapshots VALUES('{order}','{h.m.A}','{h.P}','{h.m.U}','{h.PLAN}',{q(h.CHOICE)}::jsonb,{q(cond)}::jsonb,'cent-review',{q(rows)}::jsonb,{principal},{financing},{principal}+{financing})")
  docs=[]; ack=[]
  for k in range(4):
   did=uid((930 if not multi else 940)+k);docs.append(did)
   pg.sql(f"INSERT INTO platform_private.b2b_authorized_documents VALUES('{did}','{h.m.A}','{h.P}','{order}','NFE','2026-11-01','cent-{did}','{'d'*64}',{q([{'item_id':iid,'quantity':1} for iid,_ in items])}::jsonb,'AUTHORIZED')")
   if k<3:ack.append(json.loads(ask(f"SELECT platform_private.b2b_allocate_document('{did}')")))
  check('cent installments '+str(multi),[33.34,33.33,33.34] if not multi else [50.01,50.01,50.01],[r['principal'] for r in ack])
  before=pg.sql(f"SELECT to_jsonb(x) FROM platform_private.b2b_document_allocations x WHERE document_id='{docs[1]}'")
  pg.sql(h.scope()+f"INSERT INTO platform_private.b2b_cancellation_attestations VALUES('{docs[1]}','{h.m.A}','cancel-{docs[1]}','{'b'*64}')")
  ask(f"SELECT platform_private.b2b_reverse_allocation('{docs[1]}')")
  check('cent restored exact principal and interest '+str(multi),float(Decimal(str(ack[1]['principal']))+Decimal(str(ack[1]['financed_interest']))),float(ask(f"SELECT platform_private.b2b_order_residual('{order}')")))
  code,result=invoke(f"SELECT platform_private.b2b_allocate_document('{docs[3]}')")
  check('middle replacement accepted '+str(multi),0,code)
  check('middle replacement consumes exact residual '+str(multi),0,float(ask(f"SELECT platform_private.b2b_order_residual('{order}')")))
  check('middle canceled allocation unchanged '+str(multi),before,pg.sql(f"SELECT to_jsonb(x) FROM platform_private.b2b_document_allocations x WHERE document_id='{docs[1]}'"))
  if code==0:
   r=json.loads(result);check('replacement principal exact '+str(multi),ack[1]['principal'],r['principal']);check('replacement interest exact '+str(multi),ack[1]['financed_interest'],r['financed_interest'])
   expected_items=[dict(item_id=item,quantity=1,principal=33.33,financed_interest=0)]
   if multi:expected_items=[dict(item_id=item,quantity=1,principal=33.33,financed_interest=0.01),dict(item_id=uid(922),quantity=1,principal=16.68,financed_interest=0)]
   check('replacement per-item exact cents '+str(multi),expected_items,json.loads(pg.sql(f"SELECT item_money FROM platform_private.b2b_document_allocations WHERE document_id='{docs[3]}'")))
   # Reverse another document and replace in opposite order to exercise residual again.
   pg.sql(h.scope()+f"INSERT INTO platform_private.b2b_cancellation_attestations VALUES('{docs[0]}','{h.m.A}','cancel-{docs[0]}','{'b'*64}')")
   fresh=uid(934 if not multi else 944)
   pg.sql(f"INSERT INTO platform_private.b2b_authorized_documents VALUES('{fresh}','{h.m.A}','{h.P}','{order}','NFE','2026-11-01','cent-{fresh}','{'d'*64}',{q([{'item_id':iid,'quantity':1} for iid,_ in items])}::jsonb,'AUTHORIZED')")
   check('opposite cancellation replaces atomically '+str(multi),True,json.loads(ask(f"SELECT platform_private.b2b_reverse_allocation('{docs[0]}','{fresh}')"))['success'])
   check('opposite replacement residual zero '+str(multi),0,float(ask(f"SELECT platform_private.b2b_order_residual('{order}')")))
   check('opposite replacement item money preserved '+str(multi),pg.sql(f"SELECT item_money FROM platform_private.b2b_document_allocations WHERE document_id='{docs[0]}'"),pg.sql(f"SELECT item_money FROM platform_private.b2b_document_allocations WHERE document_id='{fresh}'"))
  pg.sql(f"UPDATE partner_orders SET status='cancelado' WHERE id='{order}';UPDATE accounts_receivable SET status='CANCELED' WHERE origin_id='{order}';UPDATE accounts_receivable_installments SET status='CANCELED' WHERE receivable_id IN(SELECT id FROM accounts_receivable WHERE origin_id='{order}')")
 # Use transaction-scoped due dates without changing immutable originals in storage.
 title=pg.sql("SELECT receivable_id FROM platform_private.b2b_document_allocations ORDER BY document_id LIMIT 1")
 pg.sql(f"UPDATE partner_financial_settings SET overdue_tolerance_days=5 WHERE partner_id='{h.P}'")
 for days,expected in [(-1,False),(0,False),(3,False),(5,False),(6,True)]:
  r=pg.sql(h.scope()+f"BEGIN;ALTER TABLE accounts_receivable_installments DISABLE TRIGGER trg_h6_ari_snapshot;UPDATE accounts_receivable_installments SET due_date=CURRENT_DATE-{days} WHERE receivable_id='{title}';ALTER TABLE platform_private.b2b_document_allocations DISABLE TRIGGER immutable_update_delete;UPDATE platform_private.b2b_document_allocations SET rows=(SELECT jsonb_agg(r||jsonb_build_object('due_date',CURRENT_DATE-{days})) FROM jsonb_array_elements(rows) r) WHERE receivable_id='{title}';SELECT (platform_private.b2b_credit_balances('{h.P}')->>'saldo_vencido')::numeric>0;ROLLBACK;").splitlines()[-1]
  check('configured overdue tolerance day '+str(days),expected,r=='t')
 for val in ['NULL','-1']:
  pg.sql(f"UPDATE partner_financial_settings SET overdue_tolerance_days={val} WHERE partner_id='{h.P}'")
  code,r=invoke(f"SELECT platform_private.b2b_credit_balances('{h.P}')")
  check('invalid tolerance blocks '+val,True,code!=0 and 'CREDIT_SETTINGS_INCOMPLETE' in r)
 pg.sql(f"UPDATE partner_financial_settings SET overdue_tolerance_days=0 WHERE partner_id='{h.P}'")
 # A Price title of the same partner, separate from B2B origin: immutable
 # source format is the real Price candidate; owner fixture import is synthetic.
 tid=uid(960)
 pg.sql(h.scope()+f"BEGIN;ALTER TABLE accounts_receivable DISABLE TRIGGER a01_b2b_fiscal_title_fence;INSERT INTO accounts_receivable(id,organization_id,origin_type,customer_id,partner_id,description,category_id,total_amount,issue_date,first_due_date,installment_count,status,created_by) VALUES('{tid}','{h.m.A}','MANUAL','{h.m.C}','{h.P}','Price synthetic','{h.m.K}',100.03,'2026-11-01','2026-12-01',1,'OPEN','{h.m.U}');ALTER TABLE accounts_receivable ENABLE TRIGGER a01_b2b_fiscal_title_fence;COMMIT;")
 pg.sql(f"INSERT INTO platform_private.price_schedule_snapshots(receivable_id,organization_id,customer_id,actor_id,transaction_id,policy_version,calendar_version,calendar_sha256,nf_reference,nf_issue_date,table_amount,discount_percent,principal,monthly_rate_percent,installment_count,financed_total,credit_limit,exposure_before,rows) VALUES('{tid}','{h.m.A}','{h.m.C}','{h.m.U}',txid_current(),'SYN','synthetic-paracatu-2026-2027','{'0'*64}','{uid(961)}','2026-11-01',166.68,40,100.01,0,1,100.03,100000,0,{q([dict(installment_number=1,amount=100.03,principal=100.01,interest=0.02)])}::jsonb)")
 check('positive Price projection', 'price_snapshot_v1',json.loads(ask(f"SELECT rpc_receivable_money_projection_v1('{tid}',0,1000)"))[0]['monetary_origin']['source'])
 check('Price captured generator populated installment',1,int(pg.sql(f"SELECT count(*) FROM accounts_receivable_installments WHERE receivable_id='{tid}' AND original_amount=100.03 AND received_amount=0")))
 for label,change in [('unknown',f"DELETE FROM platform_private.price_schedule_snapshots WHERE receivable_id='{tid}'"),('foreign',f"UPDATE platform_private.price_schedule_snapshots SET organization_id='{h.m.B}' WHERE receivable_id='{tid}'"),('changed',f"UPDATE platform_private.price_schedule_snapshots SET rows='[]' WHERE receivable_id='{tid}'")]:
  err=pg.sql(h.scope()+f"BEGIN;ALTER TABLE platform_private.price_schedule_snapshots DISABLE TRIGGER price_snapshot_immutable;{change};SELECT platform_private.b2b_credit_balances('{h.P}');ROLLBACK;",ok=False)
  check('Price '+label+' origin credit denied',True,'MONEY_ORIGIN' in err)
 code,r=invoke(f"SELECT platform_private.b2b_credit_balances('{h.P}')")
 check('same partner Price accepted in credit',0,code)
 if code==0:
  total=json.loads(r)['saldo_em_aberto'];pg.sql(f"UPDATE accounts_receivable SET status='CANCELED' WHERE id='{tid}';UPDATE accounts_receivable_installments SET status='CANCELED' WHERE receivable_id='{tid}'")
  check('Price credit counts financing once',100.03,round(total-json.loads(ask(f"SELECT platform_private.b2b_credit_balances('{h.P}')"))['saldo_em_aberto'],2))
 else:pg.sql(f"UPDATE accounts_receivable SET status='CANCELED' WHERE id='{tid}';UPDATE accounts_receivable_installments SET status='CANCELED' WHERE receivable_id='{tid}'")