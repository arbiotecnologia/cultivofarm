"""Disposable PostgreSQL only: captured b5 chain + C2_ACCOUNTING_PENDING_V1 overlay. Synthetic Auth; NOT hosted JWT/RLS.
Fixtures: owner A DRAFT (mirrors real pending accounting), owner B synthetic MG issuer VALIDATED only inside this DB."""
from pathlib import Path
import json,time,subprocess,sys
D=Path(__file__).resolve().parent
H=D.parent/'credit-numeric-20261024/final-integrated-manual-20261024/origin'
s=(H/'test-local.py').read_text()
setup=s[:s.index('# Preflight must pass unchanged')].replace("H=Path(__file__).resolve().parent","H=Path(%r)"%str(H))
fixtures=s[s.index('pg.sql(f"""\nSET session_replication_role=replica;\nINSERT INTO public.organizations'):s.index('# Manual initial-installments path')]
exec(compile(setup,str(H/'test-local.py'),'exec'))
E=json.loads((D/'expected.json').read_text())
md5=lambda sig:pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")
# Emulate CURRENT LIVE: install 30dc8243 (commercial_portfolio_catalog_entry_guarded) exactly as reviewed, then
# compare every captured 15:40 dependency hash; mismatches install the captured body (evidence) and are reported.
C30D=D.parent.parent/'commercial-order-entry-20261024'
c30=(C30D/'candidate.sql.review').read_text();c30=c30[c30.index('END $pre$;')+len('END $pre$;'):c30.index('DO $post$')]
pg.sql('BEGIN;'+c30+'COMMIT;')
pg.sql("REVOKE ALL ON FUNCTION public.get_partner_catalog_secure(uuid) FROM PUBLIC,anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION public.get_partner_catalog_secure(uuid) TO service_role; GRANT EXECUTE ON FUNCTION public.get_partner_catalog_secure(uuid) TO authenticated;")  # captured LIVE ACL order
ok('catalog ACL equals captured LIVE literal',pg.sql("SELECT proacl::text FROM pg_proc WHERE oid='public.get_partner_catalog_secure(uuid)'::regprocedure")=='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}')
C30=json.loads((C30D/'expected.json').read_text())['candidate']
ok('LIVE 30dc8243 objects reproduced byte-exact in harness',all(md5(k)==v for k,v in C30.items()))
CAP=json.loads((D/'live-capture-20261024-1540.json').read_text())
for dep in CAP['dependencies']:
    sig=dep['signature'].replace('(partner_order_status)','(public.partner_order_status)')
    if md5(sig)!=dep['md5']:
        print('CAPTURE_DRIFT_INSTALLED',sig);pg.sql(dep['definition']+';')
    ok('captured LIVE dependency md5 '+dep['md5'][:8]+' '+sig,md5(sig)==dep['md5'])
# LIVE approve_b2b_credit captured READ ONLY 26/10 (md5 1d5ba930...), installed byte-exact with LIVE owner/ACL.
pg.sql((D/'src/live-approve_b2b_credit.sql').read_text().strip()+";\nALTER FUNCTION public.approve_b2b_credit(uuid,text) OWNER TO postgres; REVOKE ALL ON FUNCTION public.approve_b2b_credit(uuid,text) FROM PUBLIC,anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION public.approve_b2b_credit(uuid,text) TO service_role; GRANT EXECUTE ON FUNCTION public.approve_b2b_credit(uuid,text) TO authenticated;")
ok('captured LIVE approve_b2b_credit md5/ACL reproduced',md5('public.approve_b2b_credit(uuid,text)')=='1d5ba930634e165750352e9f44fa844f' and pg.sql("SELECT proacl::text FROM pg_proc WHERE oid='public.approve_b2b_credit(uuid,text)'::regprocedure")=='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}')
ok('captured LIVE entitlements_for_user md5 matches harness',md5('platform_private.entitlements_for_user(uuid)')==CAP['entitlements_for_user_md5'])
ok('captured absent signature really absent in harness reference: fn_resolve_b2b_cart(uuid,jsonb,date)',pg.sql("SELECT to_regprocedure('public.fn_resolve_b2b_cart(uuid,jsonb,date)') IS NULL")=='t')
pg.sql((D/'preflight.sql').read_text());ok('b5 structural preflight READ ONLY passes on captured LIVE (writer false)')
cand=(D/'candidate.sql.review').read_text()
if not E['candidate']:
    cand=cand[:cand.index('DO $c2ap_post$')]+'COMMIT;\n'
    pg.sql(cand)
    sigs=list(E['b5_hashes'])+['platform_private.c2_external_origin_contract_valid(jsonb)','platform_private.c2_accounting_promotion_ok(jsonb,jsonb,uuid)','platform_private.c2_accounting_pending_guard()','platform_private.c2_promote_accounting_pending_order_core(uuid,timestamptz)','public.c2_promote_accounting_pending_order_v1(uuid,timestamptz)','public.approve_b2b_credit(uuid,text)']
    E['candidate']={k:md5(k) for k in sigs}
    E['b5_to_candidate']={E['b5_hashes'][k]:E['candidate'][k] for k in E['b5_hashes']}
    (D/'expected.json').write_text(json.dumps(E,indent=1)+'\n');subprocess.run([sys.executable,str(D/'assemble.py')],check=True)
    raise SystemExit('BOOTSTRAP: hashes pinned, rerun')
