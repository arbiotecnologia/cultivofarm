"""Disposable PostgreSQL, captured chain and synthetic Auth only. Never hosted."""
from pathlib import Path
import json, subprocess, time, re, hashlib
D=Path(__file__).resolve().parent
C=D.parent/'attempt-closure-20261026'
src=(C/'test-local.py').read_text()
setup=src[:src.index("PREV_REV = '457951ca'")]
env={'__file__':str(C/'test-local.py'),'__name__':'harness'}
exec(compile(setup,str(C/'test-local.py'),'exec'),env)
pg,ok,val,create,jwt=[env[k] for k in ('pg','ok','val','create','jwt')]
base_val=val
val=lambda u,s:base_val(u,s.rstrip(';')+';')
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
old1=json.loads(val(G,create(P,'10000000-0000-4000-8000-000000000001',hA)))
old2=json.loads(val(G,create(P,'10000000-0000-4000-8000-000000000002',hA)))
ok('BEFORE: lost client memory / independent keys reproduces two orders',old1['id']!=old2['id'] and int(count())==int(before)+2)
candidate=(D/'candidate.sql.review').read_text()
err=pg.sql('\\set VERBOSITY verbose\n'+candidate,ok=False)
ok('production candidate denies reduced fixture metadata before DDL',first(err)=='ERROR:  P0001: C2DJ_POI_STRUCTURE_DRIFT' and pg.sql("SELECT to_regclass('platform_private.partner_order_attempt_journal') IS NULL")=='t')
# Explicit fixture-only adaptations: reduced schema lacks updated_at trigger/ACL;
# audited production IDs become two synthetic orders. Canonical seven bodies unchanged.
structure_expr="(SELECT md5(jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='partner_order_idempotency'))::text) FROM pg_class c WHERE c.oid='public.partner_order_idempotency'::regclass)"
fixture_structure=pg.sql('SELECT '+structure_expr)
pg.sql("CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;")
fixture_updated=pg.sql("SELECT md5(prosrc) FROM pg_proc WHERE oid='public.update_updated_at_column()'::regprocedure")
legacy_fixture=f"""DO $legacy$ BEGIN IF (SELECT count(*) FROM public.partner_order_idempotency)<>2
 OR (SELECT order_id FROM public.partner_order_idempotency ORDER BY created_at DESC,id DESC LIMIT 1) IS DISTINCT FROM '{old2['id']}'::uuid
 THEN RAISE EXCEPTION 'C2DJ_LEGACY_CAPTURE_DRIFT'; END IF; END $legacy$;"""
def adapt(sql):
 sql=sql.replace('3c5afe617195db177fe831c877473258',fixture_structure).replace('a27bb088c067b7b77a9f0707b0048e40',fixture_updated)
 return re.sub(r'-- LEGACY_CAPTURE_BEGIN:.*?-- LEGACY_CAPTURE_END',legacy_fixture,sql,flags=re.S)
candidate=adapt(candidate);post=(D/'postflight.sql').read_text()
print('FIXTURE_METADATA_SUBSTITUTIONS',json.dumps({'poi':fixture_structure,'updated':fixture_updated,'legacy':'two synthetic orders; no production rows'}),flush=True)
# Inject failing POST into full transaction, including import, prove atomic rollback.
inj=candidate.replace('DO $imports$',"DO $fault$ BEGIN RAISE EXCEPTION 'C2DJ_POST_FAULT'; END $fault$;\nDO $imports$",1)
err=pg.sql('\\set VERBOSITY verbose\n'+inj,ok=False)
ok('POST fault rolls back journal/import/barrier/create atomically',first(err)=='ERROR:  P0001: C2DJ_POST_FAULT' and pg.sql("SELECT to_regclass('platform_private.partner_order_attempt_journal') IS NULL")=='t' and pg.sql(f"SELECT md5(prosrc) FROM pg_proc WHERE oid='{env['sig'] if 'sig' in env else 'public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'}'::regprocedure")=='71d1f32e00c5c9857eae51999dc40ef0')
pg.sql(candidate);pg.sql(post)
legacy_r=recover();ok('legacy latest committed imported immutable WITHOUT assumed ACK',legacy_r['state']=='committed' and legacy_r['order_id']==old2['id'] and legacy_r['generation']==1)
for forged_ack in [None,old1['id']]:
 rr=recover(advance=True,key=legacy_r['key'],generation=1,ack=forged_ack)
 ok('missing/forged ACK never advances imported committed',rr['order_id']==old2['id'] and rr['generation']==1)
r=recover(advance=True,key=legacy_r['key'],generation=1,ack=old2['id']);ok('explicit exact legacy ACK reserves next generation',r['state']=='reserved' and r['generation']==2)
rr=recover();ok('crash before fetch recovers SAME uncertain key, no absence inference',rr['state']=='uncertain' and rr['key']==r['key'])
nr=recover(advance=True,key=r['key'],generation=1)
ok('explicit CAS advance closes old key before new generation',nr['generation']==3 and nr['key']!=r['key'] and pg.sql(f"SELECT count(*) FROM platform_private.partner_order_idempotency_closures WHERE idempotency_key='{r['key']}'")=='1')
b=count(); e=error(G,create(P,r['key'],hA))
ok('late old generation refused atomically',first(e)=='ERROR:  42501: C2DJ_REGISTERED_ATTEMPT_REQUIRED' and count()==b)
commit=json.loads(val(G,create(P,nr['key'],hA)))
rr=recover();ok('crash after commit before ack recovers committed same order',rr['state']=='committed' and rr['order_id']==commit['id'])
rr=recover(advance=True,key=nr['key'],generation=3)
ok('committed without explicit order acknowledgement never creates new generation',rr['state']=='committed' and rr['key']==nr['key'])
new=recover(advance=True,key=nr['key'],generation=3,ack=commit['id'])
ok('explicit acknowledged committed advances once',new['generation']==4)
b=count();e=error(G,f"SELECT public.recover_partner_order_attempt_v1('{P}','{nr['key']}',3,true,'{commit['id']}')")
ok('old response / old generation CAS cannot advance current slot',first(e)=='ERROR:  40001: C2DJ_CAS_CONFLICT' and recover()['key']==new['key'] and count()==b)
b=count();e=error(env['ADMIN_B'],f"SELECT public.recover_partner_order_attempt_v1('{P}')")
print('B_ERROR',first(e),flush=True)
ok('B denied before disclose, no writes',first(e)=='ERROR:  42501: C2_INTERNAL_TARGET_DENIED:target_outside_portfolio' and count()==b)
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
known_id=recover()['order_id']
pg.sql((D/'rollback.sql.review').read_text())
ok('containment retains immutable generations and closures',pg.sql('SELECT count(*) FROM platform_private.partner_order_attempt_journal')==snap)
replay=json.loads(val(G,create(P,new['key'],hA)))
# Existing replay returns before idempotency INSERT. No new order possible; replay is not a writer.
ok('contained known-key replay preserves existing order only',count()==b and replay['id']==known_id)
e=error(G,create(P,'downgrade-after-containment',hA))
ok('containment/downgrade unknown key cannot create',first(e)=='ERROR:  42501: C2DJ_REGISTERED_ATTEMPT_REQUIRED' and count()==b)
print('TOTAL',len(env['G0']['checks'])-base,'PASS package; synthetic Auth, no hosted/JWT certification',flush=True)