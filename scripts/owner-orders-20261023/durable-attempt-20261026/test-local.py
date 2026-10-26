"""Disposable PostgreSQL, captured chain and synthetic Auth only. Never hosted."""
from pathlib import Path
import json, subprocess, time
D=Path(__file__).resolve().parent
C=D.parent/'attempt-closure-20261026'
src=(C/'test-local.py').read_text()
setup=src[:src.index("PREV_REV = '457951ca'")]
env={'__file__':str(C/'test-local.py'),'__name__':'harness'}
exec(compile(setup,str(C/'test-local.py'),'exec'),env)
pg,ok,val,create,jwt=[env[k] for k in ('pg','ok','val','create','jwt')]
G,GB,GT,T,P,Q,hA=[env[k] for k in ('G','GB','GT','T','P','Q','hA')]
pg.sql(env['cand']);pg.sql(env['post'])
base=len(env['G0']['checks'])
print('==== durable-attempt INACTIVE ====',flush=True)
def error(u,sql):
 return pg.sql(f"\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{jwt(u)}',true); {sql}; COMMIT;",ok=False)
def first(s):return next((x for x in s.splitlines() if x.startswith('ERROR:')),'')
def count():return pg.sql('SELECT count(*) FROM public.partner_orders')
def recover(u=G,advance=False,key=None,generation=None,ack=None):
 qkey='NULL' if key is None else "'%s'"%key
 qgen='NULL' if generation is None else str(generation)
 qack='NULL' if ack is None else "'%s'"%ack
 sql=f"SELECT public.recover_partner_order_attempt_v1('{P}',{qkey},{qgen},{str(advance).lower()},{qack})"
 return json.loads(val(u,sql))
before=count()
old1=json.loads(val(G,create(P,'journal-before-1',hA)))
old2=json.loads(val(G,create(P,'journal-before-2',hA)))
ok('BEFORE: lost client memory / independent keys reproduces two orders',old1['id']!=old2['id'] and int(count())==int(before)+2)
candidate=(D/'candidate.sql.review').read_text()
err=pg.sql('\\set VERBOSITY verbose\n'+candidate,ok=False)
ok('production candidate always blocks missing reconciliation before DDL',first(err)=='ERROR:  42501: C2DJ_ACTIVATION_BLOCKED:legacy_keys_and_live_capture_pending' and pg.sql("SELECT to_regclass('platform_private.partner_order_attempt_journal') IS NULL")=='t')
pg.sql((D/'test-install.sql').read_text())
pg.sql((D/'postflight.sql').read_text())
r=recover();ok('reserve is durable before ANY create',r['state']=='reserved' and r['generation']==1)
rr=recover();ok('crash before fetch recovers SAME uncertain key, no absence inference',rr['state']=='uncertain' and rr['key']==r['key'])
nr=recover(advance=True,key=r['key'],generation=1)
ok('explicit CAS advance closes old key before new generation',nr['generation']==2 and nr['key']!=r['key'] and pg.sql(f"SELECT count(*) FROM platform_private.partner_order_idempotency_closures WHERE idempotency_key='{r['key']}'")=='1')
b=count(); e=error(G,create(P,r['key'],hA))
ok('late old generation refused atomically',first(e)=='ERROR:  42501: C2DJ_REGISTERED_ATTEMPT_REQUIRED' and count()==b)
commit=json.loads(val(G,create(P,nr['key'],hA)))
rr=recover();ok('crash after commit before ack recovers committed same order',rr['state']=='committed' and rr['order_id']==commit['id'])
rr=recover(advance=True,key=nr['key'],generation=2)
ok('committed without explicit order acknowledgement never creates new generation',rr['state']=='committed' and rr['key']==nr['key'])
new=recover(advance=True,key=nr['key'],generation=2,ack=commit['id'])
ok('explicit acknowledged committed advances once',new['generation']==3)
b=count();e=error(G,f"SELECT public.recover_partner_order_attempt_v1('{P}','{nr['key']}',2,true,'{commit['id']}')")
ok('old response / old generation CAS cannot advance current slot',first(e)=='ERROR:  40001: C2DJ_CAS_CONFLICT' and recover()['key']==new['key'] and count()==b)
b=count();e=error(GB,f"SELECT public.recover_partner_order_attempt_v1('{P}')")
ok('B denied before disclose, no writes',first(e)=='ERROR:  42501: target_outside_portfolio' and count()==b)
b=count();e=error(T,f"SELECT public.recover_partner_order_attempt_v1('{P}')")
ok('technician singleton denied, no writes',first(e)=='ERROR:  42501: forbidden_financial_terms' and count()==b)
e=error(G,create(P,'unregistered-downgrade-key',hA))
ok('old/downgraded arbitrary key refused, no order',first(e)=='ERROR:  42501: C2DJ_REGISTERED_ATTEMPT_REQUIRED' and count()==b)