inj=lambda t,tag:(lambda a:a[0]+'DO $x$ BEGIN RAISE EXCEPTION $$'+tag+'$$; END $x$;\n'+a[1]+a[2])(t.rpartition('\nCOMMIT;\n')[0:1]+('\nCOMMIT;\n',t.rpartition('\nCOMMIT;\n')[2]))
assert cand.rstrip().endswith('\nCOMMIT;')
bad=inj(cand,'C2AP_INJECTED_POST')
assert 'C2AP_INJECTED_POST' in pg.sql(bad,ok=False)
ok('candidate failing POST rolls back atomically (writer still false, no overlay)',md5('platform_private.c2_owner_order_create_allowed(uuid,uuid)')==E['b5_hashes']['platform_private.c2_owner_order_create_allowed(uuid,uuid)'] and pg.sql("SELECT to_regprocedure('platform_private.c2_accounting_pending_guard()') IS NULL")=='t')
pg.sql(cand);ok('candidate installs with owner A NOT validated (no install-time accounting gate)')
ok('30dc8243 preserved byte-exact after candidate',all(md5(k)==v for k,v in C30.items()))
# Full restore (no history yet) returns to pre-implantation LIVE and keeps 30dc8243; then reinstall proves PRE again.
pg.sql((D/'restore-live.sql.review').read_text())
ok('restore-live returns exact pre-implantation LIVE bodies and drops column/objects',all(md5(k)==v for k,v in E['live_restore'].items()) and pg.sql("SELECT count(*) FROM pg_attribute WHERE attrelid='public.partner_orders'::regclass AND attname='c2_external_origin_snapshot' AND NOT attisdropped")=='0')
ok('restore-live keeps 30dc8243 byte-exact',all(md5(k)==v for k,v in C30.items()))
pg.sql((D/'preflight.sql').read_text());ok('preflight passes again after full restore')
pg.sql(cand);ok('candidate re-installs after full restore')
pg.sql((D/'postflight.sql').read_text());ok('composed postflight READ ONLY passes')
exec(compile(fixtures,str(H/'test-local.py'),'exec'))
SETB=U(10)
pg.sql(f"""SET session_replication_role=replica;
INSERT INTO public.company_fiscal_settings(id,organization_id,is_active,configuration_status,accounting_validated_at,legal_name,cnpj,state,fiscal_environment) VALUES
 ('{SETTINGS}','{A}',true,'DRAFT',NULL,'Synthetic issuer A (DRAFT)','00000000000000','MG','NOT_CONFIGURED'),
 ('{SETB}','{B}',true,'VALIDATED',now(),'FIXTURE SINTETICA MG B - SEM VALIDADE JURIDICA','11111111111111','MG','HOMOLOGATION');
SET session_replication_role=origin;""")
items=json.dumps([{'item_tipo':'produto','item_id':PROD,'quantidade':1,'unidade_medida':'unidade','volume_ml':1000}])
def sim(u,p,plan=PLAN):return json.loads(val(u,f"SELECT public.simulate_b2b_payment_plan_secure('{p}','{plan}','{items}',NULL);"))
def create(p,key,h,obs='Synthetic',plan=PLAN,it=None):return f"SELECT public.create_partner_order_secure('{p}','{obs}','{it or items}',NULL,'{plan}',NULL,NULL,'{h}','{key}')"
def jwt(u):return json.dumps({'sub':u,'role':'authenticated','iat':int(time.time())})
def denied(u,sql,needle):
    before=snapshot();err=pg.sql(f"\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{jwt(u)}',true); {sql}; COMMIT;",ok=False)
    assert needle in err,err[-1500:];assert snapshot()==before,'denial had effects'
