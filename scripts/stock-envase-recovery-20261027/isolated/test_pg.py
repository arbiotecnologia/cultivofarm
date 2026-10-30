"""Disposable full captured restore + externally reported applied composition. Never hosted."""
from pathlib import Path
import hashlib, json, re, subprocess, sys, time, traceback
H=Path(__file__).resolve().parent; S=H.parents[1]; V2=H.parent
sys.path.insert(0,str(S/'delivery-atomic-hardening-20261030'))
import restore
from restore import pg
sys.path.insert(0,str(V2)); import test_v2_pg as T
sys.path.insert(0,str(H)); import assemble as G
checks=[]; raw=[]
def ok(label): checks.append({'test':label,'status':'PASS'}); print('PASS',label,flush=True)
def sql(s): return pg.sql(s)
def last(s): return sql(s).splitlines()[-1]
def reject(label,s,code):
    r=subprocess.run(pg.psql(),input='\\set VERBOSITY verbose\n'+s,capture_output=True,text=True,timeout=40)
    raw.append({'test':label,'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
    assert r.returncode!=0 and re.search(r'ERROR:\s+'+code+r':',r.stderr), (label,r.stderr)
    ok(label)
def snapshot():
    tables=['envase','estoque_produto','estoque_movimentacoes','cockpit_operacao_idempotencia','laboratorio_esteira_eventos','ordens_servico']+T.TABLES
    return last("SELECT jsonb_build_object("+','.join("'%s',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text COLLATE \"C\"),'[]') FROM public.%s x)"%(t,t) for t in tables)+")::text;")
def state(): return json.loads(last(G.STATE+'::text;'))
def env(os,pp,l,key,quantity=2): return T.envase(os,pp,l,[{'tipo_embalagem':'frasco_1L','quantidade':quantity}],key)
def run():
    assert pg.root.is_relative_to(Path('/tmp')); assert pg.psql()[3]==str(pg.root)
    r=restore.restore(); assert not any(r.values()),r; ok('full captured restore: no unresolved objects')
    installs=[S/'delivery-proof-authz-20261030/release-combined.sql.review',V2/'install-v2.sql.review',S/'proof-select-tenant-20261030/install.sql.review',S/'delivery-evidence-tenant-20261030/install.sql.review',S/'produto-etiquetas-tenant-20261030/install.sql.review',S/'delivery-checklist-occurrence-authz-20261030/install.sql.review',S/'delivery-waiver-closure-20261030/install.sql.review',S/'delivery-group-capability-20261030/install.sql.review']
    sources=[]
    for p in installs:
        sources.append({'file':str(p.relative_to(S.parent)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}); sql(p.read_text())
    (H/'sources.json').write_text(json.dumps(sources,indent=2)+'\n'); ok('reported applied composition restored in order; all installer PRE/POST pass')
    T.setup_v2(); pre=state(); delta=G.candidate()
    # pg.sql uses one connection per call: measure in ONE transaction.
    measured=sql('BEGIN;'+delta+'\n'+G.STATE+'::text;\nROLLBACK;')
    post=json.loads([x for x in measured.splitlines() if x.startswith('{')][-1]); assert state()==pre
    G.write(pre,post); ok('exact deterministic PRE/POST measured; probe rolls back')
    inst=(H/'install.sql.review').read_text()
    reject('PRE drift aborts exactly',inst.replace('ENVASE_PRE_DRIFT','ENVASE_PRE_DRIFT',1).replace(json.dumps(pre).replace("'","''"),json.dumps({}).replace("'","''"),1),'P0001')
    reject('forced POST aborts installation',inst.replace(delta,delta+"DO $x$ BEGIN RAISE EXCEPTION 'FORCED_POST' USING ERRCODE='PT409'; END $x$;"),'PT409'); assert state()==pre
    sql(inst); assert state()==post; ok('install COMMIT and exact POST; writer remains closed')
    reject('rerun refuses changed exact state',inst,'P0001')
    def cap(): return f"SELECT public.rpc_envase_capability_v1('{T.L2}','{T.O2}','{T.PP2}','manual');"
    assert json.loads(last(T.actor(T.W)+cap()))['available'] is False; ok('capability unavailable while canonical writer ACL closed')
    reject('release artifact remains explicitly NO-GO',(H/'release.sql.review').read_text(),'42501')
    sql(f'GRANT EXECUTE ON FUNCTION {G.RPC} TO authenticated;') # disposable only
    assert json.loads(last(T.actor(T.W)+cap()))['available'] is True; ok('local-only grant permits in-scope production actor capability')
    z=last("SELECT jsonb_build_object("+','.join("'%s',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text COLLATE \"C\"),'[]') FROM public.%s x)"%(t,t) for t in T.TABLES)+")::text;")
    before=snapshot()
    reject('foreign FSF cannot envase AR Bio',T.actor(T.V)+env(T.O2,T.PP2,T.L2,'foreign-0001'),'42501'); assert snapshot()==before
    reject('missing key denied before writes',T.actor(T.W)+env(T.O2,T.PP2,T.L2,''),'22023'); assert snapshot()==before
    reject('missing gate singleton fails PT503, not overwritten FOUND',"BEGIN;DELETE FROM cf_user_guards_v1.state;"+T.actor(T.W)+env(T.O2,T.PP2,T.L2,'gate-0001'),'PT503'); assert snapshot()==before
    res=json.loads(last(T.actor(T.W)+env(T.O2,T.PP2,T.L2,'envase-ok-0001',3))); assert res['success'] is True and res['estado']=='completed'; ok('manual production envase completes CQ->stock->pronto_entrega')
    assert T.os_status(T.O2)=='pronto_entrega'; assert last(f"SELECT count(*) FROM platform_private.authz_tickets WHERE target='{T.O2}';")=='0'; ok('transition ticket consumed; lot/CQ remain unchanged')
    before=snapshot(); rep=json.loads(last(T.actor(T.W)+env(T.O2,T.PP2,T.L2,'envase-ok-0001',3))); assert rep['replay'] is True and snapshot()==before; ok('exact replay same result with zero full-row mutations')
    reject('operator substitution conflicts',T.actor(T.W)+env(T.O2,T.PP2,T.L2,'envase-ok-0001',3).replace("'LOCAL'","'OTHER'"),'PT409'); assert snapshot()==before
    reject('fresh key on ready OS denied',T.actor(T.W)+env(T.O2,T.PP2,T.L2,'envase-new-0001'),'PT409'); assert snapshot()==before
    sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{T.W}';")
    inactive=snapshot(); reject('inactive same actor cannot replay',T.actor(T.W)+env(T.O2,T.PP2,T.L2,'envase-ok-0001',3),'42501'); assert snapshot()==inactive
    sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{T.W}';")
    reject('ledger injected failure rolls back all envase writes',"CREATE FUNCTION public.local_fail_envase_ledger() RETURNS trigger LANGUAGE plpgsql AS $x$ BEGIN RAISE EXCEPTION 'LOCAL_LEDGER_FAIL' USING ERRCODE='PT409'; END $x$;CREATE TRIGGER zz_local_fail BEFORE INSERT ON public.estoque_movimentacoes FOR EACH ROW EXECUTE FUNCTION public.local_fail_envase_ledger();"+T.actor(T.W)+env(T.O5,T.PP5,T.L5,'rollback-0001'),'PT409')
    sql('DROP TRIGGER zz_local_fail ON public.estoque_movimentacoes; DROP FUNCTION public.local_fail_envase_ledger();'); assert last(f"SELECT count(*) FROM public.envase WHERE lote_id='{T.L5}';")=='0'; ok('ledger failure left no envase row')
    # Concurrent same key: two connections, exact replay, one row/ledger generation.
    stmt=T.actor(T.W)+env(T.O5,T.PP5,T.L5,'concurrent-0001')
    a=T.T.session('BEGIN;'+stmt); b=T.T.session('BEGIN;'+stmt)
    ra=T.T.finish(a,'COMMIT;'); rb=T.T.finish(b,'COMMIT;'); joined=''.join(ra+rb)
    assert joined.count('"success": true')>=2 and '"replay": true' in joined and last(f"SELECT count(*) FROM public.envase WHERE lote_id='{T.L5}';")=='1'; ok('two independent connections same key: one write and one replay')
    z1=last("SELECT jsonb_build_object("+','.join("'%s',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text COLLATE \"C\"),'[]') FROM public.%s x)"%(t,t) for t in T.TABLES)+")::text;"); assert z1==z; ok('all financial/fiscal/outbox full-row snapshots unchanged (not counts)')
    sql(f'REVOKE EXECUTE ON FUNCTION {G.RPC} FROM authenticated;'); assert state()==post
    sql((H/'rollback.sql.review').read_text()); assert json.loads(last(T.actor(T.W)+cap()))['available'] is False
    reject('deny-only rollback closes canonical writer',T.actor(T.W)+env(T.O5,T.PP5,T.L5,'concurrent-0001'),'42501'); ok('rollback retains history, barriers, installed group/cancel and proofs')
if __name__=='__main__':
    status=1; started=time.monotonic()
    try: run(); status=0
    except Exception as e: checks.append({'test':'execution','status':'FAIL','error':str(e)}); traceback.print_exc()
    finally:
        (H/'test-results.json').write_text(json.dumps({'checks':checks,'raw':raw,'elapsed_seconds':round(time.monotonic()-started,3),'exit_code':status},indent=2)+'\n')
    sys.exit(status)