"""Disposable Unix-socket PG, captured finance bodies; synthetic identity/pricing/journal.
Never hosted. Every failed run remains in its unique output directory.
"""
import importlib.util,json,pathlib,sys,hashlib,subprocess,re
from decimal import Decimal
sys.dont_write_bytecode=True
H=pathlib.Path(__file__).resolve().parent; ROOT=H.parents[2]
sys.path.insert(0,str(H)); import build
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('monetary',ROOT/'scripts/financial-installments-initial-20261024/test-receivable-semantics.py');pg=m.pg
OUT=pathlib.Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=False)
checks=[]
def check(name,expected,actual,kind='PG_COMPONENT_CAPTURED_FINANCE_SYNTHETIC_AUTH'):
 r=dict(id=f'INT-{len(checks)+1:03}',scenario=name,expected=expected,actual=actual,status='PASS' if expected==actual else 'FAIL',kind=kind);checks.append(r);print(json.dumps(r),flush=True);(OUT/'checks.json').write_text(json.dumps(checks,indent=2))
def deny(name,sql,code):
 before=state();err=pg.sql(scope()+sql,ok=False);check(name,True,code in err and state()==before)
def scope(org=None,staff=True):return m.scope(org or m.A,staff)
def state():return pg.sql("SELECT jsonb_build_object('titles',(SELECT count(*) FROM accounts_receivable),'payments',(SELECT count(*) FROM receivable_payments),'allocations',(SELECT count(*) FROM platform_private.b2b_document_allocations),'reversals',(SELECT count(*) FROM platform_private.b2b_allocation_reversals),'orders',(SELECT count(*) FROM partner_orders));")
def sql(s):return pg.sql(scope()+s).splitlines()[-1]
P=m.uid(700);PLAN=m.uid(701);ITEM=m.uid(702);PO=m.uid(703);TERMS=m.uid(704)
CAL="(SELECT c FROM platform_private.holiday_calendars c WHERE version='synthetic-paracatu-2026-2027')"
CHOICE={'payment_method':'boleto','payment_condition_version':1,'payment_deadline_days':30}
def q(x):return m.q(json.dumps(x) if isinstance(x,(dict,list)) else x)
def main():
 pg.start();m.schema()
 pg.sql("ALTER TYPE app_role ADD VALUE 'parceiro_b2b_tecnico'; ALTER TYPE app_role ADD VALUE 'cliente_produtor'; ALTER TYPE app_role ADD VALUE 'gestor_comercial';CREATE OR REPLACE FUNCTION has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql SET search_path='' AS $$SELECT $1=auth.uid() AND $2='financeiro'::public.app_role$$;")
 pg.sql(re.search(r'CREATE TYPE public.partner_order_status AS ENUM.*?;', (ROOT/'scripts/contracts-c2-20261022/integral/replica.sql').read_text()).group(0))
 pg.sql("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SEQUENCE partner_orders_numero_seq;CREATE TABLE financial_categories(id uuid PRIMARY KEY,active boolean,type text);CREATE TABLE financial_cost_centers(id uuid PRIMARY KEY,active boolean);")
 # Exact columns of captured public order tables, synthetic metadata defaults only where replica omitted them.
 deps=json.loads((ROOT/'scripts/financial-installments-initial-20261024/receivable-writers-dependencies-live-20261028.json').read_text())
 replica=(ROOT/'scripts/contracts-c2-20261022/integral/replica.sql').read_text()
 for name in ['partner_orders','partner_order_items','partner_order_payment_terms','partner_order_financial_links']:
  if name=='partner_orders':pg.sql('DROP TABLE partner_orders')
  r=next((r for r in deps['relations'] if r['name']==name),None)
  if r and r.get('columns'):
   cols=[]
   for c in r['columns']:
    typ='text' if c['type'] in ['partner_order_status','partner_order_priority'] else c['type']
    default=(c.get('default') or '').replace('::partner_order_status','::text').replace('::partner_order_priority','::text')
    cols.append(c['name']+' '+typ+((' DEFAULT '+default) if default else ''))
   pg.sql('CREATE TABLE '+name+'('+','.join(cols)+')')
  else:
   ddl=re.search(r'CREATE TABLE '+name+r' \(.*?;',replica).group(0);pg.sql(ddl)
  pg.sql(f'ALTER TABLE {name} ADD PRIMARY KEY(id);ALTER TABLE {name} ALTER COLUMN id SET DEFAULT gen_random_uuid();')
 pg.sql('ALTER TABLE partner_order_financial_links ADD CONSTRAINT partner_order_financial_links_partner_order_id_key UNIQUE(partner_order_id);')
 pg.sql("CREATE TABLE commercial_payment_plans(id uuid PRIMARY KEY,name text,code text,active boolean,monthly_interest_percent numeric,discount_percent numeric,months_count numeric,installment_count int,interest_type text,max_days int,requires_financial_approval boolean,requires_credit_approval boolean,requires_guarantee boolean,minimum_order_amount numeric,pricing_mode text);")
 pg.sql("CREATE TABLE partner_accounts(id uuid PRIMARY KEY,client_id uuid,ativo boolean,commercial_owner_organization_id uuid,deleted_at timestamptz);CREATE TABLE partner_financial_settings(partner_id uuid PRIMARY KEY,credit_limit numeric,active boolean,overdue_tolerance_days int,block_if_overdue boolean,credit_limit_action text);CREATE TABLE entregas(id uuid,partner_order_id uuid);")
 pg.sql(f"INSERT INTO financial_categories VALUES('{m.K}',true,'RECEITA');INSERT INTO partner_accounts VALUES('{P}','{m.C}',true,'{m.A}',NULL);INSERT INTO partner_financial_settings VALUES('{P}',100000,true,0,false,'block');INSERT INTO commercial_payment_plans VALUES('{PLAN}','Synthetic','SYN',true,1.8,0,3,3,'compound',30,false,false,false,NULL,'discount_from_base');")
 pg.sql("CREATE FUNCTION platform_private.c2_order_actor_scope(uuid,uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF $1 IS DISTINCT FROM auth.uid() OR current_setting('test.staff',true)<>'true' THEN RAISE EXCEPTION 'SYNTHETIC_ACTOR_DENIED' USING ERRCODE='42501';END IF; END$$;CREATE FUNCTION platform_private.c2_owner_order_guard(uuid,uuid,uuid) RETURNS void LANGUAGE sql AS $$SELECT$$;")
 shared=(H.parent/'shared-credit-guard.sql.review').read_text();a=shared.index('CREATE FUNCTION platform_private.b2b_credit_config_block');b=shared.index('CREATE OR REPLACE FUNCTION public.tg_partner_orders_credit_guard',a);pg.sql(shared[a:b])
 # Existing Price schema/functions only, no official calendar claims and no commercial seed.
 price=(H.parent/'price-generator.sql.review').read_text();a=price.index('CREATE TABLE platform_private.holiday_calendars');b=price.index('-- Owner-only loader');pg.sql(price[a:b])
 pg.sql(f"INSERT INTO platform_private.holiday_calendars VALUES('synthetic-paracatu-2026-2027','Paracatu-MG','2026-01-01','2027-12-31','{'0'*64}','SYNTHETIC',ARRAY['2026-11-02'::date],now());")
 pg.sql("CREATE FUNCTION platform_private.price_pinned_calendar() RETURNS platform_private.holiday_calendars LANGUAGE sql AS $$SELECT c FROM platform_private.holiday_calendars c WHERE version='synthetic-paracatu-2026-2027'$$;")
 pg.sql((H/'schema.sql.review').read_text());pg.sql((H/'origin.sql.review').read_text());pg.sql((H/'partial.sql.review').read_text());build.build();pg.sql((H/'captured-deltas.sql.review').read_text())
 # fences: unrelated own reader absent in reduced harness, tested as a captured-signature deny.
 pg.sql("CREATE FUNCTION platform_private.b2b_own_obligations(uuid,timestamptz,uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '[]'::jsonb$$;")
 # Install EXACT captured old overloads and their formerly permissive ACL in the
 # disposable replica before fences; this tests real REVOKE, not mere absence.
 captured=json.loads(build.CAP.read_text())
 for name in ['create_partner_order_secure','simulate_b2b_payment_plan_secure']:
  pg.sql(next(f['body'] for f in captured['functions'] if f['name']==name)+';')
 pg.sql("GRANT USAGE ON SCHEMA public,platform_private TO authenticated;GRANT EXECUTE ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text),public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date) TO authenticated;")
 check('legacy overload present and granted before fence','t',pg.sql("SELECT has_function_privilege('authenticated','public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)','EXECUTE') AND has_function_privilege('authenticated','public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)','EXECUTE')"))
 pg.sql((H/'fences.sql.review').read_text())
 for signature,call in [
 ('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)',f"SELECT public.create_partner_order_secure('{P}',NULL,'[]',NULL,'{PLAN}',NULL,NULL,'hash','old')"),
 ('public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)',f"SELECT public.simulate_b2b_payment_plan_secure('{P}','{PLAN}','[]',NULL)")]:
  check('legacy overload revoked '+signature,'f',pg.sql(f"SELECT has_function_privilege('authenticated','{signature}','EXECUTE')"))
  # Defaults make a 9/4-argument call ambiguous when both overloads exist.
  # Isolate name resolution inside a rolled-back transaction, without changing
  # the legacy body or ACL, so invocation tests EXECUTE denial rather than 42725.
  new_signature='public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text,jsonb)' if 'create_partner' in signature else 'public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date,jsonb)'
  err=pg.sql('BEGIN;ALTER FUNCTION '+new_signature+' RENAME TO harness_new_overload_hidden;SET ROLE authenticated;'+call,ok=False)
  (OUT/('old-create-denial.log' if 'create_partner' in signature else 'old-simulate-denial.log')).write_text(err)
  check('legacy overload invocation denied '+signature,True,'permission denied for function' in err)
 for label,statement in [('allocation',f"SELECT platform_private.b2b_allocate_document('{m.uid(710)}')"),('authorization insert',f"INSERT INTO platform_private.b2b_authorized_documents VALUES('{m.uid(999)}','{m.A}','{P}','{PO}','NFE','2026-11-01','external','{'e'*64}','[]','AUTHORIZED')"),('cancellation insert',f"INSERT INTO platform_private.b2b_cancellation_attestations VALUES('{m.uid(710)}','{m.A}','external','{'e'*64}')")]:
  err=pg.sql('SET ROLE authenticated;'+statement,ok=False)
  check('external fiscal '+label+' denied',True,'permission denied' in err)
 check('legacy financial link unique preserved','t',pg.sql("SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='partner_order_financial_links_partner_order_id_key')"))
 deny('capability closed with candidate dependencies',f"SELECT partner_payment_condition_capability_v1('{P}')",'B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN')
 check('candidate no authenticated fiscal writer grant','f',pg.sql("SELECT has_function_privilege('authenticated','platform_private.b2b_allocate_document(uuid)','EXECUTE')"))
 # Explicit synthetic dependency replacement, not a production authority adapter.
 pg.sql("CREATE OR REPLACE FUNCTION platform_private.b2b_integration_dependencies() RETURNS void LANGUAGE sql AS $$SELECT$$;")
 pg.sql(f"INSERT INTO platform_private.b2b_condition_versions VALUES('{m.A}','{PLAN}',1,'boleto',30,3,1.8,'{m.U}',now(),true,'synthetic-paracatu-2026-2027','{m.K}','{m.PM}');INSERT INTO platform_private.b2b_condition_assignments VALUES('{m.A}','{P}','{PLAN}',1,'boleto');")
 check('positive capability real candidate envelope',True,json.loads(sql(f"SELECT partner_payment_condition_capability_v1('{P}')"))['create'])
 rows=json.loads(sql(f"SELECT platform_private.b2b_schedule(60000,1.8,3,'2026-10-01',30,{CAL})"))
 check('Price cent per period total', '62172.84',str(sum(Decimal(str(r['amount'])) for r in rows)))
 check('first nominal emission+30', '2026-10-31',rows[0]['nominal_due_date'])
 check('synthetic holiday next business day','2026-11-03',rows[0]['due_date'])
 check('month clamp anchored nominal day','2026-11-30',rows[1]['nominal_due_date'])
 for method in ['constructor','toString','__proto__','unknown']:
  deny('reject unknown '+method,f"SELECT platform_private.b2b_choice({q({**CHOICE,'payment_method':method})}::jsonb)",'payment_choice_required')
 for field,val in [('payment_condition_version','1'),('payment_deadline_days',-1),('payment_condition_version',0)]:deny('choice rejects '+field+str(val),f"SELECT platform_private.b2b_choice({q({**CHOICE,field:val})}::jsonb)",'payment_choice_required')
 deny('config rejects cash installments',f"INSERT INTO platform_private.b2b_condition_versions VALUES('{m.A}','{PLAN}',1,'pix',7,2,0,'{m.U}',now(),true,'synthetic-paracatu-2026-2027','{m.K}','{m.PM}')",'check constraint')
 deny('missing promissory config',f"SELECT platform_private.b2b_resolve_condition('{P}','{PLAN}',{q({**CHOICE,'payment_method':'promissoria'})}::jsonb)",'payment_condition_unavailable')
 # Sealed synthetic order uses actual schedule fields; no transformation of historical captures.
 schedule=json.loads(sql(f"SELECT platform_private.b2b_schedule(60000,1.8,3,'2026-10-01',30,{CAL})"))
 pg.sql(f"INSERT INTO partner_orders(id,partner_id,status,total,final_amount_with_interest,payment_terms_id,receivable_generated) VALUES('{PO}','{P}','aprovado',62172.84,62172.84,'{TERMS}',false);INSERT INTO partner_order_items(id,order_id,product_id,quantidade,preco_unitario,desconto_percentual,subtotal,created_at,unidade_medida) VALUES('{ITEM}','{PO}','{ITEM}',3,20000,0,60000,now(),'litro');")
 cond=json.loads(sql(f"SELECT platform_private.b2b_resolve_condition('{P}','{PLAN}',{q(CHOICE)}::jsonb)"))
 pg.sql(f"UPDATE partner_orders SET internal_economic_snapshot=jsonb_build_object('items',(SELECT jsonb_agg(to_jsonb(i)) FROM partner_order_items i WHERE order_id='{PO}')) WHERE id='{PO}';INSERT INTO platform_private.b2b_order_condition_snapshots VALUES('{PO}','{m.A}','{P}','{m.U}','{PLAN}',{q(CHOICE)}::jsonb,{q(cond)}::jsonb,'synthetic-request',{q(schedule)}::jsonb,60000,2172.84,62172.84);")
 check('credit includes total interest before invoice',62172.84,json.loads(sql(f"SELECT fn_b2b_credit_exposure('{P}',0,NULL)"))['exposicao_atual'])
 def document(n,quantity,issue='2026-10-01',order=PO,org=m.A,state='AUTHORIZED'):
  did=m.uid(n);items=[{'item_id':ITEM,'quantity':quantity}];pg.sql(f"INSERT INTO platform_private.b2b_authorized_documents VALUES('{did}','{org}','{P}','{order}','NFE','{issue}','event-{n}','{'a'*64}',{q(items)}::jsonb,'{state}')");return did
 def allocate(d):return json.loads(sql(f"SELECT platform_private.b2b_allocate_document('{d}')"))
 d1=document(710,1);r1=allocate(d1)
 check('first partial principal',20000,r1['principal']);check('first partial financing',724.28,r1['financed_interest']);check('partial residual with interest',41448.56,r1['residual'])
 check('conversion no credit duplication',62172.84,json.loads(sql(f"SELECT fn_b2b_credit_exposure('{P}',0,NULL)"))['exposicao_atual'])
 check('replay exact title',r1['receivable_id'],allocate(d1)['receivable_id'])
 check('replay does not allocate twice',1,int(pg.sql('SELECT count(*) FROM platform_private.b2b_document_allocations')))
 projection=json.loads(sql(f"SELECT rpc_receivable_money_projection_v1('{r1['receivable_id']}',0,1000)"));(OUT/'allocation-projection.json').write_text(json.dumps(projection,indent=2))
 inst=projection[0]['id'];check('allocation projection financed semantics','b2b_document_allocation_v1',projection[0]['monetary_origin']['source'])
 # Captured payment/recalc/snapshot/audit path with canonical balance delta, no actual receipt delivery.
 pay={'amount_received':100,'payment_method_id':m.PM,'idempotency_key':'synthetic-partial-pay'}
 payment=sql(f"SELECT rpc_register_receivable_payment('{inst}',{q(pay)}::jsonb)")
 check('payment reduces title only',62072.84,json.loads(sql(f"SELECT fn_b2b_credit_exposure('{P}',0,NULL)"))['exposicao_atual'])
 check('payment does not reopen order residual',41448.56,float(sql(f"SELECT platform_private.b2b_order_residual('{PO}')")))
 check('payment replay same id',payment,sql(f"SELECT rpc_register_receivable_payment('{inst}',{q(pay)}::jsonb)"))
 d2=document(711,1,issue='2026-11-01');r2=allocate(d2);d3=document(712,1,issue='2026-12-01');r3=allocate(d3)
 check('final partial residual zero',0,r3['residual']);check('three independent documents titles',3,int(pg.sql('SELECT count(*) FROM platform_private.b2b_document_allocations')))
 check('final credit total less confirmed payment',62072.84,json.loads(sql(f"SELECT fn_b2b_credit_exposure('{P}',0,NULL)"))['exposicao_atual'])
 d4=document(713,1);deny('over quantity transactional',f"SELECT platform_private.b2b_allocate_document('{d4}')",'FISCAL_QUANTITY_OVERALLOCATED')
 def economic_image():return json.loads(pg.sql(f"SELECT jsonb_build_object('original',(SELECT financed_total FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{PO}'),'residual',platform_private.b2b_order_residual('{PO}'),'received',(SELECT sum(i.received_amount) FROM accounts_receivable_installments i JOIN accounts_receivable a ON a.id=i.receivable_id WHERE a.origin_id='{PO}'),'titles',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM accounts_receivable a WHERE a.origin_id='{PO}'),'installments',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM accounts_receivable_installments i JOIN accounts_receivable a ON a.id=i.receivable_id WHERE a.origin_id='{PO}'))"))
 before_paid=economic_image()
 deny('paid cancellation requires reconciliation',f"SELECT platform_private.b2b_reverse_allocation('{d1}')",'FISCAL_PAID_RECONCILIATION_REQUIRED')
 check('paid cancellation retains exact money and history',before_paid,economic_image())
 deny('cancel event absent cannot reverse',f"SELECT platform_private.b2b_reverse_allocation('{d2}')",'FISCAL_CANCELLATION_UNPROVEN')
 pg.sql(scope()+f"INSERT INTO platform_private.b2b_cancellation_attestations VALUES('{d2}','{m.A}','cancel-d2','{'b'*64}')")
 check('cancel restores only allocated residual',True,json.loads(sql(f"SELECT platform_private.b2b_reverse_allocation('{d2}')"))['success'])
 check('cancel preserved exposure not lost',62072.84,json.loads(sql(f"SELECT fn_b2b_credit_exposure('{P}',0,NULL)"))['exposicao_atual'])
 check('cancel retains allocation history',3,int(pg.sql('SELECT count(*) FROM platform_private.b2b_document_allocations')))
 after_cancel=economic_image()
 check('cancel keeps original financed total',62172.84,after_cancel['original']);check('cancel restores exact residual',20724.28,after_cancel['residual']);check('cancel retains confirmed received',100,after_cancel['received'])
 check('canceled title retains original amount',20724.28,float(pg.sql(f"SELECT total_amount FROM accounts_receivable WHERE id='{r2['receivable_id']}'")))
 replacement=document(714,1);rr=allocate(replacement);check('replacement consumes restored residual',0,rr['residual'])
 after_replacement=economic_image();check('replacement original unchanged',62172.84,after_replacement['original']);check('replacement received unchanged',100,after_replacement['received'])
 check('replacement keeps canceled title and new identity',True,r2['receivable_id']!=rr['receivable_id'] and pg.sql(f"SELECT status FROM accounts_receivable WHERE id='{r2['receivable_id']}'")=='CANCELED')
 (OUT/'economic-retention.json').write_text(json.dumps({'before_paid_cancel':before_paid,'after_cancel':after_cancel,'after_replacement':after_replacement},indent=2))
 canceled=document(715,1);pg.sql(scope()+f"INSERT INTO platform_private.b2b_cancellation_attestations VALUES('{canceled}','{m.A}','cancel-before','{'b'*64}')")
 deny('cancel before allocation denies title',f"SELECT platform_private.b2b_allocate_document('{canceled}')",'FISCAL_DOCUMENT_CANCELED')
 deny('document title identity update denied',f"UPDATE accounts_receivable SET b2b_document_id='{canceled}' WHERE id='{rr['receivable_id']}'",'B2B_TITLE_IDENTITY_IMMUTABLE')
 err=pg.sql(scope()+f"BEGIN;UPDATE accounts_receivable_installments SET discount_amount=1 WHERE receivable_id='{rr['receivable_id']}';SELECT platform_private.b2b_reverse_allocation('{replacement}');ROLLBACK;",ok=False)
 check('adjusted unpaid title cannot cancel',True,'FISCAL_PAID_RECONCILIATION_REQUIRED' in err)
 err=pg.sql(scope()+f"BEGIN;UPDATE partner_order_items SET subtotal=59999 WHERE order_id='{PO}';SELECT platform_private.b2b_allocate_document('{d4}');ROLLBACK;",ok=False)
 check('unreconciled net item bases blocked',True,'FISCAL_NET_ITEM_BASE_UNPROVEN' in err)
 deny('legacy writer blocked',f"SELECT generate_b2b_receivable_secure_impl('{PO}')",'B2B_AUTHORIZED_FISCAL_DOCUMENT_REQUIRED')
 deny('old title writer without permit',f"INSERT INTO accounts_receivable(organization_id,origin_type,origin_id,partner_id,customer_id,description,category_id,total_amount,issue_date,first_due_date,installment_count,status,created_by) VALUES('{m.A}','B2B_ORDER','{PO}','{P}','{m.C}','SYN','{m.K}',1,CURRENT_DATE,CURRENT_DATE,1,'OPEN','{m.U}')",'B2B_FISCAL_ONE_SHOT_PERMIT_REQUIRED')
 # Mutability attacks are denied, not silently repaired.
 for table,col in [('b2b_condition_versions','deadline_days=31'),('b2b_order_condition_snapshots','principal=1'),('b2b_document_allocations','principal=1')]:deny('immutable '+table,f'UPDATE platform_private.{table} SET {col}','PRICE_RECORD_IMMUTABLE')
 err=pg.sql(scope(m.B)+f"SELECT platform_private.b2b_allocate_document('{d1}')",ok=False);check('foreign tenant fiscal replay denied',True,'B2B_TENANT_DENIED' in err)
 err=pg.sql(scope(staff=False)+f"SELECT platform_private.b2b_allocate_document('{d1}')",ok=False);check('inactive actor fiscal replay denied',True,'DENIED' in err)
 legacy_tests(); concurrency_tests(document,allocate)
 load('review_cent_credit',H/'review-cent-credit.py').run(sys.modules[__name__])
 rpc_tests()
 (OUT/'summary.json').write_text(json.dumps({'pass':sum(r['status']=='PASS' for r in checks),'fail':sum(r['status']=='FAIL' for r in checks),'synthetic':['Auth/h15/roles','pricing and journal','sealed order/items','fiscal authorization/cancellation dependency bypass in harness only','calendar Paracatu+MG/national synthetic'],'hosted':'NOT_RUN'},indent=2))
 if any(r['status']=='FAIL' for r in checks):raise SystemExit(1)