def counts():return pg.sql("SELECT (SELECT count(*) FROM public.accounts_receivable)||'/'||(SELECT count(*) FROM public.accounts_receivable_installments)||'/'||(SELECT count(*) FROM public.partner_order_financial_links)||'/'||(SELECT count(*) FROM public.fiscal_invoices)")
order=lambda i:json.loads(pg.sql(f"SELECT to_jsonb(o) FROM public.partner_orders o WHERE id='{i}'"))
c0=counts()
hA=sim(G,P)['cart_hash']
r1=json.loads(val(G,create(P,'pend-1',hA)+';'));o=order(r1['id']);sn=o['c2_external_origin_snapshot']
ok('external manager A creates canonical request while A accounting is DRAFT',sn['contract']=='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' and sn['issuer_state']=='DRAFT' and sn['accounting_validated'] is False)
ok('pending snapshot carries no issuer identity/attestation',not any(k in sn for k in ('issuer_cnpj','issuer_legal_name','issuer_organization_id')) and sn['organization_id']==A and sn['actor_user_id']==G)
ok('client derived server-side from partner; not production-ready',o['cliente_id']==CLI and o['ready_for_production'] is False and o['status'] in ('em_analise_comercial','aguardando_cotacao','aguardando_aprovacao_credito'))
ok('create generated no title/installment/link/NF: '+counts(),counts()==c0)
before=snapshot();r2=json.loads(val(G,create(P,'pend-1',hA)+';'));ok('idempotent replay same order, no writes',r2['id']==r1['id'] and snapshot()==before)
denied(G,create(P,'pend-1',hA,obs='changed'),'idempotency_conflict');ok('same key different payload conflicts')
notif=pg.sql(f"SELECT coalesce(string_agg(DISTINCT p.organization_id::text,','),'') FROM public.notificacoes_operacionais n JOIN public.profiles p ON p.user_id=n.usuario_id WHERE n.source_id='{r1['id']}' OR n.link LIKE '%{r1['id']}%'")
ok('notifications (if any) only to owner A users: '+repr(notif),notif in ('',A))
denied(ADMIN,f"SELECT public.approve_partner_order('{r1['id']}',NULL,NULL)",'C2_ACCOUNTING_PENDING');ok('approval denied while accounting pending, no effects')
denied(ADMIN,f"SELECT public.generate_b2b_receivable_secure('{r1['id']}')",'C2_ACCOUNTING_PENDING');ok('billing denied while accounting pending, no effects')
for st in ['aprovado','em_producao','entregue','faturado']:
    before=snapshot();err=pg.sql(f"BEGIN; SELECT set_config('request.jwt.claims','{jwt(ADMIN)}',true); UPDATE public.partner_orders SET status='{st}' WHERE id='{r1['id']}'; COMMIT;",ok=False);assert 'ERROR' in err and snapshot()==before,err[-600:]
