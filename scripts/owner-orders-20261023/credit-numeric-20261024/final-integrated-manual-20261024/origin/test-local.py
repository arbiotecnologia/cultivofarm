"""Captured full trigger chain + business/pricing bodies; synthetic Auth/fixtures, NOT hosted JWT.
No connection to production; historical replica schema is explicitly partial.
Reconciled variant: overlays the LIVE manual initial-installments correction
(RPC 0778b876, AR fba70619, AP f4b15f02) and its private context table before the
candidate, then proves the composed AR body preserves the manual .34/.33/.33 and
custom-dates path alongside the B2B contractual branch.
"""
from pathlib import Path
import sys,json,time,uuid,subprocess,re
H=Path(__file__).resolve().parent
ROOT=Path('/dev-server')
I=ROOT/'scripts/contracts-c2-20261022/integral'
sys.path.insert(0,str(I))
import pg
checks=[]
def ok(name,cond=True):
    assert cond,name
    checks.append(name);print('PASS',name,flush=True)
def U(n):return f'00000000-0000-4000-8000-{n:012d}'
A,B,P,Q,CLI,CLI_B,PROD,PLAN,SETTINGS=map(U,range(1,10))
ADMIN,ADMIN_B,G,GT,T,PR,GB=map(U,range(100,107))
def actor(u,s,err=None):
    claims=json.dumps({'sub':u,'role':'authenticated','iat':int(time.time())})
    result=pg.sql(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{claims}',true); SELECT current_setting('session_replication_role'); {s} COMMIT;",ok=err is None)
    if err is not None:assert 'ERROR:' in result and err in result,result[-1800:]
    return result
def val(u,s):return actor(u,s).splitlines()[-1]
def snapshot():
    tables=['partner_orders','partner_order_items','partner_order_payment_terms','partner_order_payment_schedule','partner_order_idempotency','partner_financial_settings','accounts_receivable','accounts_receivable_installments','partner_order_financial_links','partner_order_audit_logs','production_timeline_events','notificacoes_operacionais','financial_audit_log','production_planning']
    return {t:pg.sql(f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM public.{t} t") for t in tables}

def exact_denied(u,sql,state,message,owner=False):
 claims=json.dumps({'sub':u,'role':'authenticated','iat':int(time.time())})
 role='' if owner else 'SET LOCAL ROLE authenticated;'
 before=snapshot()
 err=pg.sql(f"\\set VERBOSITY verbose\nBEGIN; {role} SELECT set_config('request.jwt.claims','{claims}',true); {sql}; COMMIT;",ok=False)
 assert 'ERROR:  '+state+': '+message in err,err[-2200:]
 assert snapshot()==before,'denial had effects'

pg.start();pg.sql((I/'replica.sql').read_text())
pg.sql("SET check_function_bodies=off;")
pg.sql((H/'baseline/extra-structure.sql').read_text())
pg.sql("ALTER TABLE public.partner_financial_settings DROP CONSTRAINT IF EXISTS partner_financial_settings_default_payment_method_check;")
relations=json.loads((H/'baseline/relations.json').read_text())
for r in relations['relations']:
    if pg.sql(f"SELECT to_regclass('public.{r['name']}') IS NULL")=='t':
        cols=[]
        for c in r['columns']:
            cols.append('"'+c['name']+'" '+c['type']+(' DEFAULT '+c['default'] if c['default'] else '')+(' NOT NULL' if c['notnull'] else ''))
        pg.sql(f"CREATE TABLE public.{r['name']} ({','.join(cols)}); GRANT ALL ON public.{r['name']} TO service_role;")
# Overlay current captured functions/ACL. No stubs replace business/authorization/pricing functions.
fns={}
pg.sql((H/'baseline/platform_private.c2p1_internal_actor.sql').read_text())
pg.sql((H/'baseline/platform_private.c2_producer_links.sql').read_text())
for source in ['snapshot.json','pricing.json','dependencies.json','relations.json','policy-functions.json']:
    for f in json.loads((H/'baseline'/source).read_text())['functions'] or []:
        f=dict(f);fns[f['sig']]=f
for f in fns.values():
    pg.sql(f['sql'])
    pg.sql(f"ALTER FUNCTION {f['sig']} OWNER TO {f['owner']}; REVOKE ALL ON FUNCTION {f['sig']} FROM PUBLIC,anon,authenticated,service_role;")
    for role in ['anon','authenticated','service_role']:
        if f['acl'] and role+'=X/' in f['acl']:pg.sql(f"GRANT EXECUTE ON FUNCTION {f['sig']} TO {role};")
    if f['acl'] and f['acl'].startswith('{=X/'):pg.sql(f"GRANT EXECUTE ON FUNCTION {f['sig']} TO PUBLIC;")
    # Capture fidelity only, before fixtures/scenarios: preserve historical ACL array ordering.
    acl="NULL" if f['acl'] is None else "'"+f['acl'].replace("'","''")+"'::aclitem[]"
    pg.sql(f"UPDATE pg_proc SET proacl={acl} WHERE oid='{f['sig']}'::regprocedure")
    got=pg.sql(f"SELECT md5(pg_get_functiondef('{f['sig']}'::regprocedure)) FROM pg_proc WHERE oid='{f['sig']}'::regprocedure")
    assert got==f['md5'],(f['sig'],got,f['md5'])
ok('captured business/authorization/pricing bodies reproduce all MD5s')
# Overlay the LIVE manual initial-installments correction (deployed by the auditor,
# commit e99d634): three exact bodies with deployed ACLs plus the private context table.
FIN=ROOT/'scripts/financial-installments-initial-20261024'
live_hashes=json.loads((FIN/'post-hashes.json').read_text())
pg.sql("CREATE TABLE platform_private.financial_initial_installments (transaction_id bigint NOT NULL, title_id uuid NOT NULL, kind text NOT NULL, actor_id uuid NOT NULL, organization_id uuid NOT NULL, installments jsonb NOT NULL, PRIMARY KEY(transaction_id,title_id,kind)); REVOKE ALL ON platform_private.financial_initial_installments FROM PUBLIC,anon,authenticated,service_role; ALTER TABLE platform_private.financial_initial_installments ENABLE ROW LEVEL SECURITY;")
for sig,src,h,acl in [
    ('public.fn_generate_receivable_installments()',FIN/'fn_generate_receivable_installments.sql.review',live_hashes['fn_generate_receivable_installments()'],'{postgres=X/postgres,service_role=X/postgres}'),
    ('public.fn_generate_payable_installments()',FIN/'fn_generate_payable_installments.sql.review',live_hashes['fn_generate_payable_installments()'],'{postgres=X/postgres,service_role=X/postgres}'),
    ('public.rpc_create_financial_title(text,jsonb)',FIN/'rpc_create_financial_title.sql.review',live_hashes['rpc_create_financial_title(text,jsonb)'],'{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}')]:
    pg.sql(src.read_bytes().decode())
    pg.sql(f"REVOKE ALL ON FUNCTION {sig} FROM PUBLIC,anon,authenticated,service_role;")
    for role in ['anon','authenticated','service_role']:
        if role+'=X/' in acl:pg.sql(f"GRANT EXECUTE ON FUNCTION {sig} TO {role};")
    pg.sql(f"UPDATE pg_proc SET proacl='{acl}'::aclitem[] WHERE oid='{sig}'::regprocedure")
    got=pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")
    assert got==h,(sig,got,h)
ok('LIVE manual correction bodies and private context table reproduce deployed MD5s')
chain=json.loads((H/'baseline/chain.json').read_text())
for t in chain['triggers']:
    pg.sql(f"DROP TRIGGER IF EXISTS {t['name']} ON public.{t['table']}; "+t['sql']+';')
ok('all 44 current order/children/financial triggers installed; actions use origin mode')
# Current captured RLS overlay, setup only. Every tested call runs authenticated/origin.
policies=json.loads((H/'baseline/policies.json').read_text())
for t in sorted(set(p['tablename'] for p in policies)):
    for n in pg.sql(f"SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='{t}'").splitlines():pg.sql(f'DROP POLICY "{n}" ON public.{t};')
    pg.sql(f'ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY; ALTER TABLE public.{t} NO FORCE ROW LEVEL SECURITY;')
for p in policies:
    cmd=f'CREATE POLICY "{p["policyname"]}" ON public.{p["tablename"]} AS {p["permissive"]} FOR {p["cmd"]} TO '+','.join(p['roles'])
    if p['qual']:cmd+=' USING ('+p['qual']+')'
    if p['with_check']:cmd+=' WITH CHECK ('+p['with_check']+')'
    pg.sql(cmd+';')
# Preflight must pass unchanged against containment before any candidate mutation.
pg.sql((H/'preflight.sql').read_text());ok('READ ONLY preflight on captured containment')
pg.sql('ALTER TABLE public.partner_orders DISABLE ROW LEVEL SECURITY;')
failure=pg.sql((H/'preflight.sql').read_text(),ok=False);ok('PRE denies disabled RLS','origin_RLS_drift:partner_orders' in failure)
pg.sql('ALTER TABLE public.partner_orders ENABLE ROW LEVEL SECURITY; CREATE POLICY synthetic_unexpected ON public.partner_orders FOR SELECT TO authenticated USING (true);')
failure=pg.sql((H/'preflight.sql').read_text(),ok=False);ok('PRE denies unexpected permissive policy','origin_policy_set_drift' in failure)
pg.sql('DROP POLICY synthetic_unexpected ON public.partner_orders;')
exec(compile((H.parent/'atomicity.py').read_text(),str(H.parent/'atomicity.py'),'exec'))
command('preflight.sql');command('candidate.sql.review',True)
pg.sql((H/'candidate.sql.review').read_text());ok('inactive candidate parsed/applied only in disposable PG')
post={}
for name in json.loads((H/'expected-source.json').read_text()):
    f=next(f for f in fns.values() if f['sig'].split('(')[0]==name)
    post[name]=pg.sql(f"SELECT md5(pg_get_functiondef('{f['sig']}'::regprocedure))")
(H/'postflight-hashes.json').write_text(json.dumps(post,indent=2)+'\n')
(H/'postflight-new-functions.json').write_text(json.dumps({s:pg.sql(f"SELECT md5(pg_get_functiondef('{s}'::regprocedure))") for s in ['platform_private.c2_external_origin_assert(jsonb,uuid,uuid)','platform_private.c2_external_final_state_guard()']},indent=2)+'\n')
subprocess.run([sys.executable,str(H/'assemble.py')],check=True)
pg.sql((H/'postflight.sql').read_text());ok('assertive READ ONLY postflight composed containment')
ok('candidate leaves writer containment false',pg.sql(f"SELECT platform_private.c2_owner_order_create_allowed('{G}','{P}')")=='f')
command('postflight.sql');command('containment.sql.review',True)
# Positive test setup ONLY: reviewed writer body from existing v4 source, never hosted/release.
old=(ROOT/'scripts/owner-orders-20261023/candidate.sql.review').read_text(); start=old.index('CREATE FUNCTION platform_private.c2_owner_order_create_allowed'); end=old.index('END $function$;',start)+len('END $function$;')
pg.sql(old[start:end].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1))
pg.sql(f"""
SET session_replication_role=replica;
INSERT INTO public.organizations(id,nome,ativo,status) VALUES('{A}','A synthetic',true,'ativa'),('{B}','B synthetic',true,'ativa');
INSERT INTO public.saas_modules(id,key,name,active) VALUES('{U(900)}','b2b','B2B',true);
INSERT INTO public.saas_features(id,module_id,key,name,active) VALUES('{U(910)}','{U(900)}','catalogo_precos','Cat',true),('{U(911)}','{U(900)}','pedidos_b2b','Order',true),('{U(912)}','{U(900)}','contas_receber','CR',true),('{U(913)}','{U(900)}','contas_pagar','CP',true);
INSERT INTO public.saas_plans(id,key,name,active,is_default,created_at,updated_at) VALUES('{U(920)}','test','Test',true,false,now(),now());
INSERT INTO public.saas_plan_versions(id,plan_id,version_number,name_snapshot,status,effective_from,features_snapshot,limits_snapshot) VALUES('{U(921)}','{U(920)}',1,'Test','DRAFT',now()-interval '1 day','[]','{{}}');
INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled) SELECT '{U(921)}',id,true FROM public.saas_features;
UPDATE public.saas_plan_versions SET status='PUBLISHED',price_amount=0,currency='BRL',billing_cycle='monthly',trial_days=7,published_at=now()-interval '1 day',features_snapshot='["test"]' WHERE id='{U(921)}';
INSERT INTO public.organization_subscriptions(organization_id,plan_id,plan_version_id,status,started_at) VALUES('{A}','{U(920)}','{U(921)}','ACTIVE',now()-interval '1 day'),('{B}','{U(920)}','{U(921)}','ACTIVE',now()-interval '1 day');
INSERT INTO public.clientes(id,nome,codigo_cliente,organization_id) VALUES('{CLI}','Client A','C-A','{A}'),('{CLI_B}','Client B','C-B','{B}');
INSERT INTO public.partner_accounts(id,codigo,razao_social,ativo,commercial_owner_organization_id,client_id) VALUES('{P}','P','Partner A',true,'{A}','{CLI}'),('{Q}','Q','Partner B',true,'{B}','{CLI_B}');
INSERT INTO public.company_fiscal_settings(id,organization_id,is_active,configuration_status,accounting_validated_at,legal_name,cnpj) VALUES('{SETTINGS}','{A}',true,'VALIDATED',now(),'Synthetic issuer','00000000000000'),('{U(10)}','{B}',true,'VALIDATED',now(),'Synthetic issuer B','11111111111111');
INSERT INTO public.produtos(id,nome,tipo,codigo,ativo,b2b_enabled,valor_litro_brl,created_at,updated_at) VALUES('{PROD}','Synthetic product','inseticida','TEST',true,true,180,now(),now());
INSERT INTO public.catalogo_volumes(item_tipo,produto_id,volume_ml,preco_brl,preco_litro_brl,ativo) VALUES('produto','{PROD}',1000,180,180,true);
INSERT INTO public.commercial_payment_plans(id,name,code,plan_type,active,installment_count,discount_percent,monthly_interest_percent,months_count,interest_type,max_days) VALUES('{PLAN}','Synthetic','TEST','custom',true,3,0,0,0,'none',7);
INSERT INTO public.commercial_payment_plan_assignments(plan_id,buyer_scope,partner_id,status,valid_from) VALUES('{PLAN}','partner','{P}','published',current_date-1),('{PLAN}','partner','{Q}','published',current_date-1);
INSERT INTO public.financial_categories(name,type,active) VALUES('Revenue','RECEITA',true),('Expense','DESPESA',true);
INSERT INTO public.payment_methods(name,active) VALUES('TEST-METHOD',true);
INSERT INTO public.partner_financial_settings(partner_id,billing_trigger,default_payment_method,active,auto_generate_receivable) VALUES('{P}','na_aprovacao','TEST-METHOD',true,true),('{Q}','na_aprovacao','TEST-METHOD',true,true);
SET session_replication_role=origin;
""")
for u,org,roles,p in [(ADMIN,A,['administrador'],None),(ADMIN_B,B,['administrador'],None),(G,A,['parceiro_b2b'],P),(GT,A,['parceiro_b2b','parceiro_b2b_tecnico'],P),(T,A,['parceiro_b2b_tecnico'],P),(PR,A,['cliente_produtor'],None),(GB,B,['parceiro_b2b'],Q)]:
    pg.sql(f"SET session_replication_role=replica; INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES('{u}','{u}@synthetic.invalid','{{}}','{{}}'); INSERT INTO public.profiles(user_id,organization_id,ativo,senha_provisoria,nome) VALUES('{u}','{org}',true,false,'Actor'); "+';'.join(f"INSERT INTO public.user_roles(user_id,role) VALUES('{u}','{r}')" for r in roles)+';'+(f"INSERT INTO public.partner_users(user_id,partner_id,tenant_id,revoked_at,valid_from,version) VALUES('{u}','{p}','{org}',NULL,now()-interval '1 day',1);" if p else '')+'SET session_replication_role=origin;')
# Manual initial-installments path through the COMPOSED AR/AP bodies: the LIVE correction
# (exact .34/.33/.33, custom dates inserted first, private context) must survive composition.
cat_rec=pg.sql("SELECT id FROM public.financial_categories WHERE type='RECEITA' AND active LIMIT 1")
cat_des=pg.sql("SELECT id FROM public.financial_categories WHERE type='DESPESA' AND active LIMIT 1")
def manual_payload(total,amounts,dates,kind='receivable'):
    p=dict(description='TESTE LOCAL',category_id=cat_rec if kind=='receivable' else cat_des,total_amount=total,issue_date='2026-10-24',first_due_date='2026-10-24',installment_count=3,installments=[dict(installment_number=i+1,due_date=dates[i],amount=amounts[i]) for i in range(3)])
    if kind=='receivable': p['customer_id']=CLI
    else: p['supplier_name']='Fornecedor ficticio local'
    return p
def manual_call(p,kind='receivable'):
    return f"SELECT public.rpc_create_financial_title('{kind}','{json.dumps(p)}'::jsonb);"
for kind in ['receivable','payable']:
    fk='receivable_id' if kind=='receivable' else 'payable_id'
    table=f'accounts_{kind}_installments'
    dates=['2026-10-27','2026-12-02','2027-02-11']
    result=json.loads(val(ADMIN,manual_call(manual_payload(1,[.34,.33,.33],dates),kind)))
    tid=result['title_id']
    ok('composed manual '+kind+' 1/3 exact .34/.33/.33 inserted first',pg.sql(f"SELECT string_agg(original_amount::text,',' ORDER BY installment_number) FROM public.{table} WHERE {fk}='{tid}'")=='0.34,0.33,0.33')
    ok('composed manual '+kind+' custom dates inserted first',pg.sql(f"SELECT string_agg(due_date::text,',' ORDER BY installment_number) FROM public.{table} WHERE {fk}='{tid}'")=='2026-10-27,2026-12-02,2027-02-11')
    ok('composed manual '+kind+' tenant propagated to all installments',pg.sql(f"SELECT count(*) FROM public.{table} WHERE {fk}='{tid}' AND organization_id='{A}'")=='3')
    result=json.loads(val(ADMIN,manual_call(manual_payload(.99,[.33,.33,.33],dates),kind)))
    ok('composed manual '+kind+' .99/3',result['success'] is True)
    before=snapshot();actor(ADMIN,manual_call(manual_payload(.01,[.01,0,0],dates),kind),err='FIN_TITLE_INVALID_INSTALLMENT');ok('composed manual '+kind+' .01/3 denied no effects',snapshot()==before)
    failure=pg.sql(f"UPDATE public.{table} SET original_amount=.35 WHERE {fk}='{tid}' AND installment_number=1;",ok=False)
    ok('composed manual '+kind+' later snapshot mutation still denied','Parcela imutavel' in failure)
    before=snapshot();actor(ADMIN,manual_call(dict(manual_payload(1,[.34,.33,.33],dates),organization_id=B),kind),err='FINANCIAL_TENANT_MISMATCH');ok('composed manual '+kind+' cross-tenant payload denied no effects',snapshot()==before)
exact_denied(ADMIN,f"INSERT INTO platform_private.financial_initial_installments VALUES(txid_current(),gen_random_uuid(),'receivable','{ADMIN}','{A}','[]')",'42501','permission denied')
ok('private context table inaccessible to authenticated')
ok('private context empty after manual successes and failures',pg.sql("SELECT count(*) FROM platform_private.financial_initial_installments")=='0')
composed_ar=pg.sql("SELECT md5(pg_get_functiondef('public.fn_generate_receivable_installments()'::regprocedure))")
ok('composed AR is neither historical composed nor plain LIVE manual hash',composed_ar not in ('de469bfc11719e288cd0970411c57c97','fba70619b461c468a8c645ce1c3a8ed8'))
items=json.dumps([{'item_tipo':'produto','item_id':PROD,'quantidade':1,'unidade_medida':'unidade','volume_ml':1000}])
def simulate(u,p=P):return json.loads(val(u,f"SELECT public.simulate_b2b_payment_plan_secure('{p}','{PLAN}','{items}',NULL)"))
def create(u,key,p=P,h=None,obs='Synthetic'):
    h=h or simulate(u,p)['cart_hash']
    return f"SELECT public.create_partner_order_secure('{p}','{obs}','{items}',NULL,'{PLAN}',NULL,NULL,'{h}','{key}')"
hashA=simulate(G)['cart_hash'];ok('real simulation resolves canonical 1L price 180')
accounting=(H/'preflight-accounting.sql').read_text().replace('007bb519-cba0-4704-be2c-cb93ad010048',A).replace('8f57c7dd-0557-4041-b401-7a00f7244626',B)
pg.sql(accounting);ok('accounting gate accepts genuinely validated synthetic fixture only')
pg.sql(f"SET session_replication_role=replica; UPDATE public.company_fiscal_settings SET configuration_status='DRAFT',accounting_validated_at=NULL WHERE id='{SETTINGS}'; SET session_replication_role=origin;")
failure=pg.sql(accounting,ok=False);ok('accounting preflight blocks DRAFT and NULL attestation','C2_ACCOUNTING_PREREQUISITE_BLOCKED' in failure)
before=snapshot();actor(G,create(G,'draft-null',h=hashA)+';',err='B2B_INTERNAL_ISSUER_NOT_VALIDATED');ok('runtime blocks DRAFT NULL without partial order',snapshot()==before)
pg.sql(f"SET session_replication_role=replica; UPDATE public.company_fiscal_settings SET is_active=false WHERE id='{SETTINGS}'; SET session_replication_role=origin;")
failure=pg.sql(accounting,ok=False);ok('accounting preflight blocks absent active configuration','C2_ACCOUNTING_PREREQUISITE_BLOCKED' in failure)
pg.sql(f"SET session_replication_role=replica; UPDATE public.company_fiscal_settings SET is_active=true,configuration_status='VALIDATED',accounting_validated_at=now() WHERE id='{SETTINGS}'; SET session_replication_role=origin;")
ok('private origin/ticket functions not executable by authenticated',pg.sql("SELECT NOT has_function_privilege('authenticated','platform_private.c2_external_origin_assert(jsonb,uuid,uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','platform_private.issue_ticket(text,uuid)','EXECUTE')")=='t')
# Original guard must reproduce reported denial (candidate retained for subsequent tests).
guard=pg.sql("SELECT pg_get_functiondef('platform_private.b2b_internal_order_snapshot_guard()'::regprocedure)")+'\n'
pg.sql((H/'baseline/platform_private.b2b_internal_order_snapshot_guard.sql').read_text())
actor(G,create(G,'baseline',h=hashA)+';',err='B2B_INTERNAL_ACTOR_DENIED');ok('baseline full RPC reproduces B2B_INTERNAL_ACTOR_DENIED')
pg.sql(guard)
exec(compile((H.parent/'integrated-window-checks.py').read_text(),str(H.parent/'integrated-window-checks.py'),'exec'))
orders=[]
for u in [G,GT]:
    result=json.loads(val(u,create(u,str(uuid.uuid4()))+';')); oid=result['id'];orders.append(oid)
    row=json.loads(pg.sql(f"SELECT to_jsonb(o) FROM public.partner_orders o WHERE id='{oid}'"))
    ok('positive singleton/cumulative total180 owner/issuer/creditor A',row['total']==180 and row['c2_external_origin_snapshot']['organization_id']==A and row['c2_external_origin_snapshot']['creditor_organization_id']==A and row['c2_external_origin_snapshot']['issuer_organization_id']==A and row['internal_origin_snapshot'] is None)
    ok('three canonical schedule rows and no title before approval',pg.sql(f"SELECT count(*) FROM public.partner_order_payment_schedule WHERE partner_order_id='{oid}'")=='3' and pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{oid}'")=='0')
for u,p in [(T,P),(PR,P),(GB,P),(G,Q)]:
    before=snapshot();exact_denied(u,create(G,'denied-'+str(u),p,h=hashA),'42501',{T:'forbidden_financial_terms'}.get(u,'forbidden_partner'));ok('negative public create leaves all state unchanged',snapshot()==before)
oid=orders[0]
# Execute the child trigger as local owner with each synthetic caller, independently of RLS zero-row filters.
for u in [G,GT,T,PR,GB,ADMIN_B]:
    before=snapshot();failure=pg.sql(f"BEGIN; SELECT set_config('request.jwt.claims','{{\"sub\":\"{u}\",\"role\":\"authenticated\",\"iat\":{int(time.time())}}}',true); UPDATE public.partner_order_payment_schedule SET status='paid' WHERE partner_order_id='{oid}'; COMMIT;",ok=False)
    ok('child guard denies external/foreign administration '+str(u),'C2_EXTERNAL_OWNER_DENIED' in failure and snapshot()==before)
actor(ADMIN,f"SELECT public.approve_partner_order('{oid}',NULL,NULL);")
ok('real approval/billing atomic with one title and no production readiness',pg.sql(f"SELECT status||'|'||ready_for_production||'|'||receivable_generated FROM public.partner_orders WHERE id='{oid}'")=='aprovado|false|true' and pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{oid}' AND organization_id='{A}'")=='1')
ok('H6 installments match exact contractual dates/amounts',pg.sql(f"SELECT count(*) FROM public.partner_order_payment_schedule s JOIN public.accounts_receivable_installments a ON a.id=s.receivable_installment_id WHERE s.partner_order_id='{oid}' AND a.due_date=s.due_date AND a.net_amount=s.amount")=='3')
for table,where in [('partner_orders',f"id='{oid}'"),('partner_order_items',f"order_id='{oid}'"),('partner_order_payment_terms',f"partner_order_id='{oid}'"),('partner_order_payment_schedule',f"partner_order_id='{oid}'"),('accounts_receivable',f"origin_id='{oid}'"),('accounts_receivable_installments',f"receivable_id IN (SELECT id FROM public.accounts_receivable WHERE origin_id='{oid}')")]:
    ok('authenticated B cannot read A '+table,val(ADMIN_B,f'SELECT count(*) FROM public.{table} WHERE {where};')=='0')
ok('authenticated A reads own title',val(ADMIN,f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{oid}';")=='1')
tenant_id=pg.sql(f"SELECT id FROM public.accounts_receivable WHERE origin_id='{oid}'")
ok('tenant propagated all installments',pg.sql(f"SELECT count(*) FROM public.accounts_receivable_installments WHERE receivable_id='{tenant_id}' AND organization_id='{A}'")=='3')
exact_denied(ADMIN,f"INSERT INTO public.accounts_receivable_installments(receivable_id,installment_number,due_date,original_amount,net_amount,status,organization_id) VALUES('{tenant_id}',99,current_date,1,1,'OPEN',NULL)",'23514','FINANCIAL_TENANT_REQUIRED',owner=True)
ok('NULL installment tenant exact canonical denial')
exact_denied(ADMIN_B,f"INSERT INTO public.accounts_receivable_installments(receivable_id,installment_number,due_date,original_amount,net_amount,status,organization_id) VALUES('{tenant_id}',99,current_date,1,1,'OPEN','{B}')",'23514','FINANCIAL_RECEIVABLE_TENANT_MISMATCH',owner=True)
ok('crossed installment parent exact canonical denial')
exact_denied(ADMIN,f"INSERT INTO public.accounts_receivable(description,total_amount,installment_count,first_due_date,status,organization_id) VALUES('NULL local',1,3,current_date,'OPEN',NULL)",'23514','FINANCIAL_TENANT_REQUIRED',owner=True)
ok('NULL title tenant exact canonical denial')
other=json.loads(val(GB,create(GB,'tenant-B-positive',p=Q)+';'))['id']
actor(ADMIN_B,f"SELECT public.approve_partner_order('{other}',NULL,NULL);")
ok('B same fixtures own title three tenant installments positive',pg.sql(f"SELECT count(*) FROM public.accounts_receivable_installments i JOIN public.accounts_receivable a ON a.id=i.receivable_id WHERE a.origin_id='{other}' AND a.organization_id='{B}' AND i.organization_id='{B}'")=='3')

before=snapshot();actor(ADMIN,f"UPDATE public.partner_orders SET c2_external_origin_snapshot=jsonb_set(c2_external_origin_snapshot,'{{creditor_organization_id}}','\"{B}\"') WHERE id='{oid}';");ok('RLS blocks direct origin change',snapshot()==before)
# Owner-superuser trigger execution with synthetic actor proves the trigger independently of RLS zero-row updates.
pg.sql(f"BEGIN; SELECT set_config('request.jwt.claims','{{\"sub\":\"{ADMIN}\",\"role\":\"authenticated\",\"iat\":{int(time.time())}}}',true); UPDATE public.partner_orders SET c2_external_origin_snapshot=jsonb_set(c2_external_origin_snapshot,'{{creditor_organization_id}}','\"{B}\"') WHERE id='{oid}'; COMMIT;",ok=False)
ok('origin trigger rejects forged creditor',snapshot()==before)
before=snapshot();actor(ADMIN,f"UPDATE public.partner_order_items SET quantidade=2 WHERE order_id='{oid}';");ok('RLS blocks sealed item edits',snapshot()==before)
actor(ADMIN,f"SELECT public.generate_b2b_receivable_secure('{oid}');")
ok('billing replay one title',pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{oid}'")=='1')
for u in [T,PR,GB,ADMIN_B]:
    before=snapshot();exact_denied(u,f"SELECT public.approve_partner_order('{orders[1]}',NULL,NULL)",'42501','b2b_phase1_scope_denied');ok('unauthorized approval unchanged',snapshot()==before)
before=snapshot();pg.sql("CREATE FUNCTION public.test_fail_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_LATE_FAIL'; END $$; CREATE TRIGGER zz_test_fail BEFORE INSERT ON public.partner_order_financial_links FOR EACH ROW EXECUTE FUNCTION public.test_fail_link();")
actor(ADMIN,f"SELECT public.approve_partner_order('{orders[1]}',NULL,NULL);",err='B2B_APPROVAL_BILLING_FAILED')
ok('late billing failure rolls back approval/title/installments/schedule/audits',snapshot()==before)
pg.sql('DROP TRIGGER zz_test_fail ON public.partner_order_financial_links;')
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=100,credit_limit_action='approval_required' WHERE partner_id='{P}'; SET session_replication_role=origin;")
before=snapshot();failure=pg.sql(f"BEGIN; SELECT set_config('request.jwt.claims','{{\"sub\":\"{ADMIN}\",\"role\":\"authenticated\",\"iat\":{int(time.time())}}}',true); UPDATE public.partner_orders SET status='aprovado' WHERE id='{orders[1]}'; COMMIT;",ok=False);print(failure);ok('late credit decision cannot leave pending order sealed','C2_EXTERNAL_UNFINALIZED_APPROVAL' in failure and snapshot()==before)
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=0 WHERE partner_id='{P}'; SET session_replication_role=origin;")
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET auto_generate_receivable=false WHERE partner_id='{P}'; SET session_replication_role=origin;")
actor(ADMIN,f"SELECT public.approve_partner_order('{orders[1]}',NULL,NULL);")
pg.sql(f"SET session_replication_role=replica; DELETE FROM public.partner_financial_settings WHERE partner_id='{P}'; SET session_replication_role=origin;");before=snapshot()
actor(ADMIN,f"SELECT public.generate_b2b_receivable_secure('{orders[1]}');",err='B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED');ok('missing settings explicitly denied without automatic insert or partial title',snapshot()==before)
pg.sql(f"SET session_replication_role=replica; INSERT INTO public.partner_financial_settings(partner_id,billing_trigger,default_payment_method,active,auto_generate_receivable) VALUES('{P}','na_aprovacao','TEST-METHOD',true,true); SET session_replication_role=origin;")
# REAL fixture is na_entrega. Only disposable synthetic settings change here.
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET billing_trigger='na_entrega' WHERE partner_id='{P}'; SET session_replication_role=origin;")
for u in [G,GT]:
    delivery_id=json.loads(val(u,create(u,str(uuid.uuid4()))+';'))['id']
    actor(ADMIN,f"SELECT public.approve_partner_order('{delivery_id}',NULL,NULL);")
    ok('na_entrega external approval no title singleton/cumulative '+str(u),pg.sql(f"SELECT status||'|'||ready_for_production||'|'||receivable_generated FROM public.partner_orders WHERE id='{delivery_id}'")=='aprovado|false|false' and pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{delivery_id}'")=='0' and pg.sql(f"SELECT count(*) FROM public.partner_order_financial_links WHERE partner_order_id='{delivery_id}'")=='0')
    before=snapshot()
    exact_denied(ADMIN,f"SELECT public.generate_b2b_receivable_secure('{delivery_id}')",'42501','C2_EXTERNAL_DELIVERY_REQUIRED')
    ok('na_entrega before delivery billing denied no effects '+str(u),snapshot()==before)
    for status in ['em_producao','entregue']:
        before=snapshot()
        failure=pg.sql(f"BEGIN; SELECT set_config('request.jwt.claims','{{\"sub\":\"{ADMIN}\",\"role\":\"authenticated\",\"iat\":{int(time.time())}}}',true); UPDATE public.partner_orders SET status='{status}' WHERE id='{delivery_id}'; COMMIT;",ok=False)
        ok('na_entrega operational still denied '+status+' '+str(u),'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' in failure and snapshot()==before)
    ok('na_entrega no production planning '+str(u),pg.sql(f"SELECT count(*) FROM public.production_planning WHERE partner_order_id='{delivery_id}'")=='0')
# LIVE numeric preserved, never install/revert historical arithmetic candidate.
credit=next(f for sig,f in fns.items() if sig.startswith('public.fn_b2b_credit_exposure('))
ok('LIVE numeric exact preserved',pg.sql(f"SELECT md5(pg_get_functiondef('{credit['sig']}'::regprocedure))")=='213ac31f3a30816ead75365b0d1fed18')
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=now(),revoked_by='{ADMIN}',revoke_reason='Synthetic revocation' WHERE user_id='{G}'; SET session_replication_role=origin;")
before=snapshot();exact_denied(G,create(G,'revoked',h=hashA),'42501','forbidden_partner');ok('revoked manager rejected with no writes',snapshot()==before)
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=NULL,revoked_by=NULL,revoke_reason=NULL WHERE user_id='{G}'; SET session_replication_role=origin;")
key=str(uuid.uuid4());call=create(G,key);first=val(G,call+';');before=snapshot();again=val(G,call+';');ok('create idempotency same result and no new writes',first==again and snapshot()==before)
before=snapshot();actor(G,create(G,key,obs='Changed')+';',err='idempotency_conflict');ok('conflicting replay no writes',snapshot()==before)
before=snapshot();actor(G,create(G,'wronghash',h='invalid')+';',err='price_changed');ok('incorrect hash no writes',snapshot()==before)
pg.sql(f"SET session_replication_role=replica; UPDATE public.company_fiscal_settings SET configuration_status='DRAFT' WHERE id='{SETTINGS}'; SET session_replication_role=origin;")
before=snapshot();actor(G,create(G,'issuerinvalid',h=hashA)+';',err='B2B_INTERNAL_ISSUER_NOT_VALIDATED');ok('unvalidated owner issuer rejected atomically',snapshot()==before)
pg.sql(f"SET session_replication_role=replica; UPDATE public.company_fiscal_settings SET configuration_status='VALIDATED' WHERE id='{SETTINGS}'; SET session_replication_role=origin;")
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_accounts SET client_id='{CLI_B}' WHERE id='{P}'; SET session_replication_role=origin;")
before=snapshot();actor(G,create(G,'foreignclient',h=hashA)+';',err='C2_EXTERNAL_CLIENT_DENIED');ok('owner/client cross-tenant denied atomically',snapshot()==before)
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_accounts SET client_id='{CLI}' WHERE id='{P}'; SET session_replication_role=origin;")
# Stage both approved/title-existing and pending external orders before containment.
pending_external=json.loads(val(G,create(G,'containment-pending',h=hashA)+';'))['id']
# Internal path uses actual canonical create/approval, not a replacement or invented NULL origin.
pg.sql(f"SET session_replication_role=replica; UPDATE public.organizations SET partner_account_id='{Q}' WHERE id='{B}'; UPDATE public.partner_financial_settings SET credit_limit=0,billing_trigger='na_aprovacao' WHERE partner_id='{Q}'; SET session_replication_role=origin;")
internal_id=json.loads(val(ADMIN_B,create(ADMIN_B,'containment-internal',p=Q)+';'))['id']
ok('canonical internal origin created before containment',pg.sql(f"SELECT internal_origin_snapshot IS NOT NULL AND c2_external_origin_snapshot IS NULL FROM public.partner_orders WHERE id='{internal_id}'")=='t')
before=snapshot();actor(ADMIN_B,f"SELECT public.approve_partner_order('{internal_id}',NULL,NULL);",err='B2B_INTERNAL_DOWNSTREAM_UNVERIFIED')
ok('internal approval original downstream containment before rollback',snapshot()==before)
actor(ADMIN_B,f"SELECT public.generate_b2b_receivable_secure('{internal_id}');",err='B2B_INTERNAL_DOWNSTREAM_UNVERIFIED')
ok('internal billing original downstream denial before rollback',snapshot()==before)
rollback=(H/'containment.sql.review').read_text()
approve_sig='public.approve_partner_order(uuid,text,date)'
saved_approve=pg.sql(f"SELECT pg_get_functiondef('{approve_sig}'::regprocedure)")+'\n'
pg.sql(saved_approve.replace('BEGIN\n','BEGIN\n  -- deliberate synthetic drift\n',1))
before=snapshot();failure=pg.sql(rollback,ok=False);print(failure,flush=True)
ok('containment rejects body drift atomically','origin_dependency_drift:public.approve_partner_order' in failure and snapshot()==before and pg.sql("SELECT md5(pg_get_functiondef('platform_private.c2_owner_order_create_allowed(uuid,uuid)'::regprocedure))")=='5f0a08d1d4f8d8c5a7ae58e24c71071e')
pg.sql(saved_approve)
pg.sql(f"GRANT EXECUTE ON FUNCTION {approve_sig} TO anon;")
failure=pg.sql(rollback,ok=False)
ok('containment rejects ACL drift atomically','origin_dependency_drift:public.approve_partner_order' in failure and snapshot()==before)
pg.sql(f"REVOKE EXECUTE ON FUNCTION {approve_sig} FROM anon;")
before=snapshot();command('containment.sql.review')
ok('containment preserves corrected wrapper exact hash',pg.sql("SELECT md5(pg_get_functiondef('public.generate_b2b_receivable_secure(uuid)'::regprocedure))")== '31eeb54e4b69d97c311629a37e553faf')
ok('containment install changes no history or snapshots',snapshot()==before)
before=snapshot();actor(G,create(G,'contained',h=hashA)+';',err='C2_OWNER_ORDER_CLOSED');ok('rollback closes writer and preserves historical data',snapshot()==before)
for external in [pending_external,orders[0],orders[1]]:
    for operation in [f"SELECT public.approve_partner_order('{external}',NULL,NULL);",f"SELECT public.generate_b2b_receivable_secure('{external}');"]:
        before=snapshot();exact_denied(ADMIN,operation,'42501','C2_EXTERNAL_OPERATIONS_CONTAINED')
        ok('contained external approval/billing denied no effects '+external,snapshot()==before)
before=snapshot()
actor(ADMIN_B,f"SELECT public.approve_partner_order('{internal_id}',NULL,NULL);",err='B2B_INTERNAL_DOWNSTREAM_UNVERIFIED')
ok('internal approval original downstream denial preserved after containment',snapshot()==before)
actor(ADMIN_B,f"SELECT public.generate_b2b_receivable_secure('{internal_id}');",err='B2B_INTERNAL_DOWNSTREAM_UNVERIFIED')
ok('internal billing original downstream denial preserved after containment',snapshot()==before)
legacy=U(880)
pg.sql(f"SET session_replication_role=replica; INSERT INTO public.partner_orders(id,numero,partner_id,status,created_by) VALUES('{legacy}','LEGACY-CONTAINMENT','{P}','rascunho','{ADMIN}'); SET session_replication_role=origin;")
before=snapshot();actor(ADMIN,f"SELECT public.approve_partner_order('{legacy}',NULL,NULL);",err='order_not_priceable_quote_required')
ok('legacy NULL retains original denial not external containment',snapshot()==before)
print('TOTAL',len(checks),'PASS; synthetic Auth, no hosted JWT/RLS certification')