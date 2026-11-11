# Controle positivo SEPARADO (executado via exec pelo runner; mesmas helpers). Pedido NÃO-C2-pendente, elegível no espelho.
# Somente rotinas efetivas; costuras declaradas; nenhum resultado final inserido diretamente.
SCN_P='POSITIVO-CONTROLE'
class Blocked(Exception): pass
def need(name,v,e=None):
    if v is None: rec(SCN_P,name,'BLOCKED',e);raise Blocked(name)
    return v
def sqlas(uid,q): 
    r=m.act(uid,q);return (r.stdout.strip().splitlines() or [''])[-1] if r.returncode==0 else None, (next((l for l in r.stderr.splitlines() if l.startswith('ERROR')),r.stderr[-300:]) if r.returncode else None)
try:
    PO=m.buyer_quote_order(pending_accounting=False)
    rq=m.respond_quote(PO)
    info=json.loads(d.last(f"SELECT jsonb_build_object('status',status,'contract',c2_external_origin_snapshot->>'contract','acc',c2_external_origin_snapshot->>'accounting_validated','total',total,'terms',(SELECT approval_status FROM public.partner_order_payment_terms t WHERE t.id=po.payment_terms_id),'rfa',requires_financial_approval)::text FROM public.partner_orders po WHERE id='{PO}'"))
    rec(SCN_P,'pedido de controle criado/cotado pelos writers reais (origem/contrato)','INFO',dict(order=PO,quote=rq[0] is not None,info=info))
    ok(SCN_P,'diferença de origem declarada: controle NÃO é C2 pendente contábil',info['contract']!='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1',info)
    seam('P1 controle positivo: pedido normal do mesmo parceiro/comprador criado com a configuração fiscal da emitente ATIVA (não é o PB-001042; origem difere)')
    # Previsão por aprovação do pedido normal: gate de criação + concessão exata (≤4h) somente no espelho.
    d.sql("UPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=true,reason='MIRROR_POSITIVE_CONTROL' WHERE singleton;")
    for a_ in (X.UGC,X.UADM,X.UFIN):
        d.sql(f"INSERT INTO platform_private.b2b_forecast_creation_allowlist_v1(id,actor_id,organization_id,partner_id,order_id,synthetic,valid_from,valid_until,created_by) VALUES(gen_random_uuid(),'{a_}','{X.A}','{X.P}','{PO}',true,now(),now()+interval '3 hours','{X.UADM}')")
    seam('P2 gate de criação de previsão ligado no espelho + concessões exatas ator/org/parceiro/pedido do controle (configuração)')
    ca=m.call(X.UGC,f"public.approve_partner_order('{PO}',NULL)");rec(SCN_P,'aprovação comercial LIVE do controle','PASS' if ca[0] is not None else 'BLOCKED',ca)
    if ca[0] is None:
        ca=m.call(X.UADM,f"public.approve_partner_order('{PO}',NULL)");rec(SCN_P,'aprovação comercial LIVE (admin)','PASS' if ca[0] is not None else 'BLOCKED',ca)
    need('aprovação comercial',ca[0],ca[1])
    st_=d.last(f"SELECT status||'|'||coalesce(credit_approved_at::text,'-')||'|'||financial_approval_status FROM public.partner_orders WHERE id='{PO}'")
    rec(SCN_P,'estado após aprovação comercial','INFO',st_)
    if 'aprovado' not in st_.split('|')[0]:
        cr=m.call(X.UFIN,f"public.approve_b2b_credit('{PO}',NULL)");rec(SCN_P,'aprovação de crédito LIVE','PASS' if cr[0] is not None else 'BLOCKED',cr);need('crédito',cr[0],cr[1])
    fP=forecast(PO);rec(SCN_P,'previsão do controle após aprovações','INFO',fP)
    rec(SCN_P,'títulos do controle após aprovação (antes de NF)','INFO',ar_for(PO))
    raise Blocked('stop-here-phase1')
except Blocked as b:
    rec(SCN_P,'cadeia interrompida em',"BLOCKED",str(b))
