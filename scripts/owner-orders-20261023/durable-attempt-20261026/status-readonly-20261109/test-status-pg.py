"""Option A status RPC. Disposable PostgreSQL 17 + captured durable-journal chain + synthetic Auth only. Never hosted."""
from pathlib import Path
import json, subprocess, time, sys, hashlib
PKG=Path(__file__).resolve().parent; D=PKG.parent
src=(D/'test-local.py').read_text()
cut=src.index('def bg(sql,name,u=G):')
env={'__file__':str(D/'test-local.py'),'__name__':'harness'}
exec(compile(src[:cut],str(D/'test-local.py'),'exec'),env)
pg,val,create,jwt,P,hA,G,T=[env[k] for k in ('pg','val','create','jwt','P','hA','G','T')]
error,first,start,finish,holding,release,waiting,count=[env[k] for k in ('error','first','start','finish','holding','release','waiting','count')]
CH=[]
ADMIN=env.get('ADMIN') or env['G0']['ADMIN']
ADMIN_B=env.get('ADMIN_B') or env['G0']['ADMIN_B']
def ok(name,cond,detail=''):
 CH.append({'name':name,'ok':bool(cond),'detail':str(detail)[:600]});print(('PASS ' if cond else 'FAIL ')+name,flush=True)
def jcount(u=None):
 return int(pg.sql('SELECT count(*) FROM platform_private.partner_order_attempt_journal'+(f" WHERE actor_id='{u}'" if u else '')))
def status(u):return json.loads(val(u,f"SELECT public.partner_order_attempt_status_v1('{P}')"))
def recover(u):return json.loads(val(u,f"SELECT public.recover_partner_order_attempt_v1('{P}')"))
def run(sql):
 r=subprocess.run(pg.psql(),input='\\set VERBOSITY verbose\n'+sql,text=True,capture_output=True);return r.stdout+r.stderr
print('==== C2_ORDER_ATTEMPT_STATUS_V1 ====',flush=True)
# PRE / install / POST
pre=(PKG/'00-status-pre.sql.readonly').read_text()
o=run(pre);ok('00 PRE_OK on installed durable journal (candidate pins)', 'C2AS_PRE_OK' in o, o[-300:])
o=run((PKG/'01-status-install.sql.review').read_text());ok('01 install',"ERROR" not in o,o[-300:])
pins={'__MD5_CORE__':pg.sql("SELECT md5(prosrc) FROM pg_proc WHERE oid='platform_private.c2_order_attempt_status_core(uuid)'::regprocedure"),
      '__MD5_WRAP__':pg.sql("SELECT md5(prosrc) FROM pg_proc WHERE oid='public.partner_order_attempt_status_v1(uuid)'::regprocedure")}
def pinned(name):
 s=(PKG/name).read_text()
 for k,v in pins.items():s=s.replace(k,v)
 return s
frozen=json.loads((PKG/'pins.json').read_text()) if (PKG/'pins.json').exists() else None
ok('installed bodies = frozen pins (if frozen)',frozen is None or frozen==pins,(frozen,pins))
post=pinned('02-status-post.sql.readonly')
o=run(post);print('POSTOUT',o[-400:],flush=True);ok('02 POST_OK',"C2AS_POST_OK" in o,o[-300:])
o=run(pre);ok('PRE after install refuses (already present)','C2AS_PRE_ALREADY_PRESENT' in o,o[-200:])
o=run((PKG/'01-status-install.sql.review').read_text());ok('re-install refused','C2AS_INSTALL_PRECONDITION' in o,o[-200:])
for role in ('anon','service_role','PUBLIC'):
 r=pg.sql(f"SELECT has_function_privilege('{role}','public.partner_order_attempt_status_v1(uuid)','EXECUTE') OR has_function_privilege('{role}','platform_private.c2_order_attempt_status_core(uuid)','EXECUTE')" if role!='PUBLIC' else "SELECT EXISTS(SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.proname IN ('partner_order_attempt_status_v1','c2_order_attempt_status_core') AND a.grantee=0)")
 ok(f'{role} without EXECUTE on status',r=='f',r)
r=pg.sql("SELECT bool_or(a.is_grantable) FROM pg_proc p, aclexplode(p.proacl) a WHERE p.proname IN ('partner_order_attempt_status_v1','c2_order_attempt_status_core')");ok('no grant option on status functions',r=='f',r)

# Existing slot of G: the latest key from the base harness is reserved without receipt -> uncertain, read only.
j0=jcount();s1=status(G);s2=status(G)
ok('existing registered key without receipt reads uncertain; repeated status writes nothing',s1['state'] in ('uncertain','committed','closed') and s1==s2 and jcount()==j0,s1)
rr=recover(G)
ok('status = recover view for existing key (same key/generation/state family)',rr['key']==s1['key'] and rr['generation']==s1['generation'],(rr,s1))
if s1['state']=='uncertain':
 ok('old uncertain is never auto-closed by status',pg.sql(f"SELECT count(*) FROM platform_private.partner_order_idempotency_closures WHERE idempotency_key='{s1['key']}'")=='0')