def legacy_tests():
 cap=json.loads((ROOT/'scripts/financial-installments-initial-20261024/receivable-recursive-live-20261029.json').read_text())
 gen=next(f for f in cap['functions'] if f['name']=='fn_generate_receivable_installments')
 # Exact captured legacy writer is executed before restoring candidate; no snapshot amounts patched.
 pg.sql(gen['body']+';')
 oid=m.uid(800);terms=m.uid(801);tid=m.uid(802);sid=m.uid(803)
 pg.sql(f"INSERT INTO partner_orders(id,partner_id,status,total,final_amount_with_interest,payment_terms_id,receivable_generated,c2_external_origin_snapshot) VALUES('{oid}','{P}','aprovado',10300,10300,'{terms}',false,'{{}}');INSERT INTO partner_order_payment_schedule(id,partner_order_id,payment_terms_id,installment_number,due_date,amount,principal_amount,interest_amount) VALUES('{sid}','{oid}','{terms}',1,'2026-12-01',10300,10000,300);INSERT INTO partner_order_payment_terms(id,partner_order_id,installment_count,final_amount) VALUES('{terms}','{oid}',1,10300);")
 # Candidate title barrier is disabled only during COMMITTED legacy fixture import.
 # The barrier is re-enabled before any proof test; this is NOT a rolled-back import.
 # This is legacy fixture import, not an operational exemption or provenance grant.
 pg.sql(scope()+f"BEGIN;ALTER TABLE accounts_receivable DISABLE TRIGGER a01_b2b_fiscal_title_fence;INSERT INTO accounts_receivable(id,organization_id,origin_type,origin_id,customer_id,partner_id,description,category_id,total_amount,issue_date,first_due_date,installment_count,status,created_by) VALUES('{tid}','{m.A}','B2B_ORDER','{oid}','{m.C}','{P}','SYN LEGACY','{m.K}',10300,'2026-11-01','2026-12-01',1,'OPEN','{m.U}');ALTER TABLE accounts_receivable ENABLE TRIGGER a01_b2b_fiscal_title_fence;COMMIT;")
 iid=pg.sql(f"SELECT id FROM accounts_receivable_installments WHERE receivable_id='{tid}'")
 pg.sql(f"UPDATE partner_order_payment_schedule SET receivable_installment_id='{iid}',status='generated' WHERE id='{sid}';INSERT INTO partner_order_financial_links(id,partner_order_id,partner_id,receivable_id) VALUES(gen_random_uuid(),'{oid}','{P}','{tid}');UPDATE partner_orders SET internal_economic_snapshot=jsonb_build_object('schema_version','1','sealed_by','{m.U}','origin',jsonb_build_object('organization_id','{m.A}','partner_id','{P}'),'terms',(SELECT to_jsonb(t) FROM partner_order_payment_terms t WHERE id='{terms}'),'schedule',(SELECT jsonb_agg(to_jsonb(s)-ARRAY['created_at','status','receivable_installment_id']) FROM partner_order_payment_schedule s WHERE id='{sid}')) WHERE id='{oid}';")
 # Captured schema has no installment INSERT audit trigger. A positive legacy proof therefore
 # requires pre-existing certified INSERT evidence; without it the candidate must BLOCK.
 deny('real captured legacy missing writer audit blocks',f"SELECT rpc_receivable_money_projection_v1('{tid}',0,1000)",'B2B_LEGACY_WRITER_UNPROVEN')
 pg.sql(scope()+f"INSERT INTO financial_audit_log(entity_type,entity_id,action,new_data,performed_by) SELECT 'accounts_receivable_installments',id,'INSERT',to_jsonb(i),'{m.U}' FROM accounts_receivable_installments i WHERE id='{iid}'")
 projection=json.loads(sql(f"SELECT rpc_receivable_money_projection_v1('{tid}',0,1000)"))
 check('legacy original financed amount captured',10300,projection[0]['original_amount']);check('legacy financing not added twice',300,projection[0]['financed_interest_amount'])
 (OUT/'legacy-projection.json').write_text(json.dumps({'rows':projection,'synthetic':'INSERT writer audit supplied by owner fixture because capture lacks this trigger; not historical remediation'},indent=2))
 pg.sql((H/'captured-deltas.sql.review').read_text())
 pay={'amount_received':100,'interest_amount':10,'payment_method_id':m.PM,'idempotency_key':'legacy-pay-local'}
 sql(f"SELECT rpc_register_receivable_payment('{iid}',{q(pay)}::jsonb)")
 after=json.loads(sql(f"SELECT rpc_receivable_money_projection_v1('{tid}',0,1000)"))[0]
 check('legacy ledger separates financing and mora',310,after['interest_amount']);check('legacy captured recalc column only mora','10.00',pg.sql(f"SELECT interest_amount FROM accounts_receivable_installments WHERE id='{iid}'"))
 check('legacy balance principal financing mora less paid',10210,after['original_amount']+after['interest_amount']-after['financed_interest_amount']-after['received_amount'])
 err=pg.sql(scope(m.B)+f"SELECT rpc_receivable_money_projection_v1('{tid}',0,1000)",ok=False);check('legacy foreign tenant denied',True,'MONEY_ORIGIN_ACCESS_DENIED' in err)
 # Reverted owner tampering probes; no historical edits committed.
 for label,statement,code in [
 ('changed schedule',f"UPDATE partner_order_payment_schedule SET interest_amount=299 WHERE id='{sid}'",'B2B_LEGACY_LINK_MISMATCH'),
 ('incompatible source',f"UPDATE financial_audit_log SET new_data=jsonb_set(new_data,'{{interest_amount}}','0') WHERE entity_id='{iid}' AND action='INSERT'",'B2B_LEGACY_WRITER_INCOMPATIBLE'),
 ('swapped target',f"UPDATE partner_order_financial_links SET receivable_id=gen_random_uuid() WHERE partner_order_id='{oid}'",'B2B_LEGACY_ORIGIN_UNPROVEN')]:
  err=pg.sql(scope()+f"BEGIN;{statement};SELECT rpc_receivable_money_projection_v1('{tid}',0,1000);ROLLBACK;",ok=False);check('legacy '+label+' rejected',True,code in err)

