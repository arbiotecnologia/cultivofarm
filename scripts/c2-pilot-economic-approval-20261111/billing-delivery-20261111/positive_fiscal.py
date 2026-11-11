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
    r=m.call(X.UADM,f"public.rpc_fiscal_draft_save(NULL,'{js({'source_type':'ENTREGA','source_id':dl,'document_model':'NFE','partner_order_id':PO,'delivery_id':dl,'total_amount':10})}'::jsonb,'[]'::jsonb,NULL)")
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
rec(SCN_F,'positivo NF autorizada → 2 títulos/residual 20→10→0','BLOCKED','Transição não suportada pelas rotinas efetivas: não há evento de autorização na previsão, apply_authorization é service-only e não cria título; B4 por documento não está instalado. Não simulado por inserção.')