ok('direct privileged status jumps (approve/production/delivery/invoiced) denied by server guards')
before=snapshot();err=pg.sql(f"BEGIN; SELECT set_config('request.jwt.claims','{jwt(ADMIN)}',true); UPDATE public.partner_orders SET c2_external_origin_snapshot=c2_external_origin_snapshot||'{{\"accounting_validated\":true}}' WHERE id='{r1['id']}'; COMMIT;",ok=False)
ok('pending snapshot cannot be self-promoted by direct write',('B2B_INTERNAL_SNAPSHOT_IMMUTABLE' in err) and snapshot()==before)
# Adversarial targets
hQ=sim(GB,Q)['cart_hash']
denied(G,create(Q,'x-q',hQ),'42501');ok('A manager cannot order for B partner')
denied(GB,create(P,'x-p',hA),'42501');ok('B manager cannot order for A partner')
denied(T,create(P,'x-t',hA),'forbidden_financial_terms');ok('isolated technician cannot order')
PLAN2=U(30);pg.sql(f"SET session_replication_role=replica; INSERT INTO public.commercial_payment_plans(id,name,code,plan_type,active,installment_count,discount_percent,monthly_interest_percent,months_count,interest_type,max_days) VALUES('{PLAN2}','B only','B2','custom',true,1,0,0,0,'none',7); INSERT INTO public.commercial_payment_plan_assignments(plan_id,buyer_scope,partner_id,status,valid_from) VALUES('{PLAN2}','partner','{Q}','published',current_date-1); SET session_replication_role=origin;")
denied(G,create(P,'x-plan',hA,plan=PLAN2),'ERROR');ok('plan assigned only to B partner rejected for A partner')
PRODX=U(31);pg.sql(f"SET session_replication_role=replica; INSERT INTO public.produtos(id,nome,tipo,codigo,ativo,b2b_enabled,valor_litro_brl,created_at,updated_at) VALUES('{PRODX}','Not B2B','inseticida','NB',true,false,10,now(),now()); SET session_replication_role=origin;")
itx=json.dumps([{'item_tipo':'produto','item_id':PRODX,'quantidade':1,'unidade_medida':'unidade','volume_ml':1000}])
denied(G,create(P,'x-item',hA,it=itx),'ERROR');ok('non-B2B item rejected')
# Positive B: validated synthetic MG issuer keeps the reviewed V1 path end-to-end
rb=json.loads(val(GB,create(Q,'b-1',hQ)+';'));ob=order(rb['id'])
ok('B (synthetic validated MG fixture) creates V1 origin with issuer identity',ob['c2_external_origin_snapshot']['contract']=='C2_EXTERNAL_ORDER_ORIGIN_V1' and ob['c2_external_origin_snapshot']['issuer_cnpj']=='11111111111111')
denied(ADMIN,f"SELECT public.approve_partner_order('{rb['id']}',NULL,NULL)",'42501');ok('A admin cannot approve B order')
actor(ADMIN_B,f"SELECT public.approve_partner_order('{rb['id']}',NULL,NULL);")
nb=pg.sql(f"SELECT (SELECT count(*) FROM public.partner_order_financial_links l WHERE l.partner_order_id='{rb['id']}')||'/'||(SELECT count(*) FROM public.accounts_receivable_installments i JOIN public.partner_order_financial_links l ON l.receivable_id=i.receivable_id WHERE l.partner_order_id='{rb['id']}')||'/'||(SELECT count(*) FROM public.fiscal_invoices)")
ok('validated B fixture: approval generates exactly one title link + 3 installments, no NF: '+nb,nb=='1/3/0')
# ---- Single credit lock domain (review 8cad/38): two real connections, create vs approve ----
import subprocess as _sp
def _tx(u,sql,name,hold=False):
    c=json.dumps({'sub':u,'role':'authenticated','iat':int(time.time())})
    return (f"SET application_name='{name}';\nBEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{c}',true);\n{sql};\n"
            +("SELECT 'CONCURRENT_HOLD'; SELECT pg_sleep(4);\n" if hold else '')+"COMMIT;\n")
def _bg(u,sql,name,hold=False):
    p=_sp.Popen(pg.psql(),stdin=_sp.PIPE,stdout=_sp.PIPE,stderr=_sp.PIPE,text=True);p.stdin.write(_tx(u,sql,name,hold));p.stdin.close()
    if hold:
        while True:
            l=p.stdout.readline()
            if 'CONCURRENT_HOLD' in l:break
            if not l:raise AssertionError(p.stderr.read())
    return p
def _done(p):
    out=p.stdout.read();err=p.stderr.read();p.wait(timeout=20);return p.returncode,out,err
def _waits(name,want=True):
    for _ in range(40):
        if pg.sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{name}' AND wait_event_type='Lock' AND wait_event='advisory'")=='1':return True
        time.sleep(.05)
    return False