# Fresh actor: pick a synthetic actor authorised for P that has no journal and no legacy receipt.
fresh=None
for k in ('GB','GT','PR'):
 u=env.get(k)
 if not u:continue
 try:
  s=status(u)
  if s.get('state')=='none':fresh=u;break
 except Exception as e:print('probe',k,str(e)[:160],flush=True)
ok('fresh authorised actor available in fixture',fresh is not None)
if fresh:
 jf=jcount(fresh);a=status(fresh);b=status(fresh)
 ok('first access: status none, NO reservation',a['state']=='none' and a['contract']=='C2_ORDER_ATTEMPT_STATUS_V1' and jcount(fresh)==jf==0,a)
 ok('reload without dispatch: still none, still no journal row (fixes false uncertain)',b['state']=='none' and jcount(fresh)==0,b)
 ok('status none echoes server actor/org/partner scope',a['actor_id']==fresh and a['partner_id']==P)
 # Two tabs / devices: both read none, both prepare concurrently on the server.
 pa=start(f"SELECT public.recover_partner_order_attempt_v1('{P}')",'tab-a',fresh);pb=start(f"SELECT public.recover_partner_order_attempt_v1('{P}')",'tab-b',fresh)
 oa,ea=finish(pa);ob,eb=finish(pb)
 print('TABS',repr(oa[-400:]),repr(ob[-400:]),flush=True)
 ra=json.loads([l for l in oa.splitlines() if l.strip().startswith('{')][-1]);rb=json.loads([l for l in ob.splitlines() if l.strip().startswith('{')][-1])
 ok('two tabs prepare: exactly one reservation row, same key',not ea and not eb and jcount(fresh)==1 and ra['key']==rb['key'],(ra,rb,ea,eb))
 ok('two tabs prepare: exactly one sees reserved, the other sees uncertain (client with fresh expectation must refuse)',sorted([ra['state'],rb['state']])==['reserved','uncertain'],(ra['state'],rb['state']))
 K=ra['key']
 ok('after reservation, status reads uncertain (a real dispatch may exist)',status(fresh)['state']=='uncertain')
 # Reserve + lock timeout: status waits on b2b_idem and times out bounded, without writes.
 lock=f"SELECT pg_advisory_xact_lock(hashtextextended('b2b_idem:'||'{P}'||':'||'{K}',0))"
 h=holding(lock,'idem-holder');t=time.monotonic();e=error(fresh,f"SELECT public.partner_order_attempt_status_v1('{P}')")
 ok('status on held key times out bounded (55P03), no journal/closure change',first(e)=='ERROR:  55P03: canceling statement due to lock timeout' and 4.5<time.monotonic()-t<8 and jcount(fresh)==1,first(e))
 release(h)
 b0=count()
 # Lost response after commit: create commits, client never sees reply; status/recover show committed.
 cr=json.loads(val(fresh,create(P,K,hA)))
 sc=status(fresh)
 ok('lost response after commit: status shows committed with the same order',sc['state']=='committed' and sc['order_id']==cr['id'] and sc['key']==K,sc)
 ok('status after commit does not advance generation',sc['generation']==1 and jcount(fresh)==1)
 again=json.loads(val(fresh,create(P,K,hA)))
 ok('replay after success returns the same order, no duplicate',again['id']==cr['id'] and count()==str(int(b0)+1),(again,cr))
 # Acknowledge explicitly -> reserve next generation only in prepare/advance.
 nx=json.loads(val(fresh,f"SELECT public.recover_partner_order_attempt_v1('{P}','{K}',1,true,'{cr['id']}')"))
 ok('explicit ACK advance reserves gen 2 (prepare path only)',nx['state']=='reserved' and nx['generation']==2)
 K2=nx['key']
 # Close concurrent with create on the same key: exactly one outcome.
 b1=count()
 pc=start(create(P,K2,hA),'race-create',fresh);pl=start(f"SELECT public.close_partner_order_attempt_v1('{P}','{K2}')",'race-close',fresh)
 oc,ec=finish(pc);ol,el=finish(pl)
 orders=int(count())-int(b1);closed=pg.sql(f"SELECT count(*) FROM platform_private.partner_order_idempotency_closures WHERE idempotency_key='{K2}'")
 st=status(fresh)
 ok('close vs create race: exactly one of order or closure, status agrees',(orders==1 and closed=='0' and st['state']=='committed') or (orders==0 and closed=='1' and st['state']=='closed'),(orders,closed,st['state'],ec[-160:],el[-160:]))
 ok('close vs create race: no deadlock',"40P01" not in ec+el)
 # Concurrent status while a create on a NEW key holds idem: status waits and reports committed afterwards.
 if st['state']=='committed':
  nx=json.loads(val(fresh,f"SELECT public.recover_partner_order_attempt_v1('{P}','{K2}',2,true,'{st['order_id']}')"))
 else:
  nx=json.loads(val(fresh,f"SELECT public.recover_partner_order_attempt_v1('{P}','{K2}',2,true,NULL)"))
 K3=nx['key'];l3=f"SELECT pg_advisory_xact_lock(hashtextextended('b2b_idem:'||'{P}'||':'||'{K3}',0))"
 h=holding(l3,'k3-holder');ps=start(f"SELECT public.partner_order_attempt_status_v1('{P}')",'status-wait',fresh)
 ok('status waits behind writer lock of the current key',waiting('status-wait'))
 release(h);os_,es=finish(ps)
 ok('status after wait reads uncertain for undispatched reservation (never none)','"uncertain"' in os_ and not es,(os_[-200:],es[-200:]))
 # Revocation during the wait fails closed.
 h=holding(l3,'rev-holder');ps=start(f"SELECT public.partner_order_attempt_status_v1('{P}')",'status-rev',fresh)
 ok('status revocation test waits',waiting('status-rev'))
 pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=now(),revoked_by='{ADMIN}',revoke_reason='synthetic' WHERE user_id='{fresh}'; SET session_replication_role=origin;")
 release(h);os_,es=finish(ps)
 ok('revocation during status wait denies, no state disclosed',first(es)=='ERROR:  42501: forbidden_partner' and 'uncertain' not in os_,first(es))
 pg.sql(f"SET session_replication_role=replica; UPDATE public.partner_users SET revoked_at=NULL,revoked_by=NULL,revoke_reason=NULL WHERE user_id='{fresh}'; SET session_replication_role=origin;")
