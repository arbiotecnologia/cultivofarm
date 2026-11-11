"""Reader tests through real canonical writers in the temp composition; never hosted."""
import hashlib, importlib.util, json, os
from pathlib import Path
H=Path(__file__).resolve().parent
def load(n,p):
    s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
G=load('review_gen',H/'generate.py');RG=load('reject_gen',H.parent/'seller-reject-pending-20261111/generate.py')
def run(B,Review,Q,A,choice,out):
    out=Path(out)/'seller-finance-review';out.mkdir(exist_ok=True);checks=[];executed={}
    def ok(name,cond,detail=None):
        st='PASS' if cond else 'FAIL'
        checks.append(dict(test=name,status=st,detail=detail));print('REVIEW_'+st,name,flush=True)
        (out/'checks.json').write_text(json.dumps(checks,indent=2,default=str)+'\n')
        assert cond,(name,detail)
    def pending():
        sim,e=Q.sim(Q.UB,Q.P3,[Q.S(2)],choice);assert sim is not None,e
        jr,e=Q.call(Q.UB,f"public.recover_partner_order_attempt_v1('{Q.P}',NULL,NULL,false,NULL)");assert jr is not None,e
        if jr['state']=='committed':
            jr,e=Q.call(Q.UB,f"public.recover_partner_order_attempt_v1('{Q.P}','{jr['key']}',{jr['generation']},true,'{jr['order_id']}')");assert jr is not None,e
        cr,e=Q.create(Q.UB,Q.P3,[Q.S(2)],sim['cart_hash'],jr['key'],choice);assert cr is not None,e
        return cr['id']
    def read(order,actor=None,prefix='',suffix=''):
        r=B.run_raw(prefix+B.T.actor(actor or Q.UFIN)+f"SELECT public.get_b2b_seller_finance_order_review_v1('{order}');"+suffix)
        val=None
        if r.returncode==0:
            lines=[l for l in r.stdout.splitlines() if l.startswith('{')]
            val=json.loads(lines[-1]) if lines else None
        return r,val
    def reject(order,actor=None,prefix='',suffix=''):
        return B.run_raw(prefix+B.T.actor(actor or Q.UFIN)+f"SELECT public.reject_b2b_payment_terms_secure('{order}','REVISAO FINANCEIRO LOCAL');"+suffix)
    def audits(o): return int(B.last(f"SELECT count(*) FROM public.partner_order_audit_logs WHERE order_id='{o}' AND acao='payment_terms_rejected';"))
    def header(o): return B.last(f"SELECT md5(to_jsonb(po)::text) FROM public.partner_orders po WHERE id='{o}';")
    notif=lambda: int(B.last("SELECT count(*) FROM public.notificacoes_operacionais;"))
    def execute(shas,folder,name):
        data=(folder/name).read_bytes();sha=hashlib.sha256(data).hexdigest();assert sha==shas[name],name
        executed.setdefault(f'{folder.name}/{name}',[]).append(sha);return B.sql(data.decode())
    # Installed reject (reported installed by auditor) = its exact final bytes.
    rshas=RG.verify_on_disk();rf=H.parent/'seller-reject-pending-20261111'
    for n in RG.FILES[:3]: execute(rshas,rf,n)
    if os.environ.get('REVIEW_MEASURE')=='1':
        B.sql(G.body()+';');m=B.last(f"SELECT md5(pg_get_functiondef('{G.SIG}'::regprocedure));")
        print('REVIEW_MEASURE',m,flush=True);B.sql(f'DROP FUNCTION {G.SIG};');return []
    shas=G.verify_on_disk()
    ok('PRE exact bytes','PRE_PASS' in execute(shas,H,G.FILES[0]));execute(shas,H,G.FILES[1])
    ok('POST exact bytes md5 owner ACL','POST_PASS' in execute(shas,H,G.FILES[2]))
    po=pending();r,v=read(po)
    ok('seller Financeiro reads external order items/terms canonically',v and v['contract']=='B2B_SELLER_FINANCE_ORDER_REVIEW_V1' and v['origin']=='external_partner' and len(v['items'])>=1 and all(i['produto_nome'] for i in v['items']) and v['terms']['approval_status']=='pending',dict(err=r.stderr[-400:],v=v))
    ok('pending terms before commercial/reserve are eligible',v['reject_eligible'] is True and v['reject_block_reason'] is None,v)
    for label,actor in (('buyer',Q.UB),('seller admin',Q.UADM),('foreign company admin',Q.UADMF)):
        r2,v2=read(po,actor);ok(f'{label} denied reader',r2.returncode!=0 and 'B2B_SELLER_FINANCE_REVIEW_DENIED' in r2.stderr,r2.stderr[-300:])
    for label,mut in (('buyer link revoked',f"UPDATE public.partner_users SET revoked_at=now(),revoked_by='{Q.UFIN}',revoke_reason='LOCAL NEGATIVE' WHERE user_id='{Q.UB}' AND partner_id='{Q.P}';"),
                      ('Financeiro inactive',f"UPDATE public.profiles SET ativo=false WHERE user_id='{Q.UFIN}';"),
                      ('Financeiro other tenant',f"UPDATE public.profiles SET organization_id='{Q.F}' WHERE user_id='{Q.UFIN}';")):
        r2,_=read(po,prefix='BEGIN;'+mut,suffix='ROLLBACK;');ok(label+' reader fails closed',r2.returncode!=0,r2.stderr[-300:])
    # Synthetic transactional seams (reverted): not_required and accounting pending.
    for label,mut,code in (('not_required frozen terms',f"UPDATE public.partner_order_payment_terms SET approval_status='not_required' WHERE partner_order_id='{po}';",'terms_not_required'),
                           ('accounting pending snapshot',f"UPDATE public.partner_orders SET c2_external_origin_snapshot=c2_external_origin_snapshot||jsonb_build_object('contract','C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1','accounting_validated',false) WHERE id='{po}';",'accounting_pending')):
        h0=header(po);r2,v2=read(po,prefix='BEGIN;'+mut,suffix='ROLLBACK;')
        w=reject(po,prefix='BEGIN;'+mut,suffix='ROLLBACK;')
        if r2.returncode!=0:
            checks.append(dict(test=label,status='BLOCKED',detail=r2.stderr[-600:]));print('REVIEW_BLOCKED',label,flush=True);continue
        ok(label+': not eligible, writer denied, no change',v2['reject_eligible'] is False and v2['reject_block_reason']==code and w.returncode!=0 and header(po)==h0 and audits(po)==0,dict(v=v2,w=w.stderr[-300:]))
        if code=='terms_not_required': ok('not_required documents new-order path, terms never shown pending',v2['terms']['approval_status']=='not_required' and v2['terms_review_path']=='new_order_with_financial_approval_plan',v2)
    h0=header(po);n0=notif();w=reject(po);r,v=read(po)
    ok('installed writer rejects; reader reflects rejected; header unchanged; one audit; no notification',w.returncode==0 and v['terms']['approval_status']=='rejected' and v['reject_eligible'] is False and v['reject_block_reason']=='terms_decided' and header(po)==h0 and audits(po)==1 and notif()==n0,dict(w=w.stderr[-300:],v=v))
    w2=reject(po);ok('repeat rejection denied, still one audit',w2.returncode!=0 and audits(po)==1,w2.stderr[-300:])
    cp=pending();ar=Q.as_user(Q.UADM,f"SELECT public.approve_partner_order('{cp}',NULL,NULL);");assert ar.returncode==0,ar.stderr
    r,v=read(cp);w=reject(cp)
    ok('commercial approved: reader ineligible and writer denied',v['reject_eligible'] is False and v['reject_block_reason']=='commercial_approved' and v['terms']['approval_status']=='pending' and w.returncode!=0 and audits(cp)==0,dict(v=v,w=w.stderr[-300:]))
    ap=pending();ar=Q.as_user(Q.UFIN,f"SELECT public.approve_b2b_payment_terms_secure('{ap}',NULL);");assert ar.returncode==0,ar.stderr
    r,v=read(ap);ok('approved terms never reversible',v['reject_block_reason']=='terms_decided' and reject(ap).returncode!=0 and audits(ap)==0,v)
    rec=int(B.last("SELECT count(*) FROM public.accounts_receivable;"));fis=int(B.last("SELECT count(*) FROM public.fiscal_invoices;"))
    ok('reader causes no receivable/fiscal rows',rec==int(B.last("SELECT count(*) FROM public.accounts_receivable;")) and fis==int(B.last("SELECT count(*) FROM public.fiscal_invoices;")),dict(receivables=rec,fiscal=fis))
    ok('ROLLBACK exact bytes drops only candidate','ROLLBACK_PASS' in execute(shas,H,G.FILES[3]) and B.last(f"SELECT to_regprocedure('{G.SIG}') IS NULL;")=='t')
    rr=B.run_raw((H/G.FILES[3]).read_text());ok('rollback rerun refuses drift',rr.returncode!=0 and 'REVIEW_READER_CATALOG_DRIFT' in rr.stderr,rr.stderr[-300:])
    (out/'executed-sha256.json').write_text(json.dumps(dict(final=shas,executed=executed),indent=2)+'\n')
    return checks
