"""Captured create versus approve, synthetic Auth, two real local connections; no SQL patch."""
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
def waits(name):
    for _ in range(40):
        if pg.sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{name}' AND wait_event_type='Lock' AND wait_event='advisory'")=='1':return True
        time.sleep(.03)
    return False
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_financial_settings SET credit_limit=0,billing_trigger='na_entrega',auto_generate_receivable=true WHERE partner_id='{P}'; SET session_replication_role=origin;")
sig='public.approve_partner_order(uuid,text,date)'
ok('captured composed approve body unchanged before lock checks',pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")=='7cf8b7a2fae31088529df4c5656ebc40')
ids=pg.sql(f"SELECT hashtextextended('b2b_credit:'||'{P}',0)::text||'|'||hashtext('b2b_credit:'||'{P}')::text").split('|')
ok('approve explicit credit key differs from create key',ids[0]!=ids[1])
ok('canonical update credit trigger uses create key',"hashtextextended('b2b_credit:' || NEW.partner_id::text, 0)" in pg.sql("SELECT pg_get_functiondef('public.tg_partner_orders_credit_guard()'::regprocedure)"))
target=json.loads(val(G,create(G,'lock-create-first-target')+';'))['id']
p1=open_hold(G,create(G,'lock-create-first'),'c2_credit_create')
p2=pg.popen('');p2.stdin.write(transaction(ADMIN,f"SELECT public.approve_partner_order('{target}',NULL,NULL)",'c2_credit_approve'));p2.stdin.close()
ok('create first: approval waits on canonical trigger advisory lock',waits('c2_credit_approve') and p1.poll() is None)
finish(p1);finish(p2)
ok('create first then approve no deadlock or premature title',pg.sql(f"SELECT status||'|'||receivable_generated FROM public.partner_orders WHERE id='{target}'")=='aprovado|false' and pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{target}'")=='0')
target=json.loads(val(G,create(G,'lock-approve-first-target')+';'))['id']
p1=open_hold(ADMIN,f"SELECT public.approve_partner_order('{target}',NULL,NULL)",'c2_credit_approve')
p2=pg.popen('');p2.stdin.write(transaction(G,create(G,'lock-approve-first'),'c2_credit_create'));p2.stdin.close()
ok('approve first: create waits on trigger-held advisory lock',waits('c2_credit_create') and p1.poll() is None)
finish(p1);finish(p2)
ok('approve first then create no deadlock or premature title',pg.sql(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{target}'")=='0')
ok('credit lock checks preserve approve and numeric LIVE',pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")=='7cf8b7a2fae31088529df4c5656ebc40' and pg.sql("SELECT md5(pg_get_functiondef('public.fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure))")=='213ac31f3a30816ead75365b0d1fed18')
