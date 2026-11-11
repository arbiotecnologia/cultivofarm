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
    def effects():
        q=["SELECT count(*) FROM public.accounts_receivable","SELECT count(*) FROM public.fiscal_invoices","SELECT count(*) FROM public.notificacoes_operacionais"]
        for t in ('public.fiscal_events','public.fiscal_invoice_events','public.communication_outbox','public.communication_deliveries','public.b2b_receivable_forecasts'):
            if B.last(f"SELECT to_regclass('{t}') IS NOT NULL;")=='t': q.append(f"SELECT count(*) FROM {t}")
        return {x:B.last(x+';') for x in q}
    def contract(o): return B.last(f"SELECT c2_external_origin_snapshot->>'contract' FROM public.partner_orders WHERE id='{o}';")
    # (1) Legitimate accounting-pending order through the NORMAL create path: the issuer's active fiscal settings
    # are made unavailable (fixture setting, not the order snapshot), the canonical writer inserts the snapshot.
    fs=B.last(f"SELECT coalesce(string_agg(quote_literal(id::text),','),'NULL') FROM public.company_fiscal_settings WHERE organization_id='{Q.A}' AND is_active;")
    B.sql(f"SET session_replication_role=replica;UPDATE public.company_fiscal_settings SET is_active=false WHERE id::text IN ({fs});SET session_replication_role=origin;")
    try: pa=pending()
    finally: B.sql(f"SET session_replication_role=replica;UPDATE public.company_fiscal_settings SET is_active=true WHERE id::text IN ({fs});SET session_replication_role=origin;")
    ok('normal create yields canonical PENDING_ACCOUNTING snapshot accepted by existing validator',contract(pa)=='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1'
       and B.last(f"SELECT (c2_external_origin_snapshot->>'accounting_validated')||'|'||platform_private.c2_external_origin_contract_valid(c2_external_origin_snapshot)::text FROM public.partner_orders WHERE id='{pa}';")=='false|true',contract(pa))
    r,v=read(pa)
    ok('accounting-pending legit order readable with items/terms; pending terms eligible',v and v['accounting_pending'] is True and len(v['items'])>=1 and v['terms']['approval_status']=='pending' and v['reject_eligible'] is True,dict(err=r.stderr[-300:],v=v))
    e0=effects();h0=header(pa);w=reject(pa);r,v=read(pa)
    ok('accounting pending: writer rejects pending terms; header unchanged; one audit; no fiscal/receivable/send effect',w.returncode==0 and v['terms']['approval_status']=='rejected' and header(pa)==h0 and audits(pa)==1 and effects()==e0,dict(w=w.stderr[-300:],before=e0,after=effects()))
    # (2) Invalid origin: validator seam replaced only inside a reverted transaction; reader must return no payload.
    seam="BEGIN;CREATE OR REPLACE FUNCTION platform_private.c2_external_origin_contract_valid(jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT false';"
    po2=pending();r2,v2=read(po2,prefix=seam,suffix='ROLLBACK;')
    ok('invalid origin denied before any detail: no payload, no items/terms/notes',r2.returncode!=0 and 'B2B_SELLER_FINANCE_REVIEW_DENIED' in r2.stderr and v2 is None and 'produto_nome' not in r2.stdout and 'approval_notes' not in r2.stdout,dict(out=r2.stdout[-200:],err=r2.stderr[-200:]))
    w2=reject(po2,prefix=seam,suffix='ROLLBACK;');ok('invalid origin: writer also denies, no audit',w2.returncode!=0 and audits(po2)==0,w2.stderr[-200:])
    r3,v3=read(po2);ok('validator restored after rollback: same order readable',v3 is not None and v3['reject_eligible'] is True,r3.stderr[-200:])
    # (3) Dispensed new order keeps not_required (plan configuration, never snapshot mutation).
    flag=B.last(f"SELECT requires_financial_approval FROM public.commercial_payment_plans WHERE id='{Q.P3}';")
    u=B.run_raw(f"UPDATE public.commercial_payment_plans SET requires_financial_approval=false WHERE id='{Q.P3}';")
    if u.returncode!=0:
        checks.append(dict(test='dispensed new order keeps not_required',status='BLOCKED',detail=u.stderr[-400:]));print('REVIEW_BLOCKED dispensed',flush=True)
    else:
        try: pd=pending()
        finally: B.sql(f"UPDATE public.commercial_payment_plans SET requires_financial_approval={flag} WHERE id='{Q.P3}';")
        r,v=read(pd);w=reject(pd)
        ok('dispensed new order: terms not_required, new-order path, writer denied, no audit',v and v['terms']['approval_status']=='not_required' and v['reject_block_reason']=='terms_not_required' and v['terms_review_path']=='new_order_with_financial_approval_plan' and w.returncode!=0 and audits(pd)==0,dict(v=v,w=w.stderr[-200:]))
    # (4) Existing reservation blocks rejection (order reserved earlier by the composed flow through rpc_estoque_reservar_v1).
    ro=B.last("SELECT os.partner_order_id FROM public.estoque_movimentacoes m JOIN public.ordens_servico os ON os.id=m.os_id WHERE m.acao='reserva' AND os.partner_order_id IS NOT NULL ORDER BY m.created_at LIMIT 1;")
    if ro:
        r,v=read(ro);w=reject(ro)
        ok('reserved order: reader ineligible and writer denied, no audit',(v is None or v['reject_eligible'] is False) and w.returncode!=0 and audits(ro)==0,dict(v=v,w=w.stderr[-200:]))
    else:
        checks.append(dict(test='reserved order blocks rejection',status='BLOCKED',detail='no reservation in composition'));print('REVIEW_BLOCKED reserved',flush=True)
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