def bg(sql,name,u=G):
 p=subprocess.Popen(pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 p.stdin.write(f"\\set VERBOSITY verbose\nSET application_name='{name}'; BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{jwt(u)}',true); {sql}; COMMIT;")
 p.stdin.close();return p
def done(p):
 o=p.stdout.read();e=p.stderr.read();p.wait(timeout=60);return o,e
# Separate backend processes, prepare calls serialized on server scope (not client locks).
a=bg(f"SELECT public.recover_partner_order_attempt_v1('{P}')",'journal-a')
c=bg(f"SELECT public.recover_partner_order_attempt_v1('{P}')",'journal-b')
oa,ea=done(a);oc,ec=done(c)
ok('two independent prepare callers share SAME reservation',new['key'] in oa and new['key'] in oc and not ea and not ec)
a=bg(create(P,new['key'],hA),'journal-create-a');c=bg(create(P,new['key'],hA),'journal-create-b')
oa,ea=done(a);oc,ec=done(c)
ok('concurrent canonical create exactly one order',not ea and not ec and int(count())==int(b)+1 and pg.sql(f"SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key='{new['key']}'")=='1')
snap=pg.sql('SELECT count(*) FROM platform_private.partner_order_attempt_journal')
e=pg.sql("\\set VERBOSITY verbose\nDELETE FROM platform_private.partner_order_attempt_journal",ok=False)
ok('journal immutable including owner',first(e)=='ERROR:  42501: C2_ATTEMPT_CLOSURE_IMMUTABLE' and pg.sql('SELECT count(*) FROM platform_private.partner_order_attempt_journal')==snap)
# Revoke only inside disposable fixture, never production.
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=now(),revoked_by='{env['ADMIN']}',revoke_reason='synthetic' WHERE user_id='{G}'; SET session_replication_role=origin;")
b=count();e=error(G,f"SELECT public.recover_partner_order_attempt_v1('{P}')")
ok('revoked authorization cannot recover or advance',first(e)=='ERROR:  42501: forbidden_partner' and count()==b)
pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=NULL,revoked_by=NULL,revoke_reason=NULL WHERE user_id='{G}'; SET session_replication_role=origin;")
pg.sql((D/'rollback.sql.review').read_text())
ok('containment retains immutable generations and closures',pg.sql('SELECT count(*) FROM platform_private.partner_order_attempt_journal')==snap)
e=error(G,create(P,new['key'],hA))
# Existing replay returns before idempotency INSERT. No new order possible; replay is not a writer.
ok('contained known-key replay preserves existing order only',count()==b and ('ERROR:' not in e))
e=error(G,create(P,'downgrade-after-containment',hA))
ok('containment/downgrade unknown key cannot create',first(e)=='ERROR:  42501: C2DJ_REGISTERED_ATTEMPT_REQUIRED' and count()==b)
print('TOTAL',len(env['G0']['checks'])-base,'PASS package; synthetic Auth, no hosted/JWT certification',flush=True)