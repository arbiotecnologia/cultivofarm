"""Focused tests via real canonical writers, never hosted. Called in temp composition."""
import hashlib, importlib.util, json, os, time
from pathlib import Path
H=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('reject_generator',H/'generate.py'); G=importlib.util.module_from_spec(spec);spec.loader.exec_module(G)

def run(B,Review,Q,A,choice,out):
    out=Path(out)/'seller-reject';out.mkdir(exist_ok=True)
    checks=[]; executed={}
    def ok(name,cond,detail=None):
        assert cond,(name,detail)
        checks.append(dict(test=name,status='PASS',detail=detail));print('REJECT_PASS',name,flush=True)
        (out/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
    def catalog():
        return json.loads(B.last(f"SELECT jsonb_build_object('md5',md5(pg_get_functiondef(p.oid)),'acl',(SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(p.proacl) a),'owner',pg_get_userbyid(p.proowner),'body',pg_get_functiondef(p.oid)) FROM pg_proc p WHERE p.oid='{G.SIG}'::regprocedure;"))
    def pending(label):
        sim,e=Q.sim(Q.UB,Q.P3,[Q.S(2)],choice); assert sim is not None,e
        jr,e=Q.call(Q.UB,f"public.recover_partner_order_attempt_v1('{Q.P}',NULL,NULL,false,NULL)");assert jr is not None,e
        if jr['state']=='committed':
            jr,e=Q.call(Q.UB,f"public.recover_partner_order_attempt_v1('{Q.P}','{jr['key']}',{jr['generation']},true,'{jr['order_id']}')");assert jr is not None,e
        cr,e=Q.create(Q.UB,Q.P3,[Q.S(2)],sim['cart_hash'],jr['key'],choice);assert cr is not None,e
        return cr['id']
    def state(order):
        return json.loads(B.last(f"SELECT jsonb_build_object('header',to_jsonb(po),'terms',(SELECT to_jsonb(t) FROM public.partner_order_payment_terms t WHERE t.id=po.payment_terms_id),'audits',(SELECT count(*) FROM public.partner_order_audit_logs WHERE order_id=po.id AND acao='payment_terms_rejected'),'notifications',(SELECT count(*) FROM public.notificacoes_operacionais)) FROM public.partner_orders po WHERE id='{order}';"))
    def sql(order,actor=None,reason='DECISAO LOCAL RENATO'):
        return B.T.actor(actor or Q.UFIN)+f"SELECT public.reject_b2b_payment_terms_secure('{order}','{reason}');"
    def denied(name,order,actor=None,reason='NEGATIVA LOCAL',prefix='',suffix='',token=None):
        before=state(order);r=B.run_raw(prefix+sql(order,actor,reason)+suffix)
        ok(name,r.returncode!=0 and (token is None or token in r.stderr) and state(order)==before,dict(exit=r.returncode,error=r.stderr[-700:]))
    live=G.SOURCE.read_text();B.sql(live+';');base=catalog()
    ok('LIVE exact body owner ACL',base['md5']==G.LIVE_MD5 and base['owner']=='postgres' and base['acl']==G.ACL,base)
    (out/'live-catalog.json').write_text(json.dumps(base,indent=2)+'\n')
    po=pending('real-reject');before=state(po)
    ok('normal buyer entry creates pending linked terms before commercial approval',before['terms']['approval_status']=='pending' and before['header']['approved_by'] is None and before['header']['approved_at'] is None,before)
    denied('reproduce 238 BLOCKED LIVE seller Financeiro',po,token='b2b_phase1_scope_denied')
    if os.environ.get('REJECT_MEASURE')=='1':
        B.sql(G.candidate()+';');cand=catalog();B.sql(G.rollback()+';');rb=catalog()
        (out/'measured-catalog.json').write_text(json.dumps(dict(candidate=cand,rollback=rb),indent=2)+'\n')
        print('REJECT_MEASURE',cand['md5'],rb['md5'],flush=True);return []
    shas=G.verify_on_disk()
    def execute(name):
        data=(H/name).read_bytes();sha=hashlib.sha256(data).hexdigest();assert sha==shas[name]
        executed.setdefault(name,[]).append(sha);return B.sql(data.decode())
    ok('PRE final exact bytes','PRE_PASS' in execute(G.FILES[0]));execute(G.FILES[1]);cand=catalog()
    ok('POST final exact bytes md5 owner ACL','POST_PASS' in execute(G.FILES[2]) and cand['md5']==G.CANDIDATE_MD5 and cand['acl']==base['acl'],cand)
    (out/'candidate-catalog.json').write_text(json.dumps(cand,indent=2)+'\n')
    denied('blank reason denied',po,reason='   ',token='reason_required')
    denied('buyer legacy denied',po,actor=Q.UB)
    denied('other company admin legacy denied',po,actor=Q.UADMF)
    denied('seller admin legacy denied',po,actor=Q.UADM)
    # Negative mutations are transactionally reverted, no trigger disabled.
    for label,mutation in (
        ('buyer link revoked',f"UPDATE public.partner_users SET revoked_at=now(),revoked_by='{Q.UFIN}',revoke_reason='LOCAL NEGATIVE' WHERE user_id='{Q.UB}' AND partner_id='{Q.P}';"),
        ('seller actor inactive',f"UPDATE public.profiles SET ativo=false WHERE user_id='{Q.UFIN}';"),
        ('seller actor wrong tenant',f"UPDATE public.profiles SET organization_id='{Q.F}' WHERE user_id='{Q.UFIN}';"),
    ):
        r=B.run_raw('BEGIN;'+mutation+sql(po)+'ROLLBACK;')
        ok(label+' fails closed',r.returncode!=0 and state(po)==before,r.stderr[-500:])
    # Real rejection, no header update: exactly one audit, no notification.
    rr=B.run_raw(sql(po));after=state(po)
    ok('real writer rejects pending terms with one audit header unchanged no notifications',rr.returncode==0 and after['terms']['approval_status']=='rejected' and after['terms']['approved_by']==Q.UFIN and after['terms']['approval_notes']=='DECISAO LOCAL RENATO' and after['header']==before['header'] and after['audits']==before['audits']+1 and after['notifications']==before['notifications'],dict(stdout=rr.stdout,stderr=rr.stderr,after=after))
    denied('rejected cannot be rejected again audit stays one',po,token='B2B_REJECT_STATE_CONFLICT')
    # Approved terms (real writer) cannot be reversed, even before commercial approval.
    ap=pending('terms-approved');r=Q.as_user(Q.UFIN,f"SELECT public.approve_b2b_payment_terms_secure('{ap}',NULL);");ok('real financial approval before commercial',r.returncode==0,r.stderr)
    denied('terms approved denied without reversing approver',ap,token='B2B_REJECT_STATE_CONFLICT')
    cp=pending('commercial-approved');r=Q.as_user(Q.UADM,f"SELECT public.approve_partner_order('{cp}',NULL,NULL);");ok('real commercial approval with pending terms',r.returncode==0,r.stderr)
    denied('commercial approved pending terms cannot reject',cp,token='B2B_REJECT_STATE_CONFLICT')
    def wait_for(holder):
        deadline=time.monotonic()+2.5
        while time.monotonic()<deadline:
            evidence=json.loads(B.last(f"SELECT coalesce(jsonb_agg(jsonb_build_object('pid',pid,'blocking',pg_blocking_pids(pid),'ungranted',EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted))),'[]'::jsonb) FROM pg_stat_activity a WHERE {holder}=ANY(pg_blocking_pids(pid));"))
            if any(x['ungranted'] for x in evidence):return evidence
            time.sleep(.03)
        raise AssertionError('SPECIFIC_HOLDER_WAIT_NOT_PROVEN')
    # Financial approval wins while rejection has already captured old child revision.
    ca=pending('approval-race')
    holder=B.T.session('BEGIN;'+B.T.actor(Q.UFIN)+f"SELECT public.approve_b2b_payment_terms_secure('{ca}',NULL);")
    time.sleep(.12)
    pid=B.last(f"SELECT pid FROM pg_stat_activity WHERE state='idle in transaction' AND query LIKE '%approve_b2b_payment_terms_secure%{ca}%';");assert pid
    waiter=B.T.session(sql(ca));evidence=wait_for(pid);ho,he=B.T.finish(holder,'COMMIT;');wo,we=B.T.finish(waiter)
    ok('approval vs reject real wait no reversal',not he and 'B2B_REJECT_CAS_CONFLICT' in we and state(ca)['terms']['approval_status']=='approved' and state(ca)['audits']==0,dict(wait=evidence,holder_error=he,waiter_error=we))
    # Commercial approval wins; rejection must re-read after parent wait.
    cc=pending('commercial-race')
    holder=B.T.session('BEGIN;'+B.T.actor(Q.UADM)+f"SELECT public.approve_partner_order('{cc}',NULL,NULL);");time.sleep(.12)
    pid=B.last(f"SELECT pid FROM pg_stat_activity WHERE state='idle in transaction' AND query LIKE '%approve_partner_order%{cc}%';");assert pid
    waiter=B.T.session(sql(cc));evidence=wait_for(pid);ho,he=B.T.finish(holder,'COMMIT;');wo,we=B.T.finish(waiter)
    ok('commercial approval vs reject real wait state revalidated',not he and 'B2B_REJECT_STATE_CONFLICT' in we and state(cc)['header']['approved_by'] is not None and state(cc)['terms']['approval_status']=='pending',dict(wait=evidence,holder_error=he,waiter_error=we))
    # Two rejections: one update and one audit, second CAS denies after wait.
    cr=pending('two-rejections');holder=B.T.session('BEGIN;'+sql(cr));time.sleep(.12)
    pid=B.last(f"SELECT pid FROM pg_stat_activity WHERE state='idle in transaction' AND query LIKE '%reject_b2b_payment_terms_secure%{cr}%';");assert pid
    waiter=B.T.session(sql(cr));evidence=wait_for(pid);ho,he=B.T.finish(holder,'COMMIT;');wo,we=B.T.finish(waiter)
    ok('two real rejections exactly one audit',not he and 'B2B_REJECT_CAS_CONFLICT' in we and state(cr)['audits']==1,dict(wait=evidence,error=we))
    # Authority expires while waiting on stock serialization gate.
    rv=pending('revoke-wait');holder=B.T.session('BEGIN;SELECT 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;');time.sleep(.12)
    pid=B.last("SELECT pid FROM pg_stat_activity WHERE state='idle in transaction' AND query LIKE '%cf_user_guards_v1.state%FOR UPDATE%';");assert pid
    waiter=B.T.session(sql(rv));evidence=wait_for(pid)
    # Profile guard shares this gate: revoke in the owning transaction, not a blocked third writer.
    ho,he=B.T.finish(holder,f"UPDATE public.profiles SET ativo=false WHERE user_id='{Q.UFIN}';COMMIT;");wo,we=B.T.finish(waiter)
    assert not he,he
    B.sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{Q.UFIN}';")
    ok('revocation after real gate wait denied without audit', 'B2B_REJECT_SCOPE_DENIED' in we and state(rv)['audits']==0,dict(wait=evidence,error=we))
    # Reuse immutable LLA final sources; replace only its obsolete BLOCKED test in temporary copy.
    lla=H.parent/'logistics-linked-approval-20261110/mirror_flow.py'
    original=lla.read_text();start=original.index('    # ---- 4b.');end=original.index('    # ---- 5.',start)
    replacement=f'''    # Real reject writer tested above; its linked rejected order remains closed.
    rej_order='{po}'
    rej_item=B.last("SELECT id FROM public.partner_order_items WHERE order_id='{{}}' ORDER BY id LIMIT 1;".format(rej_order))
    rej_prod=B.last("SELECT product_id FROM public.partner_order_items WHERE id='{{}}';".format(rej_item))
    grant("b2b_resale","os_create",Q.P,rej_order,rej_item,rej_prod)
    rr=B.run_raw(R.os_create_sql(rej_order,rej_item,B.last("SELECT updated_at FROM public.partner_orders WHERE id='{{}}';".format(rej_order)),"reject-real-os"))
    ok("real rejected terms deny OS with exact grant",rr.returncode!=0 and "B2B_RESALE_ORDER_CONFLICT" in rr.stderr,err(rr))
'''
    temp=original[:start]+replacement+original[end:]
    # Real reservation holds gate; concurrent reject waits, then denies without undoing receipt.
    anchor='    k1 = f"lla-res1-{rid}"; r1 = json.loads(B.last(reserve_sql(lot1, 3, k1))); s1 = r1["itens"][0]; m_after1 = mv()'
    assert temp.count(anchor)==1
    replacement='''    k1 = f"lla-res1-{rid}"
    holder=B.T.session("BEGIN;"+reserve_sql(lot1,3,k1));time.sleep(.12)
    pid=B.last("SELECT pid FROM pg_stat_activity WHERE state='idle in transaction' AND query LIKE '%rpc_estoque_reservar_v1%"+k1+"%';")
    assert pid
    waiter=B.T.session(reject_sql(order));evidence=reject_wait(pid)
    ho,he=B.T.finish(holder,"COMMIT;");wo,we=B.T.finish(waiter)
    assert not he,he
    r1=json.loads(ho.strip().splitlines()[-1]);s1=r1["itens"][0];m_after1=mv()
    ok("reserve vs reject waits on same stock gate and cannot undo approval/reservation", "B2B_REJECT_STATE_CONFLICT" in we and r1["replay"] is False, {"wait":evidence,"error":we})
'''
    temp=temp.replace(anchor,replacement);lla.write_text(temp)
    (out/'lla-temp-test-delta.json').write_text(json.dumps(dict(original_sha=hashlib.sha256(original.encode()).hexdigest(),temp_sha=hashlib.sha256(temp.encode()).hexdigest(),candidate_sql_unchanged=True,reason='replace obsolete BLOCKED scenario and instrument actual reserve/reject race only in temporary harness'),indent=2)+'\n')
    sp=importlib.util.spec_from_file_location('reject_lla',lla);m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
    m.reject_sql=sql;m.reject_wait=wait_for
    lr=m.run(B,Review,Q,A,choice,Path(out).parent)
    ok('partial 3/5 to 5/5 regression and six-body rollback exact bytes',all(x['status']=='PASS' for x in lr),len(lr))
    hist=state(po);execute(G.FILES[3]);rb=catalog()
    ok('rollback restores exact LIVE preserves history header audit ACL',rb['md5']==G.LIVE_MD5 and rb['acl']==base['acl'] and state(po)==hist,rb)
    denied('rollback closes extension via original scope',rv,token='b2b_phase1_scope_denied')
    rerun=B.run_raw((H/G.FILES[3]).read_text())
    ok('rollback rerun refuses noncandidate without overwrite',rerun.returncode!=0 and 'B2B_REJECT_CATALOG_DRIFT' in rerun.stderr and catalog()==rb)
    (out/'rollback-catalog.json').write_text(json.dumps(rb,indent=2)+'\n')
    (out/'executed-sha256.json').write_text(json.dumps(dict(final_files=shas,executed=executed),indent=2)+'\n')
    return checks