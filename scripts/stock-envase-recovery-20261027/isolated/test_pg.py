"""Disposable full captured restore + externally reported applied composition. Never hosted."""
from pathlib import Path
import hashlib, json, os, re, subprocess, sys, time, traceback
H=Path(__file__).resolve().parent; S=H.parents[1]; V2=H.parent
sys.path.insert(0,str(S/'delivery-atomic-hardening-20261030'))
import restore
from restore import pg
sys.path.insert(0,str(V2)); import test_v2_pg as T
sys.path.insert(0,str(H)); import assemble as G
checks=[]; raw=[]
DOWNSTREAM=list(dict.fromkeys(T.TABLES+['financial_categories','payment_methods','receivable_payments','company_fiscal_settings']))
def ok(label): checks.append({'test':label,'status':'PASS'}); print('PASS',label,flush=True)
def sql(s): return pg.sql(s)
def last(s): return sql(s).splitlines()[-1]
def reject(label,s,code):
    r=subprocess.run(pg.psql(),input='\\set VERBOSITY verbose\n'+s,capture_output=True,text=True,timeout=40)
    raw.append({'test':label,'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
    assert r.returncode!=0 and re.search(r'ERROR:\s+'+code+r':',r.stderr), (label,r.stderr)
    ok(label)
def snapshot():
    tables=['envase','estoque_produto','estoque_movimentacoes','cockpit_operacao_idempotencia','laboratorio_esteira_eventos','ordens_servico','lotes','controle_qualidade','programacao_producao','financial_categories','payment_methods','receivable_payments','company_fiscal_settings']+T.TABLES
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
    for p in [V2/'candidate-v2.sql.review',H/'assemble.py',H/'test_pg.py']:
        sources.append({'file':str(p.relative_to(S.parent)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    (H/'sources.json').write_text(json.dumps(sources,indent=2)+'\n'); ok('reported applied composition restored in order; all installer PRE/POST pass')
    T.setup_v2()
    import sentinels
    sentinels.seed(sys.modules[__name__])
    pre=state(); delta=G.candidate()
    # pg.sql uses one connection per call: measure in ONE transaction.
    measured=sql('BEGIN;'+delta+'\n'+G.STATE+'::text;\nROLLBACK;')
    post=json.loads([x for x in measured.splitlines() if x.startswith('{')][-1]); assert state()==pre
    G.write(pre,post); ok('exact deterministic PRE/POST measured; probe rolls back')
    inst=(H/'install.sql.review').read_text()
    reject('PRE drift aborts exactly',inst.replace('ENVASE_PRE_DRIFT','ENVASE_PRE_DRIFT',1).replace(json.dumps(pre).replace("'","''"),json.dumps({}).replace("'","''"),1),'P0001')
    reject('forced POST aborts installation',inst.replace(delta,delta+"DO $x$ BEGIN RAISE EXCEPTION 'FORCED_POST' USING ERRCODE='PT409'; END $x$;"),'PT409'); assert state()==pre
    sql(inst); assert state()==post; ok('install COMMIT and exact POST; writer remains closed')
    closure=G.legacy_delta()
    measured=sql('BEGIN;'+closure+G.STATE+'::text;ROLLBACK;')
    closed=json.loads([x for x in measured.splitlines() if x.startswith('{')][-1]); G.write_legacy(post,closed)
    # Execute dedicated ACL closure only in a rolled-back local transaction.
    for sig,args in zip(G.LEGACY,[f"'{T.u(999)}','{{}}'::jsonb",f"'{T.u(999)}','{T.u(998)}','LOCAL'",f"'{T.u(999)}','{T.u(998)}'"]):
        reject('legacy client closure '+sig,'BEGIN;'+G.guard(post,'LEGACY_PRE_DRIFT')+closure+G.guard(closed,'LEGACY_POST_DRIFT')+T.actor()+f"SELECT {sig.split('(')[0]}({args});",'42501')
        assert state()==post
    sql('BEGIN;'+closure+(H/'legacy-closure-postflight.sql.review').read_text()+'ROLLBACK;'); assert state()==post
    ok('legacy exact POST and effective ACL closure verified; bodies/service grants unchanged')
    reject('rerun refuses changed exact state',inst,'P0001')
    def cap(): return f"SELECT public.rpc_envase_capability_v1('{T.L2}','{T.O2}','{T.PP2}','manual');"
    assert json.loads(last(T.actor(T.W)+cap()))['available'] is False; ok('capability unavailable while canonical writer ACL closed')
    reject('release artifact remains explicitly NO-GO',(H/'release.sql.review').read_text(),'42501')
    sql(f'GRANT EXECUTE ON FUNCTION {G.RPC} TO authenticated;') # disposable only
    assert json.loads(last(T.actor(T.W)+cap()))['available'] is True; ok('local-only grant permits in-scope production actor capability')
    z=last("SELECT jsonb_build_object("+','.join("'%s',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text COLLATE \"C\"),'[]') FROM public.%s x)"%(t,t) for t in DOWNSTREAM)+")::text;")
    before=snapshot()
    reject('foreign FSF cannot envase AR Bio',T.actor(T.V)+env(T.O2,T.PP2,T.L2,'foreign-0001'),'42501'); assert snapshot()==before
    reject('missing key denied before writes',T.actor(T.W)+env(T.O2,T.PP2,T.L2,''),'22023'); assert snapshot()==before
    reject('NULL key denied before writes',T.actor(T.W)+env(T.O2,T.PP2,T.L2,'null-key-0001').replace("'null-key-0001'","NULL"),'22023'); assert snapshot()==before
    reject('missing gate singleton fails PT503, not overwritten FOUND',"BEGIN;DELETE FROM cf_user_guards_v1.state;"+T.actor(T.W)+env(T.O2,T.PP2,T.L2,'gate-0001'),'PT503'); assert snapshot()==before
    res=json.loads(last(T.actor(T.W)+env(T.O2,T.PP2,T.L2,'envase-ok-0001',3))); assert res['success'] is True and res['estado']=='completed'; ok('manual production envase completes CQ->stock->pronto_entrega')
    assert last('SELECT count(*) FROM platform_private.envase_insert_permits_v1;')=='0'
    assert last(f"SELECT organization_id='{T.A}' FROM public.envase WHERE lote_id='{T.L2}';")=='t'
    ok('exact pre-trigger tenant payload accepted; every row permit consumed')
    if os.environ.get('ENVASE_TARGETED')=='1': return
    assert T.os_status(T.O2)=='pronto_entrega'; assert last(f"SELECT count(*) FROM platform_private.authz_tickets WHERE target='{T.O2}';")=='0'; ok('transition ticket consumed and OS ready')
    assert json.loads(last(T.actor(T.W)+cap()))['available'] is True; ok('endpoint capability remains available for exact replay after OS ready')
    before=snapshot(); rep=json.loads(last(T.actor(T.W)+env(T.O2,T.PP2,T.L2,'envase-ok-0001',3))); assert rep['replay'] is True and snapshot()==before; ok('exact replay same result with zero full-row mutations')
    reject('operator substitution conflicts',T.actor(T.W)+env(T.O2,T.PP2,T.L2,'envase-ok-0001',3).replace("'LOCAL'","'OTHER'"),'PT409'); assert snapshot()==before
    reason=env(T.O2,T.PP2,T.L2,'envase-ok-0001',3).replace('false,NULL','false,\'OTHER REASON\'')
    assert reason!=env(T.O2,T.PP2,T.L2,'envase-ok-0001',3), 'REASON_ANCHOR_MISSING'
    reject('partial reason substitution conflicts',T.actor(T.W)+reason,'PT409'); assert snapshot()==before
    receipt=last(f"SELECT idempotency_key FROM public.cockpit_operacao_idempotencia WHERE resultado->>'envase_release_fingerprint' IS NOT NULL LIMIT 1;")
    sql(f"UPDATE public.cockpit_operacao_idempotencia SET resultado=resultado-'envase_release_fingerprint' WHERE idempotency_key='{receipt}';")
    legacy=snapshot(); reject('legacy receipt without fingerprint denied unchanged',T.actor(T.W)+env(T.O2,T.PP2,T.L2,'envase-ok-0001',3),'PT409'); assert snapshot()==legacy
    # Restore the exact saved receipt locally; never infer fingerprint from the retry.
    saved=json.loads(before)['cockpit_operacao_idempotencia']; original=next(x['resultado'] for x in saved if x['idempotency_key']==receipt)
    sql(f"UPDATE public.cockpit_operacao_idempotencia SET resultado='{json.dumps(original)}'::jsonb WHERE idempotency_key='{receipt}';"); assert snapshot()==before
    reject('fresh key on ready OS denied',T.actor(T.W)+env(T.O2,T.PP2,T.L2,'envase-new-0001'),'PT409'); assert snapshot()==before
    sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{T.W}';")
    inactive=snapshot(); reject('inactive same actor cannot replay',T.actor(T.W)+env(T.O2,T.PP2,T.L2,'envase-ok-0001',3),'42501'); assert snapshot()==inactive
    sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{T.W}';")
    before=snapshot()
    reject('ledger injected failure rolls back all envase writes',"CREATE FUNCTION public.local_fail_envase_ledger() RETURNS trigger LANGUAGE plpgsql AS $x$ BEGIN RAISE EXCEPTION 'LOCAL_LEDGER_FAIL' USING ERRCODE='PT409'; END $x$;CREATE TRIGGER zz_local_fail BEFORE INSERT ON public.estoque_movimentacoes FOR EACH ROW EXECUTE FUNCTION public.local_fail_envase_ledger();"+T.actor(T.W)+env(T.O5,T.PP5,T.L5,'rollback-0001'),'PT409')
    sql('DROP TRIGGER zz_local_fail ON public.estoque_movimentacoes; DROP FUNCTION public.local_fail_envase_ledger();'); assert snapshot()==before; ok('ledger failure preserved full envase/stock/receipt/event/lot/CQ snapshots')
    # Concurrent same key: two connections, exact replay, one row/ledger generation.
    stmt=T.actor(T.W)+env(T.O5,T.PP5,T.L5,'concurrent-0001')
    a=T.T.session("BEGIN;SET application_name='samekey_a';"+stmt)
    for _ in range(100):
        if last("SELECT count(*) FROM pg_stat_activity WHERE application_name='samekey_a' AND state='idle in transaction';")=='1': break
        time.sleep(.02)
    else: raise AssertionError('FIRST_WORKER_NOT_FINISHED')
    b=T.T.session("BEGIN;SET application_name='samekey_b';"+stmt)
    for _ in range(100):
        if last("SELECT count(*) FROM pg_stat_activity WHERE application_name='samekey_b' AND wait_event_type='Lock';")=='1':break
        time.sleep(.02)
    else: raise AssertionError('SAME_KEY_WAIT_NOT_OBSERVED')
    ra=T.T.finish(a,'COMMIT;'); rb=T.T.finish(b,'COMMIT;'); joined=''.join(ra+rb)
    assert joined.count('"success": true')>=2 and '"replay": true' in joined and last(f"SELECT count(*) FROM public.envase WHERE lote_id='{T.L5}';")=='1',joined; ok('observed same-key wait: one write and one replay')
    # Assert actual worker lock wait before committing revocation (no timing-only PASS).
    holder=T.T.session(f"BEGIN; SELECT 1 FROM public.lotes WHERE id='{T.L6}' FOR UPDATE; UPDATE public.profiles SET ativo=false WHERE user_id='{T.W}';")
    worker=subprocess.Popen(pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    worker.stdin.write("\\set VERBOSITY verbose\nSET application_name='envase_revocation_worker';"+T.actor(T.W)+env(T.O6,T.PP6,T.L6,'revoke-wait-0001')+'\n'); worker.stdin.flush()
    waited=False
    for _ in range(30):
        if last("SELECT count(*) FROM pg_stat_activity WHERE application_name='envase_revocation_worker' AND wait_event_type='Lock';")=='1': waited=True; break
        time.sleep(.05)
    assert waited, 'REVOCATION_WORKER_NOT_OBSERVED_WAITING'
    T.T.finish(holder,'COMMIT;'); worker.stdin.close(); worker.stdin=None; wo,we=worker.communicate(timeout=30)
    assert re.search(r'ERROR:\s+42501:',we), we+wo
    assert last(f"SELECT count(*) FROM public.envase WHERE lote_id='{T.L6}';")=='0'; ok('active profile revoked during observed lote lock wait: 42501 and no envase')
    sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{T.W}';")
    # Test terminal/CQ changes committed while worker actually waits. Upstream changes
    # use replica ONLY as a fixture seam, not proof of authorization of those writers.
    def changed_during_wait(label,lock_sql,change_sql,stmt,code):
        holder=T.T.session('BEGIN;'+lock_sql+'SET LOCAL session_replication_role=replica;'+change_sql)
        worker=subprocess.Popen(pg.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        worker.stdin.write("\\set VERBOSITY verbose\nSET application_name='envase_terminal_worker';"+T.actor(T.W)+stmt+'\n'); worker.stdin.flush()
        waited=False
        for _ in range(100):
            if last("SELECT count(*) FROM pg_stat_activity WHERE application_name='envase_terminal_worker' AND wait_event_type='Lock';")=='1': waited=True; break
            time.sleep(.05)
        assert waited,'WORKER_NOT_WAITING'
        T.T.finish(holder,'COMMIT;'); expected=snapshot()
        worker.stdin.close(); worker.stdin=None; out,err=worker.communicate(timeout=30)
        raw.append({'test':label,'returncode':worker.returncode,'stdout':out,'stderr':err})
        assert worker.returncode!=0 and re.search(r'ERROR:\s+'+code+':',err),out+err
        assert snapshot()==expected; ok(label)
    changed_during_wait('terminal OS committed during observed OS wait denies partial before writes',f"SELECT 1 FROM public.ordens_servico WHERE id='{T.O6}' FOR UPDATE;",f"UPDATE public.ordens_servico SET status='finalizada' WHERE id='{T.O6}';",env(T.O6,T.PP6,T.L6,'terminal-wait-0001',1),'PT409')
    sql(f"SET session_replication_role=replica;UPDATE public.ordens_servico SET status='em_cq' WHERE id='{T.O6}';")
    changed_during_wait('CQ revoked during observed lote wait denies partial before writes',f"SELECT 1 FROM public.lotes WHERE id='{T.L6}' FOR UPDATE;",f"UPDATE public.controle_qualidade SET resultado='reprovado' WHERE lote_id='{T.L6}';",env(T.O6,T.PP6,T.L6,'cq-wait-0001',1),'P0001')
    sql(f"SET session_replication_role=replica;UPDATE public.controle_qualidade SET resultado='aprovado' WHERE lote_id='{T.L6}';")
    import matrix
    matrix.run(sys.modules[__name__])
    import permit_matrix
    permit_matrix.run(sys.modules[__name__])
    import cooperation
    cooperation.run(sys.modules[__name__])
    z1=last("SELECT jsonb_build_object("+','.join("'%s',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text COLLATE \"C\"),'[]') FROM public.%s x)"%(t,t) for t in DOWNSTREAM)+")::text;"); assert z1==z; ok('all fourteen financial/fiscal/outbox existing full-row snapshots unchanged')
    # Existing canonical proof regressions on locally created delivery, never hosted reference.
    owned=last(f"SELECT id FROM public.estoque_produto WHERE lote_id='{T.L2}' AND status='reservado';")
    grp=json.loads(last(T.actor()+T.group(T.O2,[{'item_id':owned,'quantidade':2}],'proof-regression-group')))
    entrega=grp['itens'][0]['entrega_id']; sg=f'entregas/{entrega}/assinaturas/{T.u(901)}.png'; fp=f'entregas/{entrega}/comprovantes/{T.u(902)}.pdf'
    sql("INSERT INTO storage.buckets(id,name,public) VALUES('entrega-documentos','entrega-documentos',false) ON CONFLICT DO NOTHING;"+f"INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('entrega-documentos','{sg}','{T.U}','{T.U}'),('entrega-documentos','{fp}','{T.U}','{T.U}');")
    gen=json.loads(last(T.actor()+f"SELECT public.rpc_entrega_formulario_gerar_v1('{entrega}','gen-isolated-0001');")); assert gen['success'] is True
    sig=json.loads(last(T.actor()+f"SELECT public.rpc_entrega_assinatura_coletar_v1('{entrega}','sig-isolated-0001','{json.dumps({'assinatura_digital_png_path':sg,'assinatura_hash':'a'*64,'recebedor_nome':'LOCAL','assinatura_user_agent':'local'})}'::jsonb);")); assert sig['success'] is True
    att=T.actor()+f"SELECT public.rpc_entrega_comprovante_anexar_v1('{entrega}','att-isolated-0001','{json.dumps({'arquivo_path':fp,'arquivo_nome':'local.pdf','arquivo_mime':'application/pdf','recebedor_nome':'LOCAL'})}'::jsonb);"
    assert json.loads(last(att))['success'] is True and json.loads(last(att))['replayed'] is True; ok('canonical generate/sign/attach and exact attachment replay preserved')
    reject('foreign FSF proof stays closed',T.actor(T.V)+f"SELECT public.rpc_entrega_formulario_gerar_v1('{entrega}','foreign-proof-0001');",'42501')
    sql(f'REVOKE EXECUTE ON FUNCTION {G.RPC} FROM authenticated;'); assert state()==post
    sql((H/'legacy-closure-install.sql.review').read_text()); assert state()==closed
    measured=sql('BEGIN;'+f'GRANT EXECUTE ON FUNCTION {G.RPC} TO authenticated;'+G.STATE+'::text;ROLLBACK;')
    released=json.loads([x for x in measured.splitlines() if x.startswith('{')][-1]); G.write_release(closed,released)
    sql((H/'release.sql.review').read_text()); assert state()==released
    ok('separate exact release installs only canonical authenticated grant after legacy closure')
    reject('release rerun rejects changed exact catalog',(H/'release.sql.review').read_text(),'P0001')
    hist=snapshot(); sql((H/'rollback.sql.review').read_text()); assert json.loads(last(T.actor(T.W)+cap()))['available'] is False and snapshot()==hist
    reject('deny-only rollback closes canonical writer',T.actor(T.W)+env(T.O5,T.PP5,T.L5,'concurrent-0001'),'42501'); ok('rollback preserves full-row historical snapshots')
if __name__=='__main__':
    status=1; started=time.monotonic()
    try: run(); status=0
    except Exception as e: checks.append({'test':'execution','status':'FAIL','error':str(e)}); traceback.print_exc()
    finally:
        (H/'test-results.json').write_text(json.dumps({'checks':checks,'raw':raw,'elapsed_seconds':round(time.monotonic()-started,3),'exit_code':status},indent=2)+'\n')
    sys.exit(status)