# Negative actors.
b=jcount();e=error(ADMIN_B,f"SELECT public.partner_order_attempt_status_v1('{P}')")
ok('other tenant denied before disclosure, no writes',first(e).startswith('ERROR:  42501') and jcount()==b,first(e))
e=error(T,f"SELECT public.partner_order_attempt_status_v1('{P}')")
ok('isolated technician denied',first(e).startswith('ERROR:  42501'),first(e))
e=pg.sql(f"\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE anon; SELECT public.partner_order_attempt_status_v1('{P}'); COMMIT;",ok=False)
ok('anon denied (permission)', '42501' in e,first(e))
# Rollback / reinstall.
o=run((PKG/'99-status-rollback.sql.review').read_text().replace('__MD5_CORE__','0'*32))
ok('rollback with divergent pin aborts, objects kept','C2AS_ROLLBACK_PIN_DRIFT' in o and pg.sql("SELECT to_regprocedure('public.partner_order_attempt_status_v1(uuid)') IS NOT NULL")=='t')
jb=jcount();cb=pg.sql('SELECT count(*) FROM platform_private.partner_order_idempotency_closures')
o=run(pinned('99-status-rollback.sql.review'))
ok('99 rollback exact; journal/closures preserved; recover intact',"ERROR" not in o and pg.sql("SELECT to_regprocedure('public.partner_order_attempt_status_v1(uuid)') IS NULL")=='t' and jcount()==jb and pg.sql('SELECT count(*) FROM platform_private.partner_order_idempotency_closures')==cb and pg.sql("SELECT md5(prosrc) FROM pg_proc WHERE oid='platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid)'::regprocedure")=='191fc04882f27eaa95df242c030a966c',o[-200:])
o=run(pre);ok('PRE passes again after rollback','C2AS_PRE_OK' in o,o[-200:])
o=run((PKG/'01-status-install.sql.review').read_text());o2=run(post)
ok('reinstall + POST after rollback','C2AS_POST_OK' in o2,(o[-150:],o2[-150:]))
out={'pg':pg.sql('SELECT version()'),'pins':pins,'passed':sum(c['ok'] for c in CH),'total':len(CH),'checks':CH,
 'base_harness_checks':len(env['G0']['checks']) if 'G0' in env else None,
 'scope':'disposable PG + captured durable journal chain + synthetic Auth; NOT hosted JWT/RLS/PostgREST proof'}
print('C2AS_RESULT',json.dumps({'passed':out['passed'],'total':out['total']}),flush=True)
Path(sys.argv[1]).write_text(json.dumps(out,indent=1,ensure_ascii=False)+'\n')
sys.exit(0 if out['passed']==out['total'] else 1)
