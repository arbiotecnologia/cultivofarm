"""Exact authorization outcomes; original business bodies remain unchanged."""
def denied(u,sql,state,msg):
    p=pg.popen('');p.stdin.write(transaction(u,sql,'c2_strict_auth'));p.stdin.close()
    out=p.stdout.read();err=p.stderr.read();p.wait(timeout=15)
    assert p.returncode!=0 and f'ERROR:  {state}:' in err and msg in err,err
    return err
for u,p in [(ADMIN_B,P),(GB,P),(ADMIN,Q),(G,Q),(T,P),(PR,P)]:
    x=pg.popen('');x.stdin.write(transaction(u,create(G,'strict-'+u,p,h=hashA),'c2_diagnose'));x.stdin.close();x.stdout.read();e=x.stderr.read();x.wait();print('AUTH_EXPECTED',u,p,e.splitlines()[0],flush=True)
for u in [ADMIN_B,GB,T,PR]:
    for sql in [f"SELECT public.approve_partner_order('{next_id}',NULL,NULL)",f"SELECT public.generate_b2b_receivable_secure('{bill_id}')"]:
        x=pg.popen('');x.stdin.write(transaction(u,sql,'c2_diagnose'));x.stdin.close();x.stdout.read();e=x.stderr.read();x.wait();print('AUTH_MUTATION',u,e.splitlines()[0],flush=True)
