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
    ok(SCN_P,'controle: previsão 20/20 aguardando_fiscal e zero título antes de NF',fP and fP['total']==20 and fP['residual']==20 and fP['state']=='aguardando_fiscal' and ar_for(PO)==0,dict(f=fP,ar=ar_for(PO)))
    IT=json.loads(d.last(f"SELECT to_jsonb(i)::text FROM public.partner_order_items i WHERE order_id='{PO}' LIMIT 1"))
    PROD,PACK=IT['product_id'],IT['packaging_id_snapshot']
    grant('finished_product','purchase',product=PROD)
    def buy(q,k): return m.call(X.UADM,f"public.rpc_finished_product_purchase_entry_v1('{PROD}','{PACK}','LOTE-{k}',{q},'COMPRA-{k}','FORNECEDOR FICTICIO','{k}','2028-12-31')")
    kb=key();b1=buy(2,kb);need('compra de produto acabado para revenda (2 embalagens)',b1[0],b1[1])
    b1r=buy(2,kb);ok(SCN_P,'compra: replay mesma chave = mesmo recibo, sem nova movimentação',b1r[0] and b1r[0].get('replay') is True and b1r[0].get('estoque_produto_id')==b1[0]['estoque_produto_id'],b1r)
    STK=b1[0]['estoque_produto_id'];LOT=b1[0]['lote_id']
    s0=json.loads(d.last(f"SELECT jsonb_build_object('q',quantidade,'st',status,'lot',lote_id,'org',(SELECT organization_id FROM public.lotes WHERE id=lote_id))::text FROM public.estoque_produto WHERE id='{STK}'"))
    ok(SCN_P,'estoque de revenda: lote próprio do tenant A, quantidade 2',s0['org']==X.A and float(s0['q'])==2,s0)
    grant('b2b_resale','os_create',X.P,PO,IT['id'],PROD)
    upd=d.last(f"SELECT updated_at FROM public.partner_orders WHERE id='{PO}'")
    ko=key();os_=m.call(X.UADM,f"public.rpc_b2b_resale_os_create_v1('{PO}','{IT['id']}','{upd}'::timestamptz,'{ko}')");need('OS de revenda',os_[0],os_[1])
    OS=os_[0]['os_id'];ok(SCN_P,'OS de revenda criada (não biológica)',bool(OS),os_)
    os_r=m.call(X.UADM,f"public.rpc_b2b_resale_os_create_v1('{PO}','{IT['id']}','{upd}'::timestamptz,'{ko}')");ok(SCN_P,'OS replay: mesma OS',os_r[0] and os_r[0].get('os_id')==OS,os_r)
    GRES=grant('b2b_resale','reserve',X.P,PO,IT['id'],PROD,STK)
    def reserve(stock,q,k): return m.call(X.UADM,f"public.rpc_estoque_reservar_v1('{OS}','b2b','{js([{'item_id':stock,'quantidade':q}])}'::jsonb,'{k}','{js({'partner_id':X.P,'partner_order_id':PO})}'::jsonb)")
    # Motor efetivo: a entrega consome a linha reservada inteira (quantidade == reservada); parcial 1+1 = duas reservas de 1 (split).
    RESL=[];KR=[]
    for i in (1,2):
        kr=key();rv=reserve(STK,1,kr);need(f'reserva {i} de 1 embalagem',rv[0],rv[1]);RESL.append(rv[0]['itens'][0]);KR.append(kr)
        rvr=reserve(STK,1,kr);ok(SCN_P,f'reserva {i}: replay mesma chave = mesmo recibo, sem nova linha',rvr[0] and rvr[0].get('replay') is True and rvr[0]['itens']==rv[0]['itens'],rvr)
        if i==1: d.sql(f"UPDATE platform_private.resale_pilot_allowlist_v1 SET stock_id='{RESL[0]}' WHERE id='{GRES}'");GRES2=grant('b2b_resale','reserve',X.P,PO,IT['id'],PROD,STK)
        else: d.sql(f"UPDATE platform_private.resale_pilot_allowlist_v1 SET stock_id='{RESL[1]}' WHERE id='{GRES2}'")
    seam('P4 concessão de reserva re-apontada para a linha reservada devolvida pelo motor (configuração da allowlist, como logistics-linked-approval)')
    ok(SCN_P,'duas linhas reservadas distintas de 1 embalagem',len(set(RESL))==2 and cnt(f"SELECT count(*) FROM public.estoque_produto WHERE reservado_para_os_id='{OS}' AND status::text='reservado' AND quantidade=1")==2)
    grant('b2b_resale','reserve',X.P,PO,IT['id'],PROD,STK)
    rx=reserve(STK,1,key());ok(SCN_P,'reserva além das 2 embalagens compradas negada',rx[0] is None,rx)
    RES=None;rv=None;kr=None
    rec(SCN_P,'linhas reservadas','INFO',RESL)
    globals().update(RESL=RESL,PO=PO,IT=IT,PROD=PROD,PACK=PACK,STK=STK,LOT=LOT,OS=OS,RES=RES,reserve=reserve,kr=kr,rv=rv)
    rec(SCN_P,'recibo de reserva','INFO',rv[0])
    exec((H/'positive_delivery.py').read_text())
except Blocked as b:
    rec(SCN_P,'cadeia interrompida em',"BLOCKED",str(b))
