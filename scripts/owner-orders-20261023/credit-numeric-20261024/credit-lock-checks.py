"""Captured create versus approve, synthetic Auth, two real local connections."""
def open_hold(u,sql,name):
    p=subprocess.Popen(pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
    p.stdin.write(transaction(u,sql,name,True).encode());p.stdin.close()
    while True:
        line=p.stdout.readline()
        if b'CONCURRENT_HOLD' in line:break
        if not line:raise AssertionError(p.stderr.read().decode())
    return p
def finish(p):
    out=p.stdout.read();err=p.stderr.read();p.wait(timeout=15)
    assert p.returncode==0,err
    return out.decode() if isinstance(out,bytes) else out

pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=0,billing_trigger='na_entrega',auto_generate_receivable=true WHERE partner_id='{P}'; SET session_replication_role=origin;")
lock_ids=pg.sql(f"SELECT hashtextextended('b2b_credit:'||'{P}',0)::text||'|'||hashtext('b2b_credit:'||'{P}')::text")
ok('credit locks distinct for synthetic partner',lock_ids.split('|')[0]!=lock_ids.split('|')[1])
target=json.loads(val(G,create(G,'lock-baseline-target')+';'))['id']
p1=open_hold(G,create(G,'lock-baseline-create'),'c2_credit_create')
p2=pg.popen('');p2.stdin.write(transaction(ADMIN,f"SELECT public.approve_partner_order('{target}',NULL,NULL)",'c2_credit_approve'));p2.stdin.close()
deadline=time.monotonic()+1.5
while p2.poll() is None and time.monotonic()<deadline:time.sleep(.02)
if not (p2.poll()==0 and p1.poll() is None):
    print('LOCK_DIAGNOSTIC',pg.sql("SELECT application_name||'|'||coalesce(wait_event,'') FROM pg_stat_activity WHERE application_name IN ('c2_credit_create','c2_credit_approve')"),flush=True)
    finish(p2)
    raise AssertionError('baseline approve did not commit during create hold')
ok('baseline approve commits while create credit lock still held')
finish(p2);finish(p1)
ok('baseline interleave no premature title or financial exploit demonstrated',pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{target}'")=='0')

sig='public.approve_partner_order(uuid,text,date)'
approve_before=pg.sql(f"SELECT pg_get_functiondef('{sig}'::regprocedure)")+'\n'
old="pg_advisory_xact_lock(hashtext('b2b_credit:' || v_pid::text))"
new="pg_advisory_xact_lock(hashtextextended('b2b_credit:' || v_pid::text, 0))"
assert approve_before.count(old)==1
approve_fixed=approve_before.replace(old,new)
# Exact overlay emitted separately below; no modification of captured baseline.
pg.sql(approve_fixed)
ok('credit lock patch one expression only',pg.sql(f"SELECT pg_get_functiondef('{sig}'::regprocedure)")+'\n'==approve_fixed and approve_fixed.replace(new,old)==approve_before)
target=json.loads(val(G,create(G,'lock-fixed-target')+';'))['id']
p1=open_hold(G,create(G,'lock-fixed-create'),'c2_credit_create')
p2=pg.popen('');p2.stdin.write(transaction(ADMIN,f"SELECT public.approve_partner_order('{target}',NULL,NULL)",'c2_credit_approve'));p2.stdin.close()
for _ in range(25):
    if pg.sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='c2_credit_approve' AND wait_event_type='Lock' AND wait_event='advisory'")=='1':break
    time.sleep(.02)
else:raise AssertionError('patched approval not waiting for canonical partner lock')
ok('fixed create versus approve same partner waits with order row held',p1.poll() is None and p2.poll() is None)
finish(p1);finish(p2)
ok('fixed create versus approve completes without deadlock and no title',pg.sql(f"SELECT status||'|'||receivable_generated FROM public.partner_orders WHERE id='{target}'")=='aprovado|false')
target=json.loads(val(G,create(G,'lock-fixed-reverse-target')+';'))['id']
p1=open_hold(ADMIN,f"SELECT public.approve_partner_order('{target}',NULL,NULL)",'c2_credit_approve')
p2=pg.popen('');p2.stdin.write(transaction(G,create(G,'lock-fixed-reverse-create'),'c2_credit_create'));p2.stdin.close()
for _ in range(25):
    if pg.sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='c2_credit_create' AND wait_event_type='Lock' AND wait_event='advisory'")=='1':break
    time.sleep(.02)
else:raise AssertionError('patched create not waiting for approval partner lock')
ok('fixed approve versus create reverse interleave waits',p1.poll() is None and p2.poll() is None)
finish(p1);finish(p2)
ok('fixed reverse interleave no deadlock no premature billing',pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{target}'")=='0')
# Restore reviewed origin only in disposable PG so original historical containment tests remain exact.
pg.sql(approve_before)
ok('lock test restores original composed body for historical containment only',pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")=='7cf8b7a2fae31088529df4c5656ebc40')
ok('credit lock tests preserve numeric LIVE',pg.sql("SELECT md5(pg_get_functiondef('public.fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure))")=='213ac31f3a30816ead75365b0d1fed18')