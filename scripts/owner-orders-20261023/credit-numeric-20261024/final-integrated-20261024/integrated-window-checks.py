"""Reuse historical deterministic lock barriers with the current captured composed chain."""
def transaction(u,sql,name):
    claims=json.dumps({'sub':u,'role':'authenticated','iat':int(time.time())})
    return f"\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE authenticated; SET LOCAL application_name='{name}'; SET LOCAL deadlock_timeout='5s'; SELECT set_config('request.jwt.claims','{claims}',true); {sql}; COMMIT;"
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

sig='public.generate_b2b_receivable_secure(uuid)'
fixed=pg.sql(f"SELECT pg_get_functiondef('{sig}'::regprocedure)")+'\n'
metadata=pg.sql(f"SELECT pg_get_userbyid(proowner)||'|'||proacl::text FROM pg_proc WHERE oid='{sig}'::regprocedure")
assert pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")=='31eeb54e4b69d97c311629a37e553faf'
# Reproduce the unsafe composed state only in disposable PG, using exact LIVE captured wrapper.
baseline=next(f for f in fns.values() if f['sig']==sig)
pg.sql(baseline['sql'])
assert pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")=='9c8c8a736bcd1d77ee2f237a8a59b4ce'
oid=json.loads(val(G,create(G,'integrated-window-baseline')+';'))['id']
gw,receipt,ra,rg=window(oid)
ok('composed current baseline intermediate barrier reproduces exact 40P01', '40P01' in ra[2]+rg[2] and receipt=='1' and gw=='transactionid')
pg.sql(fixed)
ok('integrated wrapper exact hash owner ACL unchanged', pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")=='31eeb54e4b69d97c311629a37e553faf' and pg.sql(f"SELECT pg_get_userbyid(proowner)||'|'||proacl::text FROM pg_proc WHERE oid='{sig}'::regprocedure")==metadata)
oid=json.loads(val(G,create(G,'integrated-window-fixed')+';'))['id']
gw,receipt,ra,rg=window(oid)
ok('integrated fixed same barrier waits row without receipt both commit',gw=='transactionid' and receipt=='0' and ra[0]==0 and rg[0]==0)
ok('integrated fixed one title three tenant A installments one link',pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{oid}' AND organization_id='{A}'")=='1' and pg.sql(f"SELECT count(*) FROM public.accounts_receivable_installments WHERE organization_id='{A}' AND receivable_id IN (SELECT id FROM public.accounts_receivable WHERE origin_id='{oid}')")=='3' and pg.sql(f"SELECT count(*) FROM public.partner_order_financial_links WHERE partner_order_id='{oid}'")=='1')