apdef=pg.sql("SELECT pg_get_functiondef('public.approve_partner_order(uuid,text,date)'::regprocedure)")
crdef=pg.sql("SELECT pg_get_functiondef('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'::regprocedure)")
K="hashtextextended('b2b_credit:' || "
ok('approve, create and credit trigger share one credit advisory key expression',K+"v_pid::text, 0)" in apdef and "hashtext('b2b_credit:" not in apdef and K+"p_partner_id::text, 0)" in crdef)
ok('production-observed divergence reproduced for old expression (int4 vs int8 keys differ)',pg.sql(f"SELECT (hashtext('b2b_credit:'||'{Q}')::bigint<>hashtextextended('b2b_credit:'||'{Q}',0))::text")=='true')
# (1) approve first (holds row + canonical credit lock) -> concurrent create for same partner waits on advisory
oq=json.loads(val(GB,create(Q,'lk-target',hQ)+';'))['id']
st0=pg.sql(f"SELECT status FROM public.partner_orders WHERE id='{oq}'")
pa=_bg(ADMIN_B,f"SELECT public.approve_partner_order('{oq}',NULL,NULL)",'lk_approve',hold=True)
pc=_bg(GB,create(Q,'lk-create-during-approve',hQ),'lk_create')
ok(f'create for same partner waits on approve credit lock (status before {st0})',_waits('lk_create') and pc.poll() is None)
# B isolation: A partner create is not blocked by B's held credit lock
t0=time.time();ra=json.loads(val(G,create(P,'lk-a-free',hA)+';'));dt=time.time()-t0
ok(f'other company A create not blocked by B credit lock ({dt:.2f}s)',dt<2.0 and ra['id'])
ca=_done(pa);cc=_done(pc)
ok('both complete after serialization; no deadlock',ca[0]==0 and cc[0]==0 and '40P01' not in ca[2]+cc[2])
ok('approved order exactly one title link, new create no title',pg.sql(f"SELECT count(*) FROM public.partner_order_financial_links WHERE partner_order_id='{oq}'")=='1' and pg.sql("SELECT count(*) FROM public.partner_order_financial_links l JOIN public.partner_order_idempotency i ON i.order_id=l.partner_order_id WHERE i.idempotency_key='lk-create-during-approve'")=='0')
# (2) create first (holds canonical credit lock) -> approve waits BEFORE evaluating exposure
oq2=json.loads(val(GB,create(Q,'lk-target-2',hQ)+';'))['id']
pc2=_bg(GB,create(Q,'lk-create-first',hQ),'lk_create2',hold=True)
pa2=_bg(ADMIN_B,f"SELECT public.approve_partner_order('{oq2}',NULL,NULL)",'lk_approve2')
ok('approve waits on create credit lock (same key) before exposure decision',_waits('lk_approve2') and pa2.poll() is None)
r1_,r2_=_done(pc2),_done(pa2)
ok('create-first then approve both commit, no deadlock',r1_[0]==0 and r2_[0]==0 and '40P01' not in r1_[2]+r2_[2])
# (3) holding the OLD int4 key no longer blocks approve (domain moved) while holding the canonical key does
oq3=json.loads(val(GB,create(Q,'lk-target-3',hQ)+';'))['id']
h=_sp.Popen(pg.psql(),stdin=_sp.PIPE,stdout=_sp.PIPE,stderr=_sp.PIPE,text=True);h.stdin.write(f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('b2b_credit:'||'{Q}',0)); SELECT 'CONCURRENT_HOLD'; SELECT pg_sleep(3); COMMIT;\n");h.stdin.close()
while 'CONCURRENT_HOLD' not in h.stdout.readline():pass
before=snapshot();e=pg.sql(f"BEGIN; SET LOCAL lock_timeout='800ms'; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{jwt(ADMIN_B)}',true); SELECT public.approve_partner_order('{oq3}',NULL,NULL); COMMIT;",ok=False)
ok('approve blocked by canonical create key; lock timeout aborts atomically with no effects','lock timeout' in e and snapshot()==before)
_done(h)
# (4) revocation while waiting: authority re-validated after the lock
h=_sp.Popen(pg.psql(),stdin=_sp.PIPE,stdout=_sp.PIPE,stderr=_sp.PIPE,text=True);h.stdin.write(f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('b2b_credit:'||'{Q}',0)); SELECT 'CONCURRENT_HOLD'; SELECT pg_sleep(2); COMMIT;\n");h.stdin.close()
while 'CONCURRENT_HOLD' not in h.stdout.readline():pass
before=snapshot();pr_=_bg(ADMIN_B,f"SELECT public.approve_partner_order('{oq3}',NULL,NULL)",'lk_revoked')
ok('approve waiting on credit lock',_waits('lk_revoked'))
pg.sql(f"SET session_replication_role=replica; DELETE FROM public.user_roles WHERE user_id='{ADMIN_B}' AND role='administrador'; SET session_replication_role=origin;")
_done(h);rc,out,err=_done(pr_)
ok('revoked during wait: approve denied after lock (forbidden), no effects',rc!=0 and 'forbidden' in err and snapshot()==before and pg.sql(f"SELECT status FROM public.partner_orders WHERE id='{oq3}'")!='aprovado')
pg.sql(f"SET session_replication_role=replica; INSERT INTO public.user_roles(user_id,role) VALUES('{ADMIN_B}','administrador'); SET session_replication_role=origin;")
actor(ADMIN_B,f"SELECT public.approve_partner_order('{oq3}',NULL,NULL);")
ok('control: restored authority approves same order once',pg.sql(f"SELECT count(*) FROM public.partner_order_financial_links WHERE partner_order_id='{oq3}'")=='1')
c0=counts()
# Promotion: explicit, audited, owner-only, CAS, only after real (here: fixture) validation
upd=pg.sql(f"SELECT updated_at FROM public.partner_orders WHERE id='{r1['id']}'")
denied(ADMIN_B,f"SELECT public.c2_promote_accounting_pending_order_v1('{r1['id']}','{upd}')",'C2AP_ORDER_DENIED');ok('foreign owner B cannot promote A request (no oracle)')
denied(G,f"SELECT public.c2_promote_accounting_pending_order_v1('{r1['id']}','{upd}')",'C2AP_ORDER_DENIED');ok('buyer cannot promote own request')
denied(ADMIN,f"SELECT public.c2_promote_accounting_pending_order_v1('{r1['id']}','{upd}')",'C2_ACCOUNTING_PENDING');ok('owner A promotion denied while A still DRAFT')
pg.sql(f"SET session_replication_role=replica; UPDATE public.company_fiscal_settings SET configuration_status='VALIDATED',accounting_validated_at=now(),legal_name='FIXTURE SINTETICA MG A - SEM VALIDADE JURIDICA',fiscal_environment='HOMOLOGATION' WHERE id='{SETTINGS}'; SET session_replication_role=origin;")
# Two connections: A holds the row lock on its own pending order; B's promotion must be denied immediately
# (foreign row never locked/waited on), while another A promotion attempt would wait (lock_timeout proves it).
hold=pg.popen(None);hold.stdin.write(f"BEGIN; SELECT id FROM public.partner_orders WHERE id='{r1['id']}' FOR UPDATE; SELECT pg_sleep(6); COMMIT;\n");hold.stdin.flush();time.sleep(1.5)
t0=time.time();eb=pg.sql(f"BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{jwt(ADMIN_B)}',true); SELECT public.c2_promote_accounting_pending_order_v1('{r1['id']}','{upd}'); COMMIT;",ok=False);dt=time.time()-t0
ok(f'B promotion on A-locked order denied without waiting ({dt:.2f}s, no lock_timeout)','C2AP_ORDER_DENIED' in eb and 'lock timeout' not in eb and dt<2.0)
ea=pg.sql(f"BEGIN; SET LOCAL lock_timeout='1s'; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{jwt(ADMIN)}',true); SELECT public.c2_promote_accounting_pending_order_v1('{r1['id']}','{upd}'); COMMIT;",ok=False)
ok('control: owner A promotion does wait on its own locked row (lock timeout), proving the lock is real','lock timeout' in ea)
hold.stdin.close();hold.wait(15)
ok('wrapper is SECURITY INVOKER and core SECURITY DEFINER',pg.sql("SELECT (SELECT prosecdef FROM pg_proc WHERE oid='public.c2_promote_accounting_pending_order_v1(uuid,timestamptz)'::regprocedure)::text||(SELECT prosecdef FROM pg_proc WHERE oid='platform_private.c2_promote_accounting_pending_order_core(uuid,timestamptz)'::regprocedure)::text")=='falsetrue')
denied(ADMIN,f"SELECT public.c2_promote_accounting_pending_order_v1('{r1['id']}','2000-01-01T00:00:00Z')",'C2AP_STALE');ok('stale expected updated_at rejected (CAS)')
pr=json.loads(val(ADMIN,f"SELECT public.c2_promote_accounting_pending_order_v1('{r1['id']}','{upd}');"));sn2=order(r1['id'])['c2_external_origin_snapshot']
ok('promotion after fixture validation seals V1 from current settings, original actor kept',sn2['contract']=='C2_EXTERNAL_ORDER_ORIGIN_V1' and sn2['promoted_from_contract']=='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' and sn2['actor_user_id']==G and sn2['accounting_promoted_by']==ADMIN)
ok('promotion audited with previous and new origin',pg.sql(f"SELECT count(*) FROM public.partner_order_audit_logs WHERE order_id='{r1['id']}' AND acao='c2_accounting_pending_promoted' AND dados_anteriores->'origin'->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1'")=='1')
upd2=pg.sql(f"SELECT updated_at FROM public.partner_orders WHERE id='{r1['id']}'")
denied(ADMIN,f"SELECT public.c2_promote_accounting_pending_order_v1('{r1['id']}','{upd2}')",'C2AP_NOT_PENDING');ok('second promotion rejected explicitly')
ok('promotion created no title/installment/link/NF',counts()==c0)
pg.sql(f"SET session_replication_role=replica; UPDATE public.company_fiscal_settings SET configuration_status='DRAFT',accounting_validated_at=NULL WHERE id='{SETTINGS}'; SET session_replication_role=origin;")
# Revocation
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=now(),revoked_by='{ADMIN}',revoke_reason='Synthetic revocation' WHERE user_id='{G}'; SET session_replication_role=origin;")
denied(G,create(P,'after-revoke',hA),'42501');ok('revoked manager cannot create')
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=NULL,revoked_by=NULL,revoke_reason=NULL WHERE user_id='{G}'; SET session_replication_role=origin;")
r3=json.loads(val(G,create(P,'pend-2',sim(G,P)['cart_hash'])+';'))
ok('restored link creates again as pending (A DRAFT again)',order(r3['id'])['c2_external_origin_snapshot']['contract']=='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1')
# --- 30dc8243 commercial entry preserved on top of the composed candidate (A DRAFT again here) ---
capA=json.loads(val(ADMIN,"SELECT public.c2_internal_order_entry_capability_v1();"))
ok('internal A capability still fail-closed issuer_not_validated (A DRAFT)',capA['order_create'] is False and capA['reason']=='issuer_not_validated')
denied(ADMIN,f"SELECT public.simulate_b2b_payment_plan_secure('{Q}','{PLAN}','{items}',NULL)",'C2_INTERNAL_TARGET_DENIED:target_outside_portfolio');ok('internal A -> foreign B partner still C2_INTERNAL_TARGET_DENIED (30dc branch reached)')
hI=json.loads(val(ADMIN,f"SELECT public.simulate_b2b_payment_plan_secure('{P}','{PLAN}','{items}',NULL);"))['cart_hash']
denied(ADMIN,create(P,'int-a-draft',hI),'B2B_INTERNAL_ISSUER_NOT_VALIDATED');ok('internal A create with DRAFT issuer still denied; no pending path for internal actors')
# --- insufficient credit: honest pending request, no credit decision, no hidden transition ---
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=100,credit_limit_action='approval_required' WHERE partner_id='{P}'; SET session_replication_role=origin;")
c1=counts();rc=json.loads(val(G,create(P,'pend-credit',sim(G,P)['cart_hash'])+';'));oc=order(rc['id'])
ok('insufficient credit: request lands aguardando_aprovacao_credito as PENDING_ACCOUNTING, nothing approved',oc['status']=='aguardando_aprovacao_credito' and oc['c2_external_origin_snapshot']['contract']=='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' and oc['credit_approved_at'] is None and oc['approved_at'] is None and oc['ready_for_production'] is False)
ok('insufficient-credit create generated no title/installment/link/NF',counts()==c1)
denied(ADMIN,f"SELECT public.approve_partner_order('{rc['id']}',NULL,NULL)",'C2_ACCOUNTING_PENDING');ok('owner approval of credit-pending request denied C2_ACCOUNTING_PENDING')
for col,v in [('credit_approved_at','now()'),('status',"'em_analise_comercial'"),('status',"'aprovado'")]:
    before=snapshot();ob0=order(rc['id']);r=subprocess.run(['true']);out=pg.sql(f"\\set ON_ERROR_STOP 0\nBEGIN; SELECT set_config('request.jwt.claims','{jwt(ADMIN)}',true); UPDATE public.partner_orders SET {col}={v} WHERE id='{rc['id']}'; COMMIT;")
    ob1=order(rc['id']);print('PENDING_UPDATE',col,v,'->', sorted(k for k in ob0 if ob0[k]!=ob1[k]))
    # LIVE credit guard silently keeps the status (only updated_at may move); no decision/title/approval can result.
    assert ob1['status']=='aguardando_aprovacao_credito' and ob1['credit_approved_at'] is None and ob1['approved_at'] is None and counts()==c1 and all(ob0[k]==ob1[k] for k in ob0 if k!='updated_at'),(col,v)
