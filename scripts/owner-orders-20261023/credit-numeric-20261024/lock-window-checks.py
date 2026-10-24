"""Deterministic intermediate windows; captured bodies, synthetic Auth, disposable PostgreSQL only."""
def spawn(u,sql,name):
    p=pg.popen('');p.stdin.write(transaction(u,sql,name));p.stdin.close();return p
def wait_lock(name,event=None):
    q=f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{name}' AND wait_event_type='Lock'"+(f" AND wait_event='{event}'" if event else '')
    for _ in range(100):
        if pg.sql(q)=='1':return True
        time.sleep(.03)
    return False
def done(p):
    out=p.stdout.read();err=p.stderr.read();p.wait(timeout=20);return p.returncode,out,err
def barrier(key):
    b=pg.popen('');b.stdin.write(f"BEGIN; SELECT pg_advisory_xact_lock({key}); SELECT 'BARRIER_READY'; SELECT pg_sleep(30); COMMIT;");b.stdin.close()
    while 'BARRIER_READY' not in b.stdout.readline():
        if b.poll() is not None:raise AssertionError(b.stderr.read())
    pid=pg.sql("SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted AND ((classid::bigint<<32)|objid::bigint)=("+str(key)+")::bigint LIMIT 1")
    return b,pid
def release(b,pid):
    pg.sql(f"SELECT pg_cancel_backend({pid})");b.stdout.read();b.stderr.read();b.wait(timeout=20)
