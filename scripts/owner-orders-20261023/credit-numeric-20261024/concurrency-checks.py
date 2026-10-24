"""Two independent psql sessions; captured RPCs, synthetic Auth, local only."""
import select

def transaction(u, sql, name, hold=False):
    claims=json.dumps({'sub':u,'role':'authenticated','iat':int(time.time())})
    return (f"BEGIN; SET LOCAL statement_timeout='12s'; SET LOCAL lock_timeout='8s'; "
            f"SET LOCAL application_name='{name}'; SET LOCAL ROLE authenticated; "
            f"SELECT set_config('request.jwt.claims','{claims}',true); {sql}; "
            + ("SELECT 'CONCURRENT_HOLD'; SELECT pg_sleep(2); " if hold else '') + "COMMIT;")

def pair(u, sql1, sql2, second_error=None):
    """First RPC completed but uncommitted; prove second backend waits on its lock."""
    p1=subprocess.Popen(pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
    p1.stdin.write(transaction(u,sql1,'c2_concurrent_first',True).encode());p1.stdin.close()
    lines=[];deadline=time.monotonic()+15
    while time.monotonic()<deadline:
        ready,_,_=select.select([p1.stdout],[],[],1)
        if ready:
            line=p1.stdout.readline().decode();lines.append(line)
            if 'CONCURRENT_HOLD' in line:break
            if not line:raise AssertionError(p1.stderr.read())
    else:raise AssertionError('first session never reached uncommitted hold')
    p2=pg.popen('');p2.stdin.write(transaction(u,sql2,'c2_concurrent_second'));p2.stdin.close()
    waited=False
    for _ in range(20):
        if pg.sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='c2_concurrent_second' AND wait_event_type='Lock'")=='1':
            waited=True;break
        time.sleep(.03)
    tail=p1.stdout.read().decode();error1=p1.stderr.read().decode();p1.wait(timeout=15)
    out2=p2.stdout.read();error2=p2.stderr.read();p2.wait(timeout=15)
    assert waited,'no proven lock overlap between distinct backends'
    assert p1.returncode==0,error1
    if second_error is None:assert p2.returncode==0,error2
    else:assert p2.returncode!=0 and second_error in error2,error2
    return ''.join(lines)+tail,out2

def result(out):
    return next(json.loads(line) for line in out.splitlines() if line.startswith('{') and '"id"' in line)

# No production configuration changed: existing synthetic validated issuer fixture only.
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=0,billing_trigger='na_entrega',auto_generate_receivable=true WHERE partner_id='{P}'; SET session_replication_role=origin;")
key='concurrent-same-key';call=create(G,key)
count=int(pg.sql('SELECT count(*) FROM public.partner_orders'))
o1,o2=pair(G,call,call);r1=result(o1);r2=result(o2);concurrent_id=r1['id']
ok('two sessions same key exactly one order and identical receipt',r1==r2 and int(pg.sql('SELECT count(*) FROM public.partner_orders'))==count+1 and pg.sql(f"SELECT count(*) FROM public.partner_order_idempotency WHERE partner_id='{P}' AND idempotency_key='{key}'")=='1')
ok('concurrent create canonical children exactly one set',pg.sql(f"SELECT count(*) FROM public.partner_order_items WHERE order_id='{concurrent_id}'")=='1' and pg.sql(f"SELECT count(*) FROM public.partner_order_payment_terms WHERE partner_order_id='{concurrent_id}'")=='1' and pg.sql(f"SELECT count(*) FROM public.partner_order_payment_schedule WHERE partner_order_id='{concurrent_id}'")=='3')
call=create(G,'concurrent-conflict');count=int(pg.sql('SELECT count(*) FROM public.partner_orders'))
pair(G,call,create(G,'concurrent-conflict',obs='Changed'), 'idempotency_conflict')
ok('two sessions changed fingerprint conflict one order',int(pg.sql('SELECT count(*) FROM public.partner_orders'))==count+1)
approve=f"SELECT public.approve_partner_order('{concurrent_id}',NULL,NULL)"
generate=f"SELECT public.generate_b2b_receivable_secure('{concurrent_id}')"
pair(ADMIN,approve,approve,'already_processed')
ok('two approvals na_entrega one transition no title',pg.sql(f"SELECT status||'|'||receivable_generated||'|'||ready_for_production FROM public.partner_orders WHERE id='{concurrent_id}'")=='aprovado|false|false' and pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{concurrent_id}'")=='0')
next_id=json.loads(val(G,create(G,'concurrent-approve-generate')+';'))['id']
pair(ADMIN,f"SELECT public.approve_partner_order('{next_id}',NULL,NULL)",f"SELECT public.generate_b2b_receivable_secure('{next_id}')",'C2_EXTERNAL_DELIVERY_REQUIRED')
ok('approval versus generation na_entrega no premature title or link',pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{next_id}'")=='0' and pg.sql(f"SELECT count(*) FROM public.partner_order_financial_links WHERE partner_order_id='{next_id}'")=='0')
# Hold the existing canonical advisory lock only to ensure both generators overlap.
locker=pg.popen('');locker.stdin.write(f"BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('b2b_receivable:{next_id}',0)); SELECT 'LOCK_READY'; SELECT pg_sleep(2); COMMIT;");locker.stdin.close()
while 'LOCK_READY' not in locker.stdout.readline():
    if locker.poll() is not None:raise AssertionError('lock holder exited')
before=snapshot();workers=[]
for n in range(2):
    p=pg.popen('');p.stdin.write(transaction(ADMIN,f"SELECT public.generate_b2b_receivable_secure('{next_id}')",f'c2_generate_{n}'));p.stdin.close();workers.append(p)
for _ in range(20):
    if pg.sql("SELECT count(*) FROM pg_stat_activity WHERE application_name IN ('c2_generate_0','c2_generate_1') AND wait_event_type='Lock'")=='2':break
    time.sleep(.03)
else:raise AssertionError('two generators did not overlap')
locker.stdout.read();locker.stderr.read();locker.wait(timeout=15)
for p in workers:
    p.stdout.read();err=p.stderr.read();p.wait(timeout=15)
    assert p.returncode!=0 and 'C2_EXTERNAL_DELIVERY_REQUIRED' in err,err
ok('two generators pre-delivery both denied all effects',snapshot()==before)
# Separate na_aprovacao scenario already supported by captured chain, never substitute for delivery.
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET billing_trigger='na_aprovacao' WHERE partner_id='{P}'; SET session_replication_role=origin;")
bill_id=json.loads(val(G,create(G,'concurrent-supported-billing')+';'))['id']
pair(ADMIN,f"SELECT public.approve_partner_order('{bill_id}',NULL,NULL)",f"SELECT public.generate_b2b_receivable_secure('{bill_id}')")
ok('supported na_aprovacao approval versus generation exactly one title three installments',pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{bill_id}'")=='1' and pg.sql(f"SELECT count(*) FROM public.accounts_receivable_installments WHERE receivable_id IN (SELECT id FROM public.accounts_receivable WHERE origin_id='{bill_id}')")=='3' and pg.sql(f"SELECT count(*) FROM public.partner_order_financial_links WHERE partner_order_id='{bill_id}'")=='1')
before=snapshot();audit_count=int(pg.sql(f"SELECT count(*) FROM public.partner_order_audit_logs WHERE order_id='{bill_id}' AND acao='financeiro_duplicidade_bloqueada'"))
pair(ADMIN,f"SELECT public.generate_b2b_receivable_secure('{bill_id}')",f"SELECT public.generate_b2b_receivable_secure('{bill_id}')")
after=snapshot()
ok('two concurrent billing replays no financial duplication only canonical audit',all(after[t]==v for t,v in before.items() if t!='partner_order_audit_logs') and int(pg.sql(f"SELECT count(*) FROM public.partner_order_audit_logs WHERE order_id='{bill_id}' AND acao='financeiro_duplicidade_bloqueada'"))==audit_count+2)
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET billing_trigger='na_entrega' WHERE partner_id='{P}'; SET session_replication_role=origin;")
# Fresh negative calls, not merely RLS reads.
for u,p in [(ADMIN_B,P),(GB,P),(ADMIN,Q),(G,Q)]:
    before=snapshot();actor(u,create(G,'cross-write-'+u,p,h=hashA)+';',err='')
    ok('cross tenant create write denied '+u,snapshot()==before)
for u in [ADMIN_B,GB,T,PR]:
    for sql in [f"SELECT public.approve_partner_order('{next_id}',NULL,NULL)",f"SELECT public.generate_b2b_receivable_secure('{bill_id}')"]:
        before=snapshot();actor(u,sql+';',err='');ok('foreign or nonfinancial mutation denied '+u,snapshot()==before)
# Independent removal of each external role; no internal role ever granted.
pg.sql(f"SET session_replication_role=replica; DELETE FROM public.user_roles WHERE user_id='{GT}' AND role='parceiro_b2b_tecnico'; SET session_replication_role=origin;")
res=json.loads(val(GT,create(GT,'partial-tech-removed')+';'))
ok('partial technical revocation retains manager create',pg.sql(f"SELECT count(*) FROM public.partner_orders WHERE id='{res['id']}'")=='1')
pg.sql(f"SET session_replication_role=replica; INSERT INTO public.user_roles(user_id,role) VALUES('{GT}','parceiro_b2b_tecnico'); DELETE FROM public.user_roles WHERE user_id='{GT}' AND role='parceiro_b2b'; SET session_replication_role=origin;")
before=snapshot();actor(GT,create(G,'partial-manager-removed',h=hashA)+';',err='')
ok('partial manager revocation technical residual cannot create',snapshot()==before and pg.sql(f"SELECT count(*) FROM public.user_roles WHERE user_id='{GT}' AND role='parceiro_b2b_tecnico'")=='1')
before=snapshot();actor(GT,create(G,'partial-tech-removed',h=hashA)+';',err='')
ok('revoked manager cannot replay own earlier receipt',snapshot()==before)
pg.sql(f"SET session_replication_role=replica; INSERT INTO public.user_roles(user_id,role) VALUES('{GT}','parceiro_b2b'); UPDATE public.partner_users SET revoked_at=now(),revoked_by='{ADMIN}',revoke_reason='Synthetic concurrency revocation' WHERE user_id='{GT}'; SET session_replication_role=origin;")
before=snapshot();actor(GT,create(G,'partial-link-revoked',h=hashA)+';',err='')
ok('revoked partner link denies cumulative writer all effects',snapshot()==before)
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=NULL,revoked_by=NULL,revoke_reason=NULL WHERE user_id='{GT}'; SET session_replication_role=origin;")
ok('concurrency preserves credit LIVE body',pg.sql("SELECT md5(pg_get_functiondef('public.fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure))")=='213ac31f3a30816ead75365b0d1fed18')