ok('no hidden credit decision or status hop out of aguardando_aprovacao_credito while pending')
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=0 WHERE partner_id='{P}'; SET session_replication_role=origin;")
# --- no existence oracle for foreign / missing orders before authorization ---
MISSING=U(999)
for fn in ["approve_partner_order('{i}',NULL,NULL)","generate_b2b_receivable_secure('{i}')"]:
    ef=pg.sql(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{jwt(ADMIN_B)}',true); SELECT public.{fn.format(i=r3['id'])}; COMMIT;",ok=False)
    em=pg.sql(f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{jwt(ADMIN_B)}',true); SELECT public.{fn.format(i=MISSING)}; COMMIT;",ok=False)
    msg=lambda e:e.split('ERROR:')[1].splitlines()[0].strip()
    assert 'C2_ACCOUNTING_PENDING' not in ef and 'B2B_INTERNAL_DOWNSTREAM' not in ef and msg(ef)==msg(em),(ef[-400:],em[-400:])
ok('B admin: approve/generate on foreign pending A order give the same denial as a missing order (no accounting reason leaked)')
# --- concurrency: same idempotency key from two backends -> one order ---
from concurrent.futures import ThreadPoolExecutor
hc=sim(G,P)['cart_hash'];n0=pg.sql("SELECT count(*) FROM public.partner_orders")
with ThreadPoolExecutor(2) as ex:res=list(ex.map(lambda _:json.loads(val(G,create(P,'conc-1',hc)+';'))['id'],range(2)))
ok('two concurrent creates with same key return one pending order',res[0]==res[1] and int(pg.sql("SELECT count(*) FROM public.partner_orders"))==int(n0)+1 and order(res[0])['c2_external_origin_snapshot']['contract']=='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1')
# revocation after pending creation: revoked manager cannot read via create replay either
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=now(),revoked_by='{ADMIN}',revoke_reason='Synthetic revocation 2' WHERE user_id='{G}'; SET session_replication_role=origin;")
denied(G,create(P,'conc-1',hc),'42501');ok('revoked manager replay of existing key denied (no idempotent leak after revocation)')
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=NULL,revoked_by=NULL,revoke_reason=NULL WHERE user_id='{G}'; SET session_replication_role=origin;")
err=pg.sql((D/'restore-live.sql.review').read_text(),ok=False)
ok('restore-live refuses with pending/external history (C2AP_FULL_RESTORE_BLOCKED_HISTORY), no DDL, rows kept','C2AP_FULL_RESTORE_BLOCKED_HISTORY' in err and all(md5(k)==v for k,v in E['candidate'].items()) and pg.sql("SELECT count(*)>0 FROM public.partner_orders WHERE c2_external_origin_snapshot IS NOT NULL")=='t')
# Rollback
bad=inj((D/'rollback.sql.review').read_text(),'C2AP_INJECTED_RB')
assert 'C2AP_INJECTED_RB' in pg.sql(bad,ok=False);ok('rollback failing POST preserves candidate',md5('platform_private.b2b_internal_order_snapshot_guard()')==E['candidate']['platform_private.b2b_internal_order_snapshot_guard()'])
pg.sql((D/'rollback.sql.review').read_text())
ok('rollback restores exact b5 bodies and LIVE writer false',all(md5(k)==v for k,v in E['b5_hashes'].items()))
ok('history kept: pending and promoted orders remain',pg.sql(f"SELECT count(*) FROM public.partner_orders WHERE id IN ('{r1['id']}','{r3['id']}')")=='2')
before=snapshot();err=pg.sql(f"BEGIN; SELECT set_config('request.jwt.claims','{jwt(ADMIN)}',true); UPDATE public.partner_orders SET observacoes='x' WHERE id='{r3['id']}'; COMMIT;",ok=False)
ok('after rollback pending request is frozen (b5 assert rejects pending contract)','C2_EXTERNAL_ORIGIN_DENIED' in err and snapshot()==before)
denied(G,create(P,'after-rb',hA),'42501');ok('after rollback external create closed again')
# Full restore must refuse while history exists (after rollback pending rows remain).
err=pg.sql((D/'restore-live.sql.review').read_text().replace(E['candidate']['platform_private.b2b_internal_order_snapshot_guard()'],'__skip__'),ok=False)
ok('restore-live refuses to run on non-candidate state (drift) — no partial DDL',('C2AP_RESTORE_PRE_DRIFT' in err or 'C2AP_30DC' in err) and md5('platform_private.b2b_internal_order_snapshot_guard()')==E['b5_hashes']['platform_private.b2b_internal_order_snapshot_guard()'])
print('TOTAL',len(checks),'PASS; synthetic Auth, disposable PostgreSQL, no hosted JWT/RLS/accounting certification')