def window(oid):
    """Approve owns row, then waits at its explicit hashtext credit barrier; generator then owns receipt and waits row."""
    key=pg.sql(f"SELECT hashtext('b2b_credit:'||'{P}')")
    b,pid=barrier(key)
    a=spawn(ADMIN,f"SELECT public.approve_partner_order('{oid}',NULL,NULL)",'c2_window_approve')
    assert wait_lock('c2_window_approve','advisory'),'approve did not reach credit barrier'
    assert pg.sql(f"SELECT count(*) FROM pg_locks l JOIN pg_stat_activity s USING(pid) WHERE s.application_name='c2_window_approve' AND l.locktype='tuple' OR (s.application_name='c2_window_approve' AND l.locktype='transactionid' AND l.granted)")!='0'
    g=spawn(ADMIN,f"SELECT public.generate_b2b_receivable_secure('{oid}')",'c2_window_generate')
    assert wait_lock('c2_window_generate'),'generator did not wait inside window'
    gw=pg.sql("SELECT wait_event FROM pg_stat_activity WHERE application_name='c2_window_generate'")
    receipt=pg.sql(f"SELECT count(*) FROM pg_locks l JOIN pg_stat_activity s USING(pid) WHERE s.application_name='c2_window_generate' AND l.locktype='advisory' AND l.granted AND ((l.classid::bigint<<32)|l.objid::bigint)=hashtextextended('b2b_receivable:{oid}',0)")
    release(b,pid)
    ra=done(a);rg=done(g)
    return gw,receipt,ra,rg
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=0,billing_trigger='na_aprovacao',auto_generate_receivable=true WHERE partner_id='{P}'; SET session_replication_role=origin;")
oid=json.loads(val(G,create(G,'window-baseline')+';'))['id']
before_count=pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{oid}'")
gw,receipt,ra,rg=window(oid)
print('WINDOW_BASELINE',gw,receipt,ra[0],rg[0],(ra[2]+rg[2])[-900:],flush=True)
deadlock='40P01' in ra[2]+rg[2]
ok('baseline intermediate window approve row then generator receipt reproduces 40P01',deadlock and receipt=='1' and gw=='transactionid')
ok('baseline deadlock leaves at most one title',int(pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{oid}'"))<=1 and before_count=='0')
sig='public.generate_b2b_receivable_secure(uuid)'
acl_before=pg.sql(f"SELECT pg_get_userbyid(proowner)||'|'||proacl::text FROM pg_proc WHERE oid='{sig}'::regprocedure")
base_md5=pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")
V=N/'receipt-lock-order-review'
def guarded_apply(name):
    gate=pg.sql("SELECT pg_get_functiondef('platform_private.c2_owner_order_create_allowed(uuid,uuid)'::regprocedure)")+'\n'
    pg.sql("CREATE OR REPLACE FUNCTION platform_private.c2_owner_order_create_allowed(_uid uuid,_partner uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$ SELECT false; $function$;")
    pg.sql((V/name).read_text())
    pg.sql(gate) # synthetic fixture only, never part of the deployment candidate

guarded_apply('preflight.sql');guarded_apply('candidate.sql.review');guarded_apply('postflight.sql')
ok('variant PRE/POST guard body owner ACL; ACL unchanged',pg.sql(f"SELECT pg_get_userbyid(proowner)||'|'||proacl::text FROM pg_proc WHERE oid='{sig}'::regprocedure")==acl_before)
oid=json.loads(val(G,create(G,'window-fixed')+';'))['id']
key=pg.sql(f"SELECT hashtext('b2b_credit:'||'{P}')");b,pid=barrier(key)
a=spawn(ADMIN,f"SELECT public.approve_partner_order('{oid}',NULL,NULL)",'c2_window_approve')
assert wait_lock('c2_window_approve','advisory')
g=spawn(ADMIN,f"SELECT public.generate_b2b_receivable_secure('{oid}')",'c2_window_generate')
assert wait_lock('c2_window_generate')
receipt=pg.sql(f"SELECT count(*) FROM pg_locks l JOIN pg_stat_activity s USING(pid) WHERE s.application_name='c2_window_generate' AND l.locktype='advisory' AND l.granted")
release(b,pid);ra=done(a);rg=done(g)
ok('fixed same window generator waits row without receipt and both commit',receipt=='0' and ra[0]==0 and rg[0]==0)
ok('fixed window exactly one title three installments one link',pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{oid}'")=='1' and pg.sql(f"SELECT count(*) FROM public.accounts_receivable_installments WHERE receivable_id IN (SELECT id FROM public.accounts_receivable WHERE origin_id='{oid}')")=='3' and pg.sql(f"SELECT count(*) FROM public.partner_order_financial_links WHERE partner_order_id='{oid}'")=='1')
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET billing_trigger='na_entrega' WHERE partner_id='{P}'; SET session_replication_role=origin;")
pending=json.loads(val(G,create(G,'fixed-no-delivery')+';'))['id']
actor(ADMIN,f"SELECT public.approve_partner_order('{pending}',NULL,NULL);")
before=snapshot();denied(ADMIN,f"SELECT public.generate_b2b_receivable_secure('{pending}')",'42501','C2_EXTERNAL_DELIVERY_REQUIRED')
ok('fixed na_entrega still denies premature billing exact 42501 no effects',snapshot()==before)
drift=(V/'function.sql.review').read_text().replace('BEGIN\n','BEGIN\n -- deliberate local drift\n',1)
pg.sql(drift);failure=pg.sql((V/'rollback.sql.review').read_text(),ok=False)
ok('variant rollback rejects wrong hash','receipt_lock_rollback_pre_drift' in failure)
pg.sql((V/'function.sql.review').read_text())
guarded_apply('rollback.sql.review')
ok('variant rollback restores exact baseline body and ACL',pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")==base_md5 and pg.sql(f"SELECT pg_get_userbyid(proowner)||'|'||proacl::text FROM pg_proc WHERE oid='{sig}'::regprocedure")==acl_before)
# Containment is not code reversal: replay historical containment tests against the new wrapper hash.
guarded_apply('candidate.sql.review')
saved_wrapper=pg.sql(f"SELECT pg_get_functiondef('{sig}'::regprocedure)")+'\n'
suffix=suffix.replace("rollback=(N/'origin-rebase/rollback.sql.review').read_text()","rollback=(V/'containment.sql.review').read_text()")
# Restore only in disposable PostgreSQL after complete containment tests, never a hosted deployment instruction.
suffix += "\npg.sql((V/'baseline.sql').read_text())\nok('final disposable teardown wrapper baseline restored')\n"
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET billing_trigger='na_entrega',auto_generate_receivable=true WHERE partner_id='{P}'; SET session_replication_role=origin;")
