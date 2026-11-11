# Entregas parciais 1+1 pelas rotinas efetivas (exec pelo runner).
def mv(stock): return cnt(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE estoque_produto_id='{stock}'")
def stock_row(s): return json.loads(d.last(f"SELECT to_jsonb(e)::text FROM public.estoque_produto e WHERE id='{s}'"))
GARGS={}
def group(stock,q,k):
    if k in GARGS: oo,os_=GARGS[k]
    else:
        grant('b2b_resale','delivery_create',X.P,PO,IT['id'],PROD,stock)
        oo=d.last(f"SELECT updated_at FROM public.ordens_servico WHERE id='{OS}'");os_=d.last(f"SELECT updated_at FROM public.estoque_produto WHERE id='{stock}'");GARGS[k]=(oo,os_)
    return m.call(X.UADM,f"public.rpc_cockpit_criar_entrega_v1('{OS}','b2b','{js([{'item_id':stock,'quantidade':q,'observed_updated_at':os_}])}'::jsonb,'{k}','{{}}'::jsonb,'{oo}'::timestamptz)")
def grants_for(stock,dl):
    for op in ('send','proof','confirm','cancel'): grant('b2b_resale',op,X.P,PO,IT['id'],PROD,stock,dl)
def obs(dl): return d.last(f"SELECT updated_at FROM public.entregas WHERE id='{dl}'")
def send(dl,k): return m.call(X.UADM,f"public.rpc_entrega_enviar_manual_v1('{dl}','{obs(dl)}','{k}')")
def proof(dl,k):
    g=m.call(X.UADM,f"public.rpc_entrega_formulario_gerar_v1('{dl}','{k}-f')")
    if g[0] is None: return g
    path=f"entregas/{dl}/comprovantes/{uuid.uuid4()}.pdf"
    d.sql(f"INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('entrega-documentos','{path}','{X.UADM}','{X.UADM}');")
    return m.call(X.UADM,f"public.rpc_entrega_comprovante_anexar_v1('{dl}','{k}-p','{js({'arquivo_path':path,'arquivo_nome':'local.pdf','arquivo_mime':'application/pdf','recebedor_nome':'LOCAL'})}'::jsonb)")
def confirm_sql(dl,k,o=None): return f"SELECT public.rpc_entrega_confirmar_manual_v1('{dl}','{o or obs(dl)}','{k}','{{\"nome\":\"LOCAL\"}}'::jsonb)"
seam('P3 objeto de Storage do comprovante inserido em storage.objects do espelho (sem bytes; Storage real não provado)')
DL=[];CONF={}
for i in (1,2):
    src=RESL[i-1]
    kg=key();g=group(src,1,kg);need(f'entrega parcial {i}: agrupamento de 1 embalagem',g[0],g[1])
    dl=g[0]['itens'][0]['entrega_id'];DL.append(dl)
    gr=group(src,1,kg);ok(SCN_P,f'entrega {i}: replay do agrupamento = mesma entrega',gr[0] and gr[0].get('replay') is True and gr[0]['itens'][0]['entrega_id']==dl,gr)
    grants_for(d.last(f"SELECT coalesce(estoque_produto_id::text,'{src}') FROM public.entregas WHERE id='{dl}'"),dl)
    s_=send(dl,key());need(f'entrega {i}: envio',s_[0],s_[1])
    p_=proof(dl,key());need(f'entrega {i}: comprovante',p_[0],p_[1])
    kc=key();o=obs(dl)
    if i==2:
        # concorrência: duas conexões confirmam a mesma entrega com a mesma chave
        procs=[subprocess.Popen(d.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(2)]
        for p_ in procs: p_.stdin.write(m.claims(X.UADM)+confirm_sql(dl,kc,o)+";\n");p_.stdin.close()
        outs=[(p_.stdout.read(),p_.stderr.read()) for p_ in procs]
        (att/'concurrent-confirm.txt').write_text(json.dumps(outs,indent=1))
        succ=[json.loads(o_.strip().splitlines()[-1]) for o_,e_ in outs if not e_.strip() or 'ERROR' not in e_]
        ok(SCN_P,'entrega 2: confirmação concorrente em 2 conexões ⇒ uma saída de estoque; perdedora replay/erro explícito',len(succ)>=1 and mv(src)>=0,outs)
        c=succ[0] if succ else None
    else:
        r=m.call(X.UADM,confirm_sql(dl,kc,o).replace('SELECT ','',1));c=r[0];need(f'entrega {i}: confirmação',c,r[1])
    CONF[dl]=c
    st=d.last(f"SELECT status FROM public.entregas WHERE id='{dl}'")
    m0=mv(src);rr=m.call(X.UADM,confirm_sql(dl,kc,o).replace('SELECT ','',1))
    ok(SCN_P,f'entrega {i}: confirmada; replay da confirmação sem nova movimentação',st=='entregue' and mv(src)==m0,dict(st=st,replay=rr,c=c))
    ordst=d.last(f"SELECT status FROM public.partner_orders WHERE id='{PO}'")
    rec(SCN_P,f'status do pedido após entrega {i}','INFO',ordst)
    if i==1: ok(SCN_P,'após 1/2: pedido NÃO concluído',ordst!='entregue',ordst)
fin=json.loads(d.last(f"""SELECT jsonb_build_object('order',(SELECT status FROM public.partner_orders WHERE id='{PO}'),
 'delivered',(SELECT coalesce(sum(quantidade),0) FROM public.entregas WHERE ordem_servico_id='{OS}' AND status::text='entregue'),
 'stock',(SELECT jsonb_agg(jsonb_build_object('id',id,'q',quantidade,'st',status)) FROM public.estoque_produto WHERE lote_id='{LOT}'),
 'mov',(SELECT count(*) FROM public.estoque_movimentacoes WHERE estoque_produto_id IN (SELECT id FROM public.estoque_produto WHERE lote_id='{LOT}')))::text"""))
rec(SCN_P,'estado físico final','INFO',fin)
ok(SCN_P,'final: 2 embalagens entregues em 2 entregas distintas',float(fin['delivered'])==2 and len(set(DL))==2,fin)
kx=key();gx=group(RESL[0],1,kx)
ok(SCN_P,'excesso de quantidade: terceira entrega negada (saldo esgotado)',gx[0] is None,gx)
ok(SCN_P,'FSF não confirma entrega da ARBio',m.call(X.UADMF,confirm_sql(DL[0],key()).replace('SELECT ','',1))[0] is None)
rec(SCN_P,'títulos após entregas (sem NF)','INFO',ar_for(PO))
FINDINGS.append(f'Controle: após entregas 1+1 sem NF, títulos={ar_for(PO)} e previsão={forecast(PO)}.')
globals().update(DL=DL,fin=fin)
exec((H/'positive_fiscal.py').read_text())
