"""Current captured base without origin composition; synthetic Auth, disposable PG."""
from pathlib import Path
V=Path(__file__).resolve().parent;H=V/'origin'
s=(H/'test-local.py').read_text()
setup=s[:s.index('# Preflight must pass unchanged')]
fixtures=s[s.index('pg.sql(f"""\nSET session_replication_role=replica;'):s.index("hashA=simulate(G)")]
# Setup origin directory is used only for current captured baseline; no candidate or positive helper applied.
setup=setup.replace("H=Path(__file__).resolve().parent","H=V/'origin'")
exec(compile(setup,str(H/'test-local.py'),'exec'))
exec(compile(fixtures,str(H/'test-local.py'),'exec'))
for admin,partner,org in [(ADMIN,P,A),(ADMIN_B,Q,B)]:
 pg.sql(f"SET session_replication_role=replica; UPDATE public.organizations SET partner_account_id='{partner}' WHERE id='{org}'; SET session_replication_role=origin;")
 oid=json.loads(val(admin,create(admin,'current-internal-'+admin,p=partner)+';'))['id']
 ok('current base canonical internal create positive '+org,pg.sql(f"SELECT internal_origin_snapshot IS NOT NULL FROM public.partner_orders WHERE id='{oid}'")=='t')
 exact_denied(admin,f"SELECT public.generate_b2b_receivable_secure('{oid}')",'42501','B2B_INTERNAL_DOWNSTREAM_UNVERIFIED')
 exact_denied(admin,f"SELECT public.approve_partner_order('{oid}',NULL,NULL)",'42501','B2B_INTERNAL_DOWNSTREAM_UNVERIFIED')
 ok('current base approved path blocked before receipt '+org)
 if admin==ADMIN: target=oid
# Coordinate a held order row. Generator must return its existing denial, not reach/wait receipt lock.
claims=json.dumps({'sub':ADMIN,'role':'authenticated','iat':int(time.time())})
b=pg.popen('');b.stdin.write(f"BEGIN; SELECT id FROM public.partner_orders WHERE id='{target}' FOR UPDATE; SELECT 'READY'; SELECT pg_sleep(30); COMMIT;");b.stdin.close()
while 'READY' not in b.stdout.readline():
 if b.poll() is not None:raise AssertionError(b.stderr.read())
p=pg.popen('');p.stdin.write(f"\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{claims}',true); SELECT public.generate_b2b_receivable_secure('{target}'); COMMIT;");p.stdin.close()
out=p.stdout.read();err=p.stderr.read();p.wait(timeout=5)
assert '42501: B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' in err,err
pg.sql("SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE query LIKE '%SELECT ''READY''%' AND pid<>pg_backend_pid()")
b.stdout.read();b.stderr.read();b.wait(timeout=10)
ok('two connections current internal base denial before row receipt no deadlock reproduction')
ok('current writer remains false exact hash',pg.sql("SELECT md5(pg_get_functiondef('platform_private.c2_owner_order_create_allowed(uuid,uuid)'::regprocedure))")=='a0417d6727d78412849916a95b250bde')
print('TOTAL',len(checks),'PASS; synthetic Auth; independent wrapper NO-GO')
