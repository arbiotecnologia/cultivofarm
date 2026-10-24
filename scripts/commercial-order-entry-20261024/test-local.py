"""Disposable PostgreSQL only; captured LIVE bodies/triggers/RLS + synthetic Auth. NOT hosted JWT/RLS."""
from pathlib import Path
import json,time
D=Path(__file__).resolve().parent
O=Path('/dev-server/scripts/owner-orders-20261023/credit-numeric-20261024/current-base-reconciliation-20261024/origin')
H=O
s=(O/'test-local.py').read_text()
setup=s[:s.index('# Preflight must pass unchanged')]
fixtures=s[s.index('pg.sql(f"""\nSET session_replication_role=replica;'):s.index("hashA=simulate(G)")]
setup=setup.replace("H=Path(__file__).resolve().parent","H=O")
exec(compile(setup,str(O/'test-local.py'),'exec'))
exec(compile(fixtures,str(O/'test-local.py'),'exec'))
# Restore captured LIVE writer=false (the harness installs a reviewed positive writer for other suites).
pg.sql((O/'baseline/platform_private.c2_owner_order_create_allowed.sql').read_text()+";")
E=json.loads((D/'expected.json').read_text())
md5=lambda sig:pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")
ok('LIVE writer false exact',md5('platform_private.c2_owner_order_create_allowed(uuid,uuid)')=='a0417d6727d78412849916a95b250bde')
exec(compile((D/'catalog/catalog_harness.py').read_text(),str(D/'catalog/catalog_harness.py'),'exec'))
def counts():return pg.sql("SELECT (SELECT count(*) FROM public.partner_orders)||'/'||(SELECT count(*) FROM public.accounts_receivable)||'/'||(SELECT count(*) FROM public.accounts_receivable_installments)||'/'||(SELECT count(*) FROM public.partner_order_financial_links)")
SIM=lambda p:f"SELECT public.simulate_b2b_payment_plan_secure('{p}','{PLAN}','{items}',NULL)"
def denied(u,sql,needle):
    before=snapshot(); err=pg.sql(f"\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{json.dumps({'sub':u,'role':'authenticated','iat':int(time.time())})}',true); {sql}; COMMIT;",ok=False)
    assert needle in err,err[-1500:]; assert snapshot()==before,'denial had effects'
cap=lambda u:json.loads(val(u,"SELECT public.c2_internal_order_entry_capability_v1()"))
# Baseline LIVE: internal A cannot target its portfolio partner (org_partner rule).
denied(ADMIN,SIM(P),'42501: forbidden_partner');ok('baseline internal A portfolio simulate denied forbidden_partner')
ext_before=pg.sql(f"\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{json.dumps({'sub':G,'role':'authenticated','iat':int(time.time())})}',true); {create(G,'ext-1',h='x')}; COMMIT;",ok=False).split('ERROR:')[1].splitlines()[0]
pg.sql((D/'preflight.sql').read_text());ok('preflight READ ONLY passes on captured LIVE')
# Failing POST in the same transaction must preserve everything.
bad=(D/'candidate.sql.review').read_text().replace('COMMIT;\n','DO $x$ BEGIN RAISE EXCEPTION $$C2IOE_INJECTED_POST_FAILURE$$; END $x$;\nCOMMIT;\n')
assert 'C2IOE_INJECTED_POST_FAILURE' in pg.sql(bad,ok=False)
ok('candidate failing POST rolls back atomically',md5('platform_private.c2_order_actor_scope(uuid,uuid)')==E['live_scope'] and pg.sql("SELECT to_regprocedure('public.c2_internal_order_entry_capability_v1()') IS NULL")=='t')
pg.sql((D/'candidate.sql.review').read_text())
cand={'platform_private.c2_order_actor_scope(uuid,uuid)':md5('platform_private.c2_order_actor_scope(uuid,uuid)'),
 'platform_private.c2_internal_order_target_reason(uuid,uuid)':md5('platform_private.c2_internal_order_target_reason(uuid,uuid)'),
 'public.c2_internal_order_entry_capability_v1()':md5('public.c2_internal_order_entry_capability_v1()'),'public.get_partner_catalog_secure(uuid)':md5('public.get_partner_catalog_secure(uuid)')}
print('CANDIDATE_MD5',json.dumps(cand))
if E['candidate']:assert E['candidate']==cand,(E['candidate'],cand)
pg.sql((D/'postflight.sql').read_text());ok('postflight READ ONLY passes')
c=cap(ADMIN);ok('capability A lists only own portfolio from row owner',[x['partner_id'] for x in c['partners']]==[P] and c['partners'][0]['commercial_owner_organization_id']==A and c['organization_id']==A)
ok('capability opens only with validated issuer, feature and reviewed catalogue reader',c['order_create'] is True and c['reason'] is None and c['profile_ok'] is True)
catalog_post_checks()
c=cap(ADMIN_B);ok('capability B lists only B portfolio',[x['partner_id'] for x in c['partners']]==[Q])
for u in [G,T,GT,PR]:
    c=cap(u);assert c['order_create'] is False and c['reason']=='actor_not_allowed' and c['partners']==[],c