def concurrency_tests(document,allocate):
 # Two requests contend for a remaining item quantity; they serialize on the canonical order row.
 oid=m.uid(850);old=PO
 pg.sql(f"INSERT INTO partner_orders SELECT (jsonb_populate_record(NULL::partner_orders,to_jsonb(p)||jsonb_build_object('id','{oid}','receivable_generated',false))).* FROM partner_orders p WHERE id='{PO}';INSERT INTO partner_order_items SELECT (jsonb_populate_record(NULL::partner_order_items,to_jsonb(i)||jsonb_build_object('id','{m.uid(851)}','order_id','{oid}'))).* FROM partner_order_items i WHERE order_id='{PO}';UPDATE partner_orders SET internal_economic_snapshot=jsonb_build_object('items',(SELECT jsonb_agg(to_jsonb(i)) FROM partner_order_items i WHERE order_id='{oid}')) WHERE id='{oid}';INSERT INTO platform_private.b2b_order_condition_snapshots SELECT '{oid}',organization_id,partner_id,actor_id,plan_id,choice,condition,request_hash,rows,principal,financed_interest,financed_total FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{PO}';")
 ids=[m.uid(852),m.uid(853)]
 for k,d in enumerate(ids):pg.sql(f"INSERT INTO platform_private.b2b_authorized_documents VALUES('{d}','{m.A}','{P}','{oid}','NFSE','2026-11-01','race-{k}','{'c'*64}',{q([{'item_id':m.uid(851),'quantity':3}])}::jsonb,'AUTHORIZED')")
 import concurrent.futures
 def run(d):return subprocess.run(pg.psql(),input=(scope()+f"SELECT platform_private.b2b_allocate_document('{d}')").encode(),capture_output=True)
 with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(run,ids))
 check('concurrent final allocation exactly one winner',1,sum(r.returncode==0 for r in results),'PG_REAL_SESSIONS_SYNTHETIC_AUTH')
 check('concurrent loser overallocates atomically',True,any(b'FISCAL_QUANTITY_OVERALLOCATED' in r.stderr for r in results),'PG_REAL_SESSIONS_SYNTHETIC_AUTH')
 check('concurrent allocation only one title',1,int(pg.sql(f"SELECT count(*) FROM platform_private.b2b_document_allocations WHERE order_id='{oid}'")))
 (OUT/'concurrency.json').write_text(json.dumps([{'returncode':r.returncode,'stdout':r.stdout.decode(),'stderr':r.stderr.decode()} for r in results],indent=2))

