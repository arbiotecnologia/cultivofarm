# Faturamento parcial do controle: o que as rotinas efetivas permitem após entregas 1+1 (exec pelo runner).
SCN_F='POSITIVO-FISCAL'
ar_before=ar_for(PO);fF=forecast(PO)
ok(SCN_F,'após entrega integral sem NF: zero título B2B e previsão 20/20 (nenhuma integração por entrega)',ar_before==0 and fF['residual']==20,dict(ar=ar_before,f=fF))
for i,dl in enumerate(DL,1):
    el=m.call(X.UADM,f"public.fn_fiscal_invoice_eligibility('ENTREGA','{dl}')");rec(SCN_F,f'elegibilidade fiscal da entrega {i}','INFO',el)
el=m.call(X.UADM,f"public.fn_fiscal_invoice_eligibility('PARTNER_ORDER','{PO}')");rec(SCN_F,'elegibilidade fiscal do pedido de controle','INFO',el)
# Rascunho de NF pelo writer normal (sem emissão): uma por entrega, R$10.
FIN=[]
for i,dl in enumerate(DL,1):
    cust=d.last(f"SELECT coalesce((SELECT cliente_id::text FROM public.entregas WHERE id='{dl}'),'')") or None
    inv={'invoice_type':'NFE','document_model':'NFE','environment':'HOMOLOGATION','delivery_id':dl,'customer_id':cust,'series':'1'}
    items=[{'item_kind':'PRODUCT','product_id':PROD,'quantity':1,'unit_value':10,'description':'Embalagem 25 kg'}]
    r=m.call(X.UADM,f"public.rpc_fiscal_draft_save(NULL,'{js(inv)}'::jsonb,'{js(items)}'::jsonb,NULL)")
    rec(SCN_F,f'rascunho de NF da entrega {i} pelo writer normal','PASS' if r[0] is not None else 'BLOCKED',r);FIN.append(r)
FINDINGS.append('Rascunho/emissão de NF por entrega: '+json.dumps([ (x[0] is not None, (x[1] or '')[:160]) for x in FIN],ensure_ascii=False))
# Rotas efetivas de título após entrega (características, não sucesso fiscal):
gr=m.call(X.UFIN,f"public.generate_b2b_receivable_secure('{PO}')")
rec(SCN_F,'generate_b2b_receivable_secure (único título por pedido) após entrega integral sem NF','INFO',gr)
ar_mid=ar_for(PO)
if gr[0] is not None:
    FINDINGS.append(f'ACHADO: generate_b2b_receivable_secure gerou título do pedido inteiro sem NF autorizada (títulos={ar_mid}); contraria "título só após NF".')
    rec(SCN_F,'título sem NF autorizada pela rota efetiva por pedido','FINDING',dict(result=gr[0],titles=ar_mid))
else:
    ok(SCN_F,'rota por pedido não gera título sem NF (negada)',ar_mid==0,gr)
gd=m.call(X.UFIN,f"public.fn_generate_receivable_from_entrega('{DL[0]}','{js({'total_amount':10,'category_id':X.u(97),'installment_count':1,'fiscal_invoice_required':True})}'::jsonb)")
rec(SCN_F,'fn_generate_receivable_from_entrega (por entrega) sem NF','INFO',gd)
if gd[0] is not None:
    FINDINGS.append('ACHADO: fn_generate_receivable_from_entrega gerou título por entrega sem NF autorizada (fiscal PENDING).')
    rec(SCN_F,'título por entrega sem NF autorizada','FINDING',gd)
va=m.call(X.UADM,"public.rpc_fiscal_emitter_accounting_validate('validacao contabil sintetica do espelho descartavel')")
rec(SCN_F,'validação contábil da emitente pelo writer normal (admin)','INFO',va)
for who in (X.UGC,X.UFIN):
    pass
deny(SCN_C2,'PB após tentativa de validação contábil da emitente: LIVE approve continua bloqueado (snapshot C2 imutável, sem transição formal)',lambda: m.call(X.UGC,f"public.approve_partner_order('{PB}',NULL)"),'C2_ACCOUNTING_PENDING')
ok(SCN_C2,'PB final: previsão 20/20, 0 NF, 0 título, pedido inalterado',forecast(PB)==f0 and nfi(PB)==0 and ar_for(PB)==0)
rec(SCN_F,'positivo NF autorizada → 2 títulos/residual 20→10→0','BLOCKED','Transição não suportada pelas rotinas efetivas: não há evento de autorização na previsão, apply_authorization é service-only e não cria título; B4 por documento não está instalado. Não simulado por inserção.')