ok('external manager/technician/cumulative/producer get actor_not_allowed with no targets')
n0=counts()
simA=json.loads(val(ADMIN,SIM(P)));ok('internal A simulates own portfolio partner with canonical hash',bool(simA.get('cart_hash')))
denied(ADMIN,SIM(Q),'42501: C2_INTERNAL_TARGET_DENIED:target_outside_portfolio');ok('internal A foreign B partner simulate denied, no effects')
denied(ADMIN_B,create(ADMIN_B,'b-on-a',p=P,h=simA['cart_hash']),'42501: C2_INTERNAL_TARGET_DENIED:target_outside_portfolio');ok('internal B create on A partner denied, no effects')
denied(T,SIM(P),'42501: forbidden_financial_terms');ok('technician denial unchanged')
ext_after=pg.sql(f"\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{json.dumps({'sub':G,'role':'authenticated','iat':int(time.time())})}',true); {create(G,'ext-2',h='x')}; COMMIT;",ok=False).split('ERROR:')[1].splitlines()[0]
ok('external manager create outcome byte-identical to LIVE: '+ext_after.strip(),ext_before==ext_after)
denied(ADMIN,f"SELECT public.create_partner_order_secure('{P}','x','{items}',NULL,'{PLAN}',NULL,NULL,NULL,'k-nohash')",'cart_hash_required');ok('hash required')
r1=json.loads(val(ADMIN,create(ADMIN,'int-a-1',h=simA['cart_hash'])+';'));before=snapshot();r2=json.loads(val(ADMIN,create(ADMIN,'int-a-1',h=simA['cart_hash'])+';'))
ok('idempotent replay returns same order with no new writes',r1['id']==r2['id'] and snapshot()==before)
denied(ADMIN,create(ADMIN,'int-a-1',h=simA['cart_hash'],obs='changed'),'idempotency_conflict');ok('same key different request conflicts')
ok('created order has server internal origin, not production-ready',pg.sql(f"SELECT internal_origin_snapshot->>'organization_id'||'/'||ready_for_production FROM public.partner_orders WHERE id='{r1['id']}'")==A+'/false')
n1=counts();ok('preparation/create generated no title, installment or link: '+n1,n1.split('/')[1:]==n0.split('/')[1:])
ok('no fiscal invoice/transmission generated by canonical create',pg.sql("SELECT (SELECT count(*) FROM public.fiscal_invoices)+(SELECT count(*) FROM public.fiscal_sefaz_transmissions)")=='0')
pg.sql(f"SET session_replication_role=replica; UPDATE public.company_fiscal_settings SET configuration_status='DRAFT',accounting_validated_at=NULL WHERE id='{SETTINGS}'; SET session_replication_role=origin;")
ok('issuer DRAFT closes capability with structured reason',cap(ADMIN)['reason']=='issuer_not_validated')
s2=json.loads(val(ADMIN,SIM(P)))
denied(ADMIN,create(ADMIN,'int-a-draft',h=s2['cart_hash']),'42501: B2B_INTERNAL_ISSUER_NOT_VALIDATED');ok('accounting gate preserved: DRAFT create denied, no effects')
pg.sql(f"SET session_replication_role=replica; UPDATE public.company_fiscal_settings SET configuration_status='VALIDATED',accounting_validated_at=now() WHERE id='{SETTINGS}'; UPDATE public.profiles SET ativo=false WHERE user_id='{ADMIN}'; SET session_replication_role=origin;")
denied(ADMIN,SIM(P),'42501: inactive_scope');ok('inactive profile denied by unchanged LIVE path; capability closed',cap(ADMIN)['profile_ok'] is False)
pg.sql(f"SET session_replication_role=replica; UPDATE public.profiles SET ativo=true WHERE user_id='{ADMIN}'; DELETE FROM public.user_roles WHERE user_id='{ADMIN}'; SET session_replication_role=origin;")
ok('revoked role closes capability',cap(ADMIN)['reason']=='actor_not_allowed')
pg.sql(f"SET session_replication_role=replica; INSERT INTO public.user_roles(user_id,role) VALUES('{ADMIN}','administrador'),('{ADMIN}','parceiro_b2b'); SET session_replication_role=origin;")
denied(ADMIN,SIM(P),'forbidden_partner');ok('internal+external multi-profile falls back to unchanged LIVE path, no bypass')
pg.sql(f"SET session_replication_role=replica; DELETE FROM public.user_roles WHERE user_id='{ADMIN}' AND role='parceiro_b2b'; SET session_replication_role=origin;")
bad=(D/'rollback.sql.review').read_text().replace('COMMIT;\n','DO $x$ BEGIN RAISE EXCEPTION $$C2IOE_INJECTED_RB_FAILURE$$; END $x$;\nCOMMIT;\n')
assert 'C2IOE_INJECTED_RB_FAILURE' in pg.sql(bad,ok=False)
ok('rollback failing POST preserves candidate',md5('platform_private.c2_order_actor_scope(uuid,uuid)')==cand['platform_private.c2_order_actor_scope(uuid,uuid)'])
pg.sql((D/'rollback.sql.review').read_text())
ok('rollback restores exact LIVE scope and removes new functions',md5('platform_private.c2_order_actor_scope(uuid,uuid)')==E['live_scope'])
catalog_rollback_checks()
denied(ADMIN,SIM(P),'42501: forbidden_partner');ok('after rollback internal portfolio closed again; created order history kept',pg.sql(f"SELECT count(*) FROM public.partner_orders WHERE id='{r1['id']}'")=='1')
ok('writer still false',md5('platform_private.c2_owner_order_create_allowed(uuid,uuid)')=='a0417d6727d78412849916a95b250bde')
print('TOTAL',len(checks),'PASS; synthetic Auth, no hosted JWT/RLS certification')