def rpc_tests():
 # Dependency gaps are explicit synthetic seams, no captured guard weakened in deployable SQL.
 pg.sql("CREATE FUNCTION public.get_user_partner_id() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;CREATE FUNCTION public.fn_b2b_plan_selectable(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;")
 pg.sql("CREATE OR REPLACE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql SET search_path='' AS $$SELECT $1=auth.uid() AND $2 IN ('financeiro'::public.app_role,'administrador'::public.app_role)$$;")
 cart={'quote_required':False,'table_amount':10000,'discount_amount':0,'net_amount':10000,'lines':[{'item_id':ITEM,'item_tipo':'produto','quantidade':1,'unidade_medida':'litro','final_unit_price':10000,'line_final_amount':10000,'pricing_mode':'discount_from_base','price_source':'synthetic','nome':'SYN','codigo':'SYN'}]}
 pg.sql(f"CREATE FUNCTION public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date) RETURNS jsonb LANGUAGE sql AS $$SELECT {q(cart)}::jsonb$$;")
 # Divergent legacy economics and pinned calendar must never leak into the ACK.
 pg.sql(f"UPDATE commercial_payment_plans SET monthly_interest_percent=9,months_count=9 WHERE id='{PLAN}'")
 pg.sql("CREATE OR REPLACE FUNCTION platform_private.price_pinned_calendar() RETURNS platform_private.holiday_calendars LANGUAGE sql AS $$SELECT jsonb_populate_record(NULL::platform_private.holiday_calendars,to_jsonb(c)||jsonb_build_object('holidays',(SELECT jsonb_agg(CURRENT_DATE+30+k) FROM generate_series(0,10) k))) FROM platform_private.holiday_calendars c WHERE version='synthetic-paracatu-2026-2027'$$;")
 sim=json.loads(sql(f"SELECT simulate_b2b_payment_plan_secure('{P}','{PLAN}','[]',NULL,{q(CHOICE)}::jsonb)"))
 expected_due=sql(f"SELECT platform_private.b2b_business_day(CURRENT_DATE+30,{CAL})")
 check('simulation first_due ACK equals accepted schedule',sim['schedule'][0]['due_date'],sim.get('first_due_date'))
 check('simulation rate version not legacy',1.8,sim['payment_plan']['monthly_interest_percent'])
 check('simulation months version not legacy',3,sim['payment_plan']['months_count'])
 check('simulation accepted calendar not global pin',expected_due,sim['schedule'][0]['due_date'])
 check('simulation fiscal anchor explicitly provisional',{'kind':'PROVISIONAL_ISSUE_DATE','date':pg.sql('SELECT CURRENT_DATE'),'calendar_version':'synthetic-paracatu-2026-2027','fiscal_due_dates_final':False},sim.get('schedule_anchor'))
 check('captured simulation consumes canonical choice',CHOICE,sim['payment_choice']);check('simulation Price final real RPC',10362.14,sim['amounts']['final_amount'])
 (OUT/'simulation-ack.json').write_text(json.dumps(sim,indent=2))
 deny('simulation missing choice no legacy fallback',f"SELECT simulate_b2b_payment_plan_secure('{P}','{PLAN}','[]',NULL,NULL)",'payment_choice_required')
 deny('simulation bad version',f"SELECT simulate_b2b_payment_plan_secure('{P}','{PLAN}','[]',NULL,{q({**CHOICE,'payment_condition_version':2})}::jsonb)",'payment_condition_unavailable')
 pg.sql(f"UPDATE partner_financial_settings SET credit_limit=NULL WHERE partner_id='{P}'")
 deny('null credit blocks capability transition',f"SELECT simulate_b2b_payment_plan_secure('{P}','{PLAN}','[]',NULL,{q(CHOICE)}::jsonb)",'CREDIT_SETTINGS_INCOMPLETE')
 pg.sql(f"UPDATE partner_financial_settings SET credit_limit=100000 WHERE partner_id='{P}'")
 pg.sql("CREATE TABLE public.partner_order_idempotency(id uuid DEFAULT gen_random_uuid(),partner_id uuid,idempotency_key text,cart_hash text,order_id uuid,result_snapshot jsonb,created_by uuid,created_at timestamptz DEFAULT now(),request_fingerprint text);CREATE TABLE platform_private.partner_order_attempt_journal(actor_id uuid,organization_id uuid,partner_id uuid,idempotency_key text);CREATE TABLE platform_private.partner_order_idempotency_closures(partner_id uuid,idempotency_key text);CREATE TABLE public.profiles(user_id uuid,organization_id uuid,ativo boolean);CREATE TABLE public.partner_order_audit_logs(order_id uuid,partner_id uuid,usuario_id uuid,acao text,dados_novos jsonb);")
 pg.sql("CREATE FUNCTION platform_private.c2_attempt_dispatch_guard(uuid,uuid,text) RETURNS void LANGUAGE sql AS $$SELECT$$;CREATE FUNCTION platform_private.c2_partner_order_attempt_authz(uuid,uuid) RETURNS void LANGUAGE sql AS $$SELECT$$;CREATE FUNCTION platform_private.c2_owner_order_create_allowed(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;")
 pg.sql("CREATE TABLE platform_private.authz_tickets(txid bigint,scope text,target uuid);")
 pg.sql(f"INSERT INTO profiles VALUES('{m.U}','{m.A}',true);INSERT INTO platform_private.partner_order_attempt_journal VALUES('{m.U}','{m.A}','{P}','create-local');ALTER TABLE partner_order_items ALTER COLUMN created_at SET DEFAULT now();")
 items=[{'item_tipo':'produto','item_id':ITEM,'quantidade':1}]
 def create(hashval,key='create-local'):
  return f"SELECT create_partner_order_secure('{P}',NULL,{q(items)}::jsonb,NULL,'{PLAN}',NULL,3,{q(hashval)},{q(key)},{q(CHOICE)}::jsonb)"
 deny('create arbitrary hash no effects',create('fake-hash'),'cart_hash_mismatch')
 deny('create includes concurrent exposure limit',create(sim['cart_hash']),'credit_limit_exceeded')
 # Isolate create contract controls from the preceding deliberately open race fixture.
 pg.sql(f"UPDATE partner_orders SET status='cancelado' WHERE id='{m.uid(850)}';UPDATE accounts_receivable SET status='CANCELED' WHERE origin_id='{m.uid(850)}';UPDATE accounts_receivable_installments SET status='CANCELED' WHERE receivable_id IN (SELECT id FROM accounts_receivable WHERE origin_id='{m.uid(850)}')")
 result=json.loads(sql(create(sim['cart_hash'])))
 check('create provisional anchor matches simulation',sim.get('schedule_anchor'),result.get('schedule_anchor'))
 check('create first due accepted business calendar',expected_due,str(result.get('first_due_date')))
 check('captured create canonical ACK',CHOICE,result['payment_choice'])
 check('create valid quoted hash',sim['cart_hash'],result['cart_hash'])
 check('create replay same order',result['id'],json.loads(sql(create(sim['cart_hash'])))['id'])
 oid=result['id'];snap=json.loads(pg.sql(f"SELECT to_jsonb(s) FROM platform_private.b2b_order_condition_snapshots s WHERE order_id='{oid}'"))
 check('create snapshot principal real consumer',10000,snap['principal']);check('create snapshot financed total',10362.14,snap['financed_total'])
 check('create no fiscal title before authorization',0,int(pg.sql(f"SELECT count(*) FROM accounts_receivable WHERE origin_id='{oid}'")))
 (OUT/'create-ack.json').write_text(json.dumps(result,indent=2))

if __name__=='__main__':main()