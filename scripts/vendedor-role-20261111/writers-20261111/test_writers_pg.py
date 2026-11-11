#!/usr/bin/env python3
"""Testes do delta de writers do Vendedor no espelho composto restaurado (PostgreSQL descartável).
Executa os bytes finais 01c/02c/03c/04c com SHA conferido. Auth sintética: não prova JWT/RLS/Storage hospedados."""
import hashlib,json,subprocess,sys,threading,time
from pathlib import Path
H=Path(__file__).resolve().parent;sys.path.insert(0,str(H))
import mirror_db
u=lambda n:f"00000000-0000-0000-0000-{n:012d}"
A='007bb519-cba0-4704-be2c-cb93ad010048';F=u(2)
P,PNA,P2,PF=u(11),u(12),u(85),u(13)
UB,UT,UADM,UFIN,UGC=u(21),u(22),u(24),u(29),u(30)
V1,V2,VB,VX=u(901),u(902),u(903),u(904)
P3,PLQ=u(81),u(72)
ITEMS=[{"item_id":u(32),"item_tipo":"produto","packaging_id":u(51),"quantidade":1}]
CH={"payment_method":"boleto","payment_condition_version":2,"payment_deadline_days":30}
checks=[];executed={}
def ok(name,cond,detail=None):
    checks.append(dict(test=name,status='PASS' if cond else 'FAIL',detail=None if cond else str(detail)[:900]))
    print(('PASS ' if cond else 'FAIL ')+name,'' if cond else str(detail)[:400],flush=True)
d=mirror_db.DB(55761)
js=lambda x:json.dumps(x).replace("'","''")
def act(uid,s,pre=''):
    return d.raw("\\set VERBOSITY verbose\n"+pre+f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claims='"+json.dumps({'sub':uid,'role':'authenticated','iat':1})+"';"+s)
def call(uid,expr,pre=''):
    r=act(uid,f"SELECT ({expr})::text;",pre)
    if r.returncode: return None,next((l for l in r.stderr.splitlines() if l.startswith('ERROR:')),r.stderr.strip()[:200])
    lines=r.stdout.strip().splitlines();v=lines[-1] if lines else ''
    try: return json.loads(v),None
    except Exception: return (v if v else True),None
FP_SQL="""SELECT md5(concat_ws('|',
 (SELECT count(*)||':'||coalesce(md5(string_agg(id::text||status::text||coalesce(updated_at::text,''),',' ORDER BY id)),'') FROM public.partner_orders),
 (SELECT count(*) FROM public.partner_order_items),(SELECT count(*) FROM public.partner_order_payment_terms),
 (SELECT count(*) FROM platform_private.b2b_quote_response_receipts),(SELECT count(*) FROM public.partner_order_idempotency),
 (SELECT count(*)||':'||count(revoked_at) FROM platform_private.seller_portfolio_assignments),(SELECT count(*) FROM platform_private.seller_portfolio_audit),
 (SELECT count(*) FROM platform_private.authz_tickets),(SELECT count(*)||':'||coalesce(md5(string_agg(id::text||status::text,',' ORDER BY id)),'') FROM public.commercial_payment_plan_assignments),
 (SELECT count(*) FROM public.accounts_receivable),(SELECT count(*) FROM public.fiscal_invoices),(SELECT count(*) FROM public.fiscal_events),
 (SELECT count(*) FROM public.comunicacao_outbox),(SELECT count(*) FROM public.estoque_movimentacoes),(SELECT count(*) FROM public.entregas),
 (SELECT count(*) FROM public.user_roles),(SELECT count(*) FILTER (WHERE ativo) FROM public.profiles)));"""
fp=lambda: d.last(FP_SQL)
def deny(name,thunk,state,tok):
    """Negativa exige SQLSTATE e motivo exatos e nenhum efeito persistido (impressão digital antes/depois)."""
    b=fp();r=thunk() if callable(thunk) else thunk;a=fp()
    err=r[1] or ''
    got=err.split(':',2)[1].strip() if err.startswith('ERROR:') and len(err.split(':',2))>2 else ''
    okc=r[0] is None and got==state and tok in err and a==b
    ok(f'{name} [{state} {tok}]',okc,dict(result=r,sqlstate=got,effects_changed=a!=b))
def run_file(n,pre=''):
    data=(H/n).read_bytes();sha=hashlib.sha256(data).hexdigest()
    assert sha==json.loads((H/'manifest.json').read_text())['files'][n],('SHA',n)
    executed.setdefault(n,[]).append(sha);return d.raw(pre+data.decode())
def counts():
    q=lambda s: d.last(s)
    return dict(ar=q("select count(*) from public.accounts_receivable"),ari=q("select count(*) from public.accounts_receivable_installments"),
      nf=q("select count(*) from public.fiscal_invoices"),fe=q("select count(*) from public.fiscal_events"),
      outbox=q("select count(*) from public.comunicacao_outbox"),reserva=q("select count(*) from public.estoque_movimentacoes"),
      entregas=q("select count(*) from public.entregas"))
def sim(uid,partner,plan=P3,ch=CH): return call(uid,f"public.simulate_b2b_payment_condition_secure('{partner}','{plan}','{js(ITEMS)}'::jsonb,'{js(ch)}'::jsonb)")
def attempt(uid,partner):
    jr,e=call(uid,f"public.recover_partner_order_attempt_v1('{partner}',NULL,NULL,false,NULL)")
    if jr and jr.get('state')=='committed':
        jr,e=call(uid,f"public.recover_partner_order_attempt_v1('{partner}','{jr['key']}',{jr['generation']},true,'{jr['order_id']}')")
    return jr,e
def create(uid,partner,h,key,plan=P3,ch=CH): return call(uid,f"public.create_partner_order_condition_secure('{partner}',NULL,'{js(ITEMS)}'::jsonb,NULL,'{plan}','{h}','{key}','{js(ch)}'::jsonb)")
def full_create(uid,partner):
    s,e=sim(uid,partner)
    if s is None: return None,e
    jr,e=attempt(uid,partner)
    if jr is None: return None,e
    c,e=create(uid,partner,s['cart_hash'],jr['key'])
    return (dict(order=c,key=jr['key'],hash=s['cart_hash']) if c else None),e
try:
    ok('restore sem erros além das FKs auth conhecidas',all('foreign key' in x for x in d.restore_errors),d.restore_errors)
    for sig,m in json.loads((H/'evidence/measure/comparison.json').read_text()).items():
        ok('base reconstituída = MD5 auditor '+sig,d.md5(sig)==m['expected'],d.md5(sig))
    # Usuários sintéticos: cópia fiel do perfil do gestor (mesma empresa) — nenhuma conta real.
    for uid,org,role in [(V1,A,'vendedor'),(V2,A,'vendedor'),(VB,F,'vendedor'),(VX,A,'vendedor')]:
        pass
    d.sql((H.parent/'02a-install-enum.sql.review').read_text())
    d.sql((H.parent/'02b-install.sql.review').read_text())
    for uid,org in [(V1,A),(V2,A),(VB,F),(VX,A)]:
        d.sql(f"INSERT INTO public.profiles(id,user_id,nome,ativo,organization_id,senha_provisoria) VALUES(gen_random_uuid(),'{uid}','VENDEDOR SINTETICO',true,'{org}',false);INSERT INTO public.user_roles(user_id,role) VALUES('{uid}','vendedor');")
    d.sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{VX}','gestor_comercial');")  # vendedor+gestor: não exclusivo
    if d.last(f"select count(*) from public.profiles where user_id='{UADM}' and organization_id='{A}'")=='1':
        pass
    # Admin de F para atribuir VB (cópia sintética)
    UADMF=u(905)
    d.sql(f"INSERT INTO public.profiles(id,user_id,nome,ativo,organization_id,senha_provisoria) VALUES(gen_random_uuid(),'{UADMF}','ADMIN F SINTETICO',true,'{F}',false);INSERT INTO public.user_roles(user_id,role) VALUES('{UADMF}','administrador');")
    base=counts()
    # Baseline pré-delta: vendedor negado nos writers LIVE.
    r=full_create(V1,P);ok('LIVE: vendedor sem delta não cria pedido',r[0] is None,r)
    # PRE
    r=run_file('01c-pre-writers.sql.readonly',"SET app.expected_ref='wrong';");ok('PRE ref divergente falha fechada',r.returncode!=0 and 'VENDW_PRE_REF_UNPROVEN' in r.stderr,r.stderr[-300:])
    r=run_file('01c-pre-writers.sql.readonly',"SET app.expected_ref='swzpzcwiasxmjutrmvkm';");ok('PRE_PASS',r.returncode==0 and 'VENDW_PRE_PASS' in r.stdout,r.stderr[-400:])
    # Atribuições pelo administrador (RPC normal)
    a1,e=call(UADM,f"public.admin_assign_seller_portfolio_v1('{V1}','{P}','carteira teste')");ok('admin atribui P a V1',a1 is not None,e)
    a2,e=call(UADM,f"public.admin_assign_seller_portfolio_v1('{V2}','{P2}','carteira teste')");ok('admin atribui P2 a V2',a2 is not None,e)
    deny('vendedor não atribui carteira',lambda: call(V1,f"public.admin_assign_seller_portfolio_v1('{V1}','{PNA}','auto')"),'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('gestor comercial não atribui carteira',lambda: call(UGC,f"public.admin_assign_seller_portfolio_v1('{V1}','{PNA}','x')"),'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('admin A não atribui vendedor de F',lambda: call(UADM,f"public.admin_assign_seller_portfolio_v1('{VB}','{P2}','x')"),'22023','SELLER_PORTFOLIO_SELLER_INVALID')
    # Instalação
    r=run_file('02c-install-writers.sql.review',"SET app.expected_ref='swzpzcwiasxmjutrmvkm';");ok('INSTALL transação única',r.returncode==0,r.stderr[-800:])
    r=run_file('03c-post-writers.sql.readonly');ok('POST_PASS',r.returncode==0 and 'VENDW_POST_PASS' in r.stdout,r.stderr[-400:])
    r=run_file('02c-install-writers.sql.review',"SET app.expected_ref='swzpzcwiasxmjutrmvkm';");ok('reinstalação recusada (PRE interno)',r.returncode!=0 and 'VENDW_PRE' in r.stderr,r.stderr[-300:])
    ov,e=call(UADM,"public.admin_seller_portfolio_overview_v1()")
    ok('admin vê vendedores e atribuições só da própria empresa',ov and {s['user_id'] for s in ov['sellers']}>={V1,V2} and VB not in {s['user_id'] for s in ov['sellers']} and PF not in {p['partner_id'] for p in ov['partners']} and len(ov['assignments'])==2,ov or e)
    deny('gestor comercial não lê visão de carteiras',lambda: call(UGC,"public.admin_seller_portfolio_overview_v1()"),'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('vendedor não lê visão de carteiras',lambda: call(V1,"public.admin_seller_portfolio_overview_v1()"),'42501','SELLER_PORTFOLIO_FORBIDDEN')
    # Capacidade
    c,e=call(V1,"public.seller_portfolio_capability_v1()")
    ok('capacidade V1: só P, order_create e quote_respond',c and c['ready'] and [p['partner_id'] for p in c['partners']]==[P] and c['order_create'] and c['quote_respond'] and c['fiscal_block'] is None,c or e)
    c,e=call(V2,"public.seller_portfolio_capability_v1()");ok('capacidade V2: só P2',c and [p['partner_id'] for p in c['partners']]==[P2],c or e)
    c,e=call(VB,"public.seller_portfolio_capability_v1()");ok('capacidade VB (outro tenant) sem parceiros',c and c['partners']==[] and c['order_create'] is False,c or e)
    c,e=call(VX,"public.seller_portfolio_capability_v1()");ok('vendedor+gestor não é vendedor exclusivo',c and c['ready'] is False and c['reason']=='not_seller',c or e)
    c,e=call(UGC,"public.c2_internal_order_entry_capability_v1()");ok('regressão: capacidade do gestor segue aberta (pin catálogo novo)',c and c['order_create'] is True,c or e)
    c,e=call(V1,"public.c2_internal_order_entry_capability_v1()");ok('capacidade interna do gestor não abre para vendedor',c and c['order_create'] is False and c['reason']=='actor_not_allowed',c or e)
    # Catálogo
    r=call(V1,f"public.get_partner_catalog_secure('{P}')");ok('V1 lê catálogo de P',r[0] is not None,r)
    deny('V1 catálogo de parceiro não atribuído',lambda: call(V1,f"public.get_partner_catalog_secure('{PNA}')"),'42501','forbidden_partner')
    deny('V1 catálogo de P2 (de V2)',lambda: call(V1,f"public.get_partner_catalog_secure('{P2}')"),'42501','forbidden_partner')
    deny('VB catálogo de P (outro tenant)',lambda: call(VB,f"public.get_partner_catalog_secure('{P}')"),'42501','forbidden_partner')
    r=call(V1,f"public.get_partner_packaging_offers_secure('{P}')");ok('V1 lê embalagens de P',r[0] is not None,r)
    def plan_ids(uid,pre='',post=''):
        r=act(uid,"SELECT coalesce(string_agg(id::text,',' ORDER BY id),'') FROM public.rpc_b2b_list_selectable_payment_plans();"+post,pre)
        if r.returncode: return None,next((l for l in r.stderr.splitlines() if l.startswith('ERROR:')),r.stderr[-200:])
        v=[l for l in r.stdout.splitlines() if l is not None];v=v[-1] if v else ''
        return set(x for x in v.split(',') if x),None
    admin_ids,_=plan_ids(UADM)
    def assigned(partner,extra=''):
        return set(d.sql(f"select distinct plan_id from public.commercial_payment_plan_assignments where partner_id='{partner}' and buyer_scope='partner' and status='published' and valid_from<=current_date and (valid_until is null or valid_until>=current_date) {extra}").split())
    exp1=admin_ids & assigned(P); exp2=admin_ids & assigned(P2)
    got1,e1=plan_ids(V1);got2,e2=plan_ids(V2)
    ok('planos V1 = planos publicados/vigentes da empresa atribuídos a P (carteira)',got1==exp1 and len(exp1)>0,(sorted(got1 or []),sorted(exp1),e1))
    ok('planos V2 = só os de P2; nenhum plano exclusivo de P (outra carteira)',got2==exp2 and not (got2 & (assigned(P)-assigned(P2))),(sorted(got2 or []),sorted(exp2),e2))
    draft=set(d.sql("select distinct plan_id from public.commercial_payment_plan_assignments where status<>'published'").split())-assigned(P)-assigned(P2)
    ok('plano só em rascunho não aparece ao vendedor',draft and not (got1 & draft),(sorted(draft),))
    got,e=plan_ids(VB);ok('VB (outro tenant) não vê planos de A',got is not None and not (got & admin_ids),(got,e))
    exp_plan=sorted(assigned(P)-assigned(P2))[0]
    got,e=plan_ids(V1,f"BEGIN; SET LOCAL session_replication_role=replica; UPDATE public.commercial_payment_plan_assignments SET valid_until=current_date-1 WHERE partner_id='{P}' AND plan_id='{exp_plan}'; SET LOCAL session_replication_role=origin;"," ROLLBACK;")
    ok('atribuição de plano vencida (transação revertida) some da lista do vendedor',got is not None and exp_plan not in got and got==exp1-{exp_plan},(sorted(got or []),exp_plan,e))
    shared=sorted(assigned(P2))[0]
    deny('detalhe: condições de plano para parceiro de outra carteira',lambda: call(V1,f"public.b2b_list_payment_condition_options_secure('{P2}','{shared}')"),'42501','forbidden_role')
    deny('detalhe: simulação para parceiro de outra carteira',lambda: sim(V1,P2,shared),'42501','C2_SELLER_TARGET_DENIED:not_assigned')
    deny('detalhe: condições para parceiro de outro tenant',lambda: call(V1,f"public.b2b_list_payment_condition_options_secure('{PF}','{exp_plan}')"),'42501','forbidden_role')
    deny('detalhe: VB não lê condições de P',lambda: call(VB,f"public.b2b_list_payment_condition_options_secure('{P}','{P3}')"),'42501','forbidden_role')
    r=call(V1,f"public.b2b_list_payment_condition_options_secure('{P}','{P3}')");ok('V1 lê condições vigentes de P',r[0] is not None,r)
    # Lançamento positivo isolado apto
    b0=counts()
    o,e=full_create(V1,P);ok('V1 lança pedido para P (positivo apto)',o is not None,e)
    if o:
        oid=o['order']['id']
        row=d.last(f"select status||'|'||created_by||'|'||(internal_origin_snapshot->>'actor_user_id')||'|'||coalesce(financial_approval_status,'') from public.partner_orders where id='{oid}'")
        ok('pedido com origem interna server-side do vendedor, aguardando análise',row.split('|')[1]==V1 and row.split('|')[2]==V1 and row.split('|')[0] in ('em_analise_comercial','aguardando_aprovacao_credito'),row)
        b1=counts();ok('sem NF, recebível, reserva, entrega ou envio',all(b1[k]==b0[k] for k in b0),(b0,b1))
        c2,e=create(V1,P,o['hash'],o['key']);ok('replay mesma chave devolve o mesmo pedido',c2 and c2['id']==oid,c2 or e)
        ok('replay sem novas escritas',d.last(f"select count(*) from public.partner_orders where created_by='{V1}'")=='1')
        deny('vendedor não aprova pedido',lambda: call(V1,f"public.approve_partner_order('{oid}',NULL)"),'42501','b2b_phase1_scope_denied')
        ok('status preservado após tentativa de aprovação',d.last(f"select status from public.partner_orders where id='{oid}'")==row.split('|')[0])
        deny('vendedor não aprova termos financeiros',lambda: call(V1,f"public.approve_b2b_payment_terms_secure('{oid}','x')"),'42501','b2b_phase1_scope_denied')
        deny('vendedor não rejeita termos financeiros',lambda: call(V1,f"public.reject_b2b_payment_terms_secure('{oid}','x')"),'42501','b2b_phase1_scope_denied')
        ords,e=call(V1,"public.seller_portfolio_orders_v1()");ok('V1 lê o pedido na carteira',ords and any(x['id']==oid for x in ords['orders']),ords or e)
        ords,e=call(V2,"public.seller_portfolio_orders_v1()");ok('V2 não vê pedido de P',ords is not None and not any(x['id']==oid for x in ords['orders']),ords or e)
    # Negativas de alvo
    deny('V1 não lança para parceiro não atribuído',lambda: full_create(V1,PNA),'42501','C2_SELLER_TARGET_DENIED:not_assigned')
    deny('V1 não lança para P2 (outro vendedor)',lambda: full_create(V1,P2),'42501','C2_SELLER_TARGET_DENIED:not_assigned')
    deny('V1 não lança para parceiro de outro tenant',lambda: full_create(V1,PF),'42501','C2_SELLER_TARGET_DENIED:target_outside_portfolio')
    deny('VB não lança para P',lambda: full_create(VB,P),'42501','C2_SELLER_TARGET_DENIED:target_outside_portfolio')
    deny('vendedor não publica condição',lambda: call(V1,f"public.b2b_payment_condition_publish('{P3}','boleto','{u(92)}','{u(97)}',30,1,0::numeric,NULL)"),'42501','forbidden')
    deny('vendedor não lista planos administrativos',lambda: call(V1,"public.rpc_admin_list_commercial_plans()"),'P0001','not_authorized')
    deny('vendedor não altera atribuição de condição',lambda: call(V1,f"public.b2b_payment_condition_assign('{P}','{P3}','boleto',2,false)"),'42501','forbidden')
    # Bloqueio fiscal distinto de ausência funcional (transação revertida; sem alterar snapshots)
    pre_draft=f"BEGIN; SET LOCAL session_replication_role=replica; UPDATE public.company_fiscal_settings SET configuration_status='DRAFT' WHERE organization_id='{A}' AND is_active; SET LOCAL session_replication_role=origin;"
    r=act(V1,"SELECT public.seller_portfolio_capability_v1()::text; ROLLBACK;",pre_draft)
    cap=json.loads([l for l in r.stdout.splitlines() if l.startswith('{')][-1]) if r.returncode==0 else None
    ok('emitente não validado: fiscal_block issuer_not_validated e order_create false, quote_respond mantido',cap and cap['fiscal_block']=='issuer_not_validated' and cap['order_create'] is False and cap['quote_respond'] is True and cap['partners'],cap or r.stderr[-300:])
    s,_=sim(V1,P);jr,_=attempt(V1,P)
    r=act(V1,f"SELECT public.create_partner_order_condition_secure('{P}',NULL,'{js(ITEMS)}'::jsonb,NULL,'{P3}','{s['cart_hash']}','{jr['key']}','{js(CH)}'::jsonb)::text; ROLLBACK;",pre_draft)
    ok('emitente não validado: criação bloqueada B2B_INTERNAL_ISSUER_NOT_VALIDATED',r.returncode!=0 and 'B2B_INTERNAL_ISSUER_NOT_VALIDATED' in r.stderr,r.stderr[-300:])
    # Cotação: fixture pela via administrativa normal (publicar/atribuir condição sob consulta). Costura declarada:
    # plano legado global 'Sob consulta TESTE' adotado pela empresa A só neste banco descartável.
    d.sql(f"SET session_replication_role=replica; UPDATE public.commercial_payment_plans SET organization_id='{A}' WHERE id='{PLQ}'; SET session_replication_role=origin;")
    pq,e=call(UADM,f"public.b2b_payment_condition_publish('{PLQ}','pix','{u(91)}','{u(97)}',5,1,0::numeric,0)");ok('fixture: admin publica condição Pix do plano sob consulta',pq is not None,e)
    aq,e=call(UADM,f"public.b2b_payment_condition_assign('{P}','{PLQ}','pix',1,true)");ok('fixture: admin atribui condição a P',aq is not None,e)
    QCH={"payment_method":"pix","payment_condition_version":1,"payment_deadline_days":5}
    q0=counts()
    def buyer_quote():
        sq,e=sim(UB,P,PLQ,QCH);jrq,e2=attempt(UB,P)
        return create(UB,P,sq['cart_hash'],jrq['key'],PLQ,QCH) if sq and jrq else (None,e or e2)
    cq,e3=buyer_quote();cq2,e4=buyer_quote()
    ok('comprador cria dois pedidos sob consulta (Q1,Q2) pela via normal',cq and cq2 and cq['id']!=cq2['id'] and
       d.last(f"select count(*) from public.partner_orders where id in ('{cq['id']}','{cq2['id']}') and status='aguardando_cotacao'")=='2',(cq or e3,cq2 or e4))
    oext,e=full_create(UB,P);ok('comprador cria pedido externo comum (não cotação) de P',oext is not None,e)
    if cq and cq2:
        qid,qid2=cq['id'],cq2['id']
        ords,e=call(V1,"public.seller_portfolio_orders_v1()")
        items=lambda q:[x for x in (ords or {}).get('orders',[]) if x['id']==q]
        ok('V1 vê Q1 e Q2 com itens',items(qid) and items(qid)[0]['items'] and items(qid2) and items(qid2)[0]['items'],ords or e)
        L=lambda q:[{"item_id":it['id'],"unit_price":90} for it in items(q)[0]['items']]
        rqs=lambda q,lines: f"public.respond_b2b_order_quote_secure('{q}','{js(lines)}'::jsonb,NULL,NULL,NULL)"
        rq=lambda uid,q=None: call(uid,rqs(q or qid,L(q or qid)))
        tk=lambda: d.last("select count(*) from platform_private.authz_tickets")
        tk0=tk()
        ok('marcador seller_quote_respond aparece só na resposta de cotação e no despachante dedicado',d.sql("select string_agg(p.oid::regprocedure::text,',' order by 1) from pg_proc p where p.prokind='f' and pg_get_functiondef(p.oid) like '%seller_quote_respond%'")=='platform_private.seller_quote_origin_dispatch(uuid,jsonb,uuid,uuid),respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)',d.sql("select string_agg(p.oid::regprocedure::text,',' order by 1) from pg_proc p where p.prokind='f' and pg_get_functiondef(p.oid) like '%seller_quote_respond%'"))
        ok('cobrança B2B continua no validador LIVE (não usa o despachante)',"seller_quote_origin_dispatch" not in d.body('public.generate_b2b_receivable_secure_impl(uuid)'))
        # Costura declarada: marcador de Q1 inserido manualmente (simula o meio da resposta de Q1) em transação revertida.
        cl1=d.last(f"select coalesce(cliente_id::text,'') from public.partner_orders where id='{qid}'")
        cl1s=f"'{cl1}'::uuid" if cl1 else "NULL::uuid"
        def mid(sqlcall):
            return d.raw("\\set VERBOSITY verbose\nBEGIN; SET LOCAL request.jwt.claim.sub='"+V1+"'; SET LOCAL request.jwt.claims='"+json.dumps({'sub':V1,'role':'authenticated','iat':1})+"';"
                         f"INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(txid_current(),'seller_quote_respond','{qid}');"+sqlcall+" ROLLBACK;")
        sq1=lambda q: js(json.loads(d.last(f"select c2_external_origin_snapshot::text from public.partner_orders where id='{q}'")))
        r=mid(f"SELECT platform_private.seller_quote_origin_dispatch('{qid}','{sq1(qid)}'::jsonb,'{P}',{cl1s});")
        ok('marcador de Q1 autoriza o despachante só para Q1',r.returncode==0,r.stderr[-300:])
        r=mid(f"SELECT platform_private.seller_quote_origin_dispatch('{qid2}','{sq1(qid2)}'::jsonb,'{P}',{cl1s});")
        ok('marcador de Q1 NÃO autoriza Q2 do mesmo parceiro (SELLER_QUOTE_FLOW_REQUIRED)',r.returncode!=0 and '42501' in r.stderr and 'SELLER_QUOTE_FLOW_REQUIRED' in r.stderr,r.stderr[-300:])
        r=mid(f"SELECT platform_private.c2_external_origin_assert('{sq1(qid)}'::jsonb,'{P}',{cl1s});")
        ok('marcador de Q1 NÃO abre o validador compartilhado (outros escritores) nem para Q1',r.returncode!=0 and 'C2_EXTERNAL_OWNER_DENIED' in r.stderr,r.stderr[-300:])
        forged=js({**json.loads(d.last(f"select c2_external_origin_snapshot::text from public.partner_orders where id='{qid}'")),'actor_user_id':V2})
        r=mid(f"SELECT platform_private.seller_quote_origin_dispatch('{qid}','{forged}'::jsonb,'{P}',{cl1s});")
        ok('marcador de Q1 com snapshot diferente do gravado: SELLER_QUOTE_ORIGIN_DENIED',r.returncode!=0 and 'SELLER_QUOTE_ORIGIN_DENIED' in r.stderr,r.stderr[-300:])
        r=d.raw("\\set VERBOSITY verbose\nBEGIN; SET LOCAL request.jwt.claim.sub='"+V2+"'; SET LOCAL request.jwt.claims='"+json.dumps({'sub':V2,'role':'authenticated','iat':1})+"';"
                f"INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(txid_current(),'seller_quote_respond','{qid}'); SELECT platform_private.seller_quote_origin_dispatch('{qid}','{sq1(qid)}'::jsonb,'{P}',{cl1s}); ROLLBACK;")
        ok('marcador não substitui a carteira: V2 com marcador de Q1 segue negado',r.returncode!=0 and 'C2_SELLER_TARGET_DENIED:not_assigned' in r.stderr,r.stderr[-300:])
        r=act(V1,f"INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(txid_current(),'seller_quote_respond','{qid2}');","\\set VERBOSITY verbose\n")
        ok('cliente autenticado não emite marcador',r.returncode!=0 and '42501' in r.stderr,r.stderr[-200:])
        ok('validador compartilhado permanece com corpo LIVE',d.md5('platform_private.c2_external_origin_assert(jsonb,uuid,uuid)')=='999e5e9fd9887595e252523fb2142726')
        deny('V2 (outro vendedor) não responde Q1',lambda: rq(V2),'42501','C2_SELLER_TARGET_DENIED:not_assigned')
        deny('VB (outro tenant) não responde Q1',lambda: rq(VB),'42501','C2_SELLER_TARGET_DENIED:tenant')
        deny('financeiro não responde cotação',lambda: rq(UFIN),'P0001','forbidden_quote_response')
        deny('vendedor não chama o despachante privado diretamente',lambda: call(V1,f"platform_private.seller_quote_origin_dispatch('{qid}',NULL,'{P}',NULL)"),'42501','permission denied')
        deny('vendedor não usa a resposta de cotação num pedido externo comum',lambda: call(V1,rqs(oext['order']['id'],[{"item_id":u(1),"unit_price":1}])),'42501','SELLER_QUOTE_STATE_DENIED')
        deny('falha de validação da resposta (linhas vazias) sem efeitos',lambda: call(V1,rqs(qid,[])),'P0001','quote_incomplete')
        # Mesmo transação: após a resposta de Q1, o validador compartilhado continua negando o vendedor (Q1, Q2) — nenhuma autoridade residual.
        snap=lambda q: d.last(f"select c2_external_origin_snapshot::text from public.partner_orders where id='{q}'")
        cli=d.last(f"select coalesce(cliente_id::text,'') from public.partner_orders where id='{qid2}'")
        clis=f"'{cli}'::uuid" if cli else "NULL::uuid"
        claims=json.dumps({'sub':V1,'role':'authenticated','iat':1})
        for label,q in (('Q2',qid2),('Q1',qid)):
            sql=("\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='"+V1+"'; SET LOCAL request.jwt.claims='"+claims+"';"
                 f"SELECT ({rqs(qid,L(qid))})::text; RESET ROLE; SELECT platform_private.c2_external_origin_assert('{js(json.loads(snap(q)))}'::jsonb,'{P}',{clis}); COMMIT;")
            r=d.raw(sql)
            ok(f'mesma transação: validador compartilhado nega vendedor para {label} após responder Q1, e tudo é revertido',r.returncode!=0 and '42501' in r.stderr and 'C2_EXTERNAL_OWNER_DENIED' in r.stderr
               and d.last(f"select status from public.partner_orders where id='{qid}'")=='aguardando_cotacao' and tk()==tk0,r.stderr[-300:])
        # Rollback explícito da resposta
        r=d.raw("BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='"+V1+"'; SET LOCAL request.jwt.claims='"+claims+"';"+f"SELECT ({rqs(qid,L(qid))})::text; ROLLBACK;")
        ok('resposta revertida (ROLLBACK): Q1 continua aguardando, sem termos e sem recibo',r.returncode==0 and d.last(f"select status from public.partner_orders where id='{qid}'")=='aguardando_cotacao'
           and d.last(f"select count(*) from platform_private.b2b_quote_response_receipts where order_id='{qid}'")=='0' and tk()==tk0,r.stderr[-300:])
        # Positivo isolado
        rr,e=rq(V1)
        st=d.last(f"select status||'|'||coalesce(payment_condition_status,'') from public.partner_orders where id='{qid}'")
        ok('V1 responde Q1 (aguardando_cotacao → análise/crédito)',rr is not None and st.split('|')[0] in ('em_analise_comercial','aguardando_aprovacao_credito') and st.split('|')[1]=='defined',(rr or e,st))
        ok('Q2 intocado pela resposta de Q1',d.last(f"select status from public.partner_orders where id='{qid2}'")=='aguardando_cotacao' and d.last(f"select count(*) from public.partner_order_payment_terms where partner_order_id='{qid2}'")=='0')
        ok('nenhum ticket criado ou retido',tk()==tk0)
        # Retorno antecipado (replay do recibo) e validador compartilhado na mesma transação
        r=d.raw("\\set VERBOSITY verbose\nBEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='"+V1+"'; SET LOCAL request.jwt.claims='"+claims+"';"
                +f"SELECT ({rqs(qid,L(qid))})::text; RESET ROLE; SELECT platform_private.c2_external_origin_assert('{js(json.loads(snap(qid2)))}'::jsonb,'{P}',{clis}); COMMIT;")
        ok('replay por recibo (retorno antecipado) não abre o validador compartilhado',r.returncode!=0 and 'C2_EXTERNAL_OWNER_DENIED' in r.stderr,r.stderr[-300:])
        rr2,e=rq(V1)
        ok('replay idempotente devolve o mesmo resultado, sem duplicar termos',rr2==rr and d.last(f"select count(*) from public.partner_order_payment_terms where partner_order_id='{qid}'")=='1',(rr2,e))
        deny('preço diferente após resposta: conflito explícito',lambda: call(V1,rqs(qid,[{**x,'unit_price':91} for x in L(qid)])),'PT409','quote_idempotency_conflict')
        deny('outro vendedor não reaproveita o recibo de Q1',lambda: rq(V2),'42501','C2_SELLER_TARGET_DENIED:not_assigned')
        deny('vendedor não aprova o pedido respondido',lambda: call(V1,f"public.approve_partner_order('{qid}',NULL)"),'42501','b2b_phase1_scope_denied')
        # Concorrência: duas respostas idênticas a Q2
        import subprocess
        def sess(uid,body):
            p=subprocess.Popen(d.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            p.stdin.write(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claims='{{\"sub\":\"{uid}\",\"role\":\"authenticated\",\"iat\":1}}';"+body+"\n");p.stdin.close();return p
        body=f"SELECT ({rqs(qid2,L(qid2))})::text;"
        pa=sess(V1,"BEGIN;"+body+"SELECT pg_sleep(1.5); COMMIT;");time.sleep(0.4);pb=sess(V1,body)
        oa,ea=pa.communicate(timeout=60);ob,eb=pb.communicate(timeout=60)
        ja=[l for l in oa.splitlines() if l.startswith('{')];jb=[l for l in ob.splitlines() if l.startswith('{')]
        ok('concorrência: as duas respostas idênticas de Q2 devolvem o mesmo resultado; um termo e um recibo',pa.returncode==0 and pb.returncode==0 and ja and jb and json.loads(ja[-1])==json.loads(jb[-1])
           and d.last(f"select count(*) from public.partner_order_payment_terms where partner_order_id='{qid2}'")=='1'
           and d.last(f"select count(*) from platform_private.b2b_quote_response_receipts where order_id='{qid2}'")=='1',(ea[-200:],eb[-200:]))
        ok('concorrência sem ticket residual',tk()==tk0)
        q1=counts();ok('respostas de cotação sem NF/recebível/reserva/entrega/envio',all(q1[k]==q0[k] for k in q0),(q0,q1))
    # Revalidação transacional (1): writer em curso segura o vínculo; revogação espera.
    def session(uid,body):
        p=subprocess.Popen(d.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        p.stdin.write(f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claims='{{\"sub\":\"{uid}\",\"role\":\"authenticated\",\"iat\":1}}';"+body+"\n");p.stdin.close();return p
    s1,_=sim(V1,P);j1,_=attempt(V1,P)
    p1=session(V1,f"BEGIN; SELECT public.create_partner_order_condition_secure('{P}',NULL,'{js(ITEMS)}'::jsonb,NULL,'{P3}','{s1['cart_hash']}','{j1['key']}','{js(CH)}'::jsonb)::text; SELECT pg_sleep(4); COMMIT;")
    time.sleep(1.5)
    r=act(UADM,f"SET lock_timeout='800ms'; SELECT public.admin_revoke_seller_portfolio_v1('{a1}','revogacao concorrente');")
    o1,e1=p1.communicate(timeout=30)
    ok('revogação concorrente espera o writer (lock_timeout) e o pedido do writer conclui',r.returncode!=0 and 'lock timeout' in r.stderr and p1.returncode==0 and '"id"' in o1,(r.stderr[-200:],o1[-200:],e1[-300:]))
    # (2): revogação em curso; writer espera e é negado após a espera.
    s2,_=sim(V1,P);j2,_=attempt(V1,P)
    p2=subprocess.Popen(d.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    p2.stdin.write(f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='{UADM}'; SET LOCAL request.jwt.claims='{{\"sub\":\"{UADM}\",\"role\":\"authenticated\",\"iat\":1}}'; SELECT public.admin_revoke_seller_portfolio_v1('{a1}','revogacao antes do writer'); RESET ROLE; SELECT pg_sleep(3); COMMIT;\n");p2.stdin.close()
    time.sleep(1.2)
    w=create(V1,P,s2['cart_hash'],j2['key'])
    p2.communicate(timeout=30)
    ok('writer após espera é negado pela revalidação (SELLER_PORTFOLIO_REVOKED)',w[0] is None and 'SELLER_PORTFOLIO_REVOKED' in (w[1] or ''),w)
    ok('nenhum pedido criado pela tentativa negada',d.last(f"select count(*) from public.partner_order_idempotency where idempotency_key='{j2['key']}'")=='0')
    # Revogação efetiva
    ok('vínculo revogado pelo administrador',d.last(f"select revoked_at is not null from platform_private.seller_portfolio_assignments where id='{a1}'")=='t')
    c,e=call(V1,"public.seller_portfolio_capability_v1()");ok('após revogação: carteira vazia',c and c['partners']==[] and c['order_create'] is False and c['reason']=='no_partner_in_scope',c or e)
    deny('após revogação: criação negada',lambda: full_create(V1,P),'42501','C2_SELLER_TARGET_DENIED:not_assigned')
    deny('após revogação: catálogo negado',lambda: call(V1,f"public.get_partner_catalog_secure('{P}')"),'42501','forbidden_partner')
    got,e=plan_ids(V1);ok('após revogação: nenhum plano listado ao vendedor',got==set(),(got,e))
    deny('após revogação: condições de P negadas',lambda: call(V1,f"public.b2b_list_payment_condition_options_secure('{P}','{P3}')"),'42501','forbidden_role')
    ords,e=call(V1,"public.seller_portfolio_orders_v1()");ok('após revogação: pedidos de P somem da carteira',ords is not None and not any(o['partner_id']==P for o in ords['orders']),ords or e)
    ok('histórico de atribuição preservado',d.last(f"select count(*) from platform_private.seller_portfolio_audit where assignment_id='{a1}'")=='2')
    # Reatribuição + perfil inativo
    a3,e=call(UADM,f"public.admin_assign_seller_portfolio_v1('{V1}','{P}','reativacao')");ok('reatribuição cria novo vínculo',a3 is not None and a3!=a1,e)
    deact=f"BEGIN; SET LOCAL session_replication_role=replica; UPDATE public.partner_accounts SET ativo=false WHERE id='{P}'; SET LOCAL session_replication_role=origin;"
    r=act(V1,"SELECT public.seller_portfolio_capability_v1()::text; SELECT public.seller_portfolio_orders_v1()::text; SELECT count(*) FROM public.rpc_b2b_list_selectable_payment_plans(); ROLLBACK;",deact)
    outs=[l for l in r.stdout.splitlines() if l]
    capd=json.loads(outs[-3]) if r.returncode==0 else None; ordd=json.loads(outs[-2]) if r.returncode==0 else None
    ok('parceiro desativado: sai da capability, dos pedidos e dos planos do vendedor',capd and capd['partners']==[] and capd['order_create'] is False and not any(o['partner_id']==P for o in ordd['orders']) and outs[-1]=='0',r.stdout[-300:]+r.stderr[-300:])
    r=act(UADM,"SELECT public.admin_seller_portfolio_overview_v1()::text; ROLLBACK;",deact)
    ov=json.loads([l for l in r.stdout.splitlines() if l.startswith('{')][-1]) if r.returncode==0 else None
    ok('parceiro desativado: admin vê atribuição marcada partner_active=false e fora da lista de parceiros atribuíveis',ov and any(a['partner_id']==P and a['revoked_at'] is None and a['partner_active'] is False for a in ov['assignments']) and P not in {p['partner_id'] for p in ov['partners']},r.stderr[-300:])
    r=act(V1,f"SELECT public.create_partner_order_condition_secure('{P}',NULL,'{js(ITEMS)}'::jsonb,NULL,'{P3}','x','{u(77)}','{js(CH)}'::jsonb)::text; ROLLBACK;","\\set VERBOSITY verbose\n"+deact)
    ok('parceiro desativado: criação negada pelo servidor',r.returncode!=0 and '42501' in r.stderr,r.stderr[-300:])
    d.sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{V1}'")
    got,e=plan_ids(V1);ok('vendedor suspenso: lista de planos negada ou vazia',(got is None and e) or got==set(),(got,e))
    deny('vendedor suspenso: pedidos da carteira negados',lambda: call(V1,"public.seller_portfolio_orders_v1()"),'42501','SELLER_SCOPE_DENIED')
    ov,e=call(UADM,"public.admin_seller_portfolio_overview_v1()")
    ok('vendedor suspenso: admin vê atribuição com seller_active=false e vendedor fora da lista atribuível',ov and V1 not in {s['user_id'] for s in ov['sellers']} and any(a['seller_user_id']==V1 and a['revoked_at'] is None and a['seller_active'] is False for a in ov['assignments']),ov or e)
    deny('vendedor suspenso: admin não atribui novo parceiro a ele',lambda: call(UADM,f"public.admin_assign_seller_portfolio_v1('{V1}','{PNA}','x')"),'22023','SELLER_PORTFOLIO_SELLER_INVALID')
    deny('perfil inativo: criação negada',lambda: full_create(V1,P),'42501','inactive_scope')
    c,e=call(V1,"public.seller_portfolio_capability_v1()");ok('perfil inativo: capacidade fechada',(c and c['ready'] is False) or e,c or e)
    d.sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{V1}'")
    d.sql(f"DELETE FROM public.user_roles WHERE user_id='{V1}' AND role='vendedor'")
    deny('papel revogado: criação negada',lambda: full_create(V1,P),'42501','forbidden_partner')
    d.sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{V1}','vendedor')")
    # Provisionamento (contrato SQL usado pela Edge create-user) com papel independente, e edição pelo admin
    NV=u(906)
    d.sql(f"INSERT INTO public.profiles(id,user_id,nome,ativo,organization_id,senha_provisoria) VALUES(gen_random_uuid(),'{NV}','x',true,'{A}',true);")
    # Costura declarada: a Edge chama com service_role; aqui o papel de serviço vem só das claims (sem SET ROLE), pois o dump não traz ACL de platform_private para service_role.
    svc="SET request.jwt.claim.role='service_role'; SET request.jwt.claims='{\"role\":\"service_role\"}';"
    r=d.raw("\\set VERBOSITY verbose\n"+svc+f"SELECT public.admin_provision_user_profile_v1('{NV}','novo.vendedor@example.invalid','Novo Vendedor',ARRAY['vendedor']::public.app_role[]);")
    ok('provisionamento cria usuário só com o papel vendedor',r.returncode==0 and d.last(f"select string_agg(role::text,',') from public.user_roles where user_id='{NV}'")=='vendedor',r.stderr[-300:])
    r=d.raw("\\set VERBOSITY verbose\n"+svc+f"SELECT public.admin_provision_user_profile_v1('{NV}','e','n',ARRAY['vendedor']::public.app_role[]);")
    ok('reprovisionamento recusado (user_not_ready_for_provisioning)',r.returncode!=0 and '23514' in r.stderr and 'user_not_ready_for_provisioning' in r.stderr,r.stderr[-200:])
    r=act(UADM,f"SELECT public.admin_provision_user_profile_v1('{NV}','e','n',ARRAY['vendedor']::public.app_role[]);","\\set VERBOSITY verbose\n")
    ok('administrador não chama o provisionamento direto (só serviço)',r.returncode!=0 and '42501' in r.stderr,r.stderr[-200:])
    d.sql(f"UPDATE public.profiles SET senha_provisoria=false WHERE user_id='{NV}'")  # primeiro acesso concluído (costura declarada)
    c,e=call(NV,"public.seller_portfolio_capability_v1()");ok('novo vendedor: pronto, carteira vazia (negação por padrão)',c and c['ready'] and c['partners']==[] and c['order_create'] is False,c or e)
    deny('novo vendedor sem atribuição não lança',lambda: full_create(NV,PNA),'42501','C2_SELLER_TARGET_DENIED:not_assigned')
    an,e=call(UADM,f"public.admin_assign_seller_portfolio_v1('{NV}','{PNA}','novo vendedor')");ok('admin atribui PNA ao novo vendedor',an is not None,e)
    c,e=call(NV,"public.seller_portfolio_capability_v1()");ok('novo vendedor vê só PNA',c and [p['partner_id'] for p in c['partners']]==[PNA],c or e)
    stamp=lambda: d.last(f"select updated_at from public.profiles where user_id='{NV}'")
    ed,e=call(UADM,f"public.admin_edit_user_profile_v1('{NV}','{stamp()}'::timestamptz,'{{\"nome\":\"Novo Vendedor\"}}'::jsonb,ARRAY['vendedor','financeiro']::public.app_role[],ARRAY[]::uuid[],NULL::uuid,NULL::uuid)")
    c,e2=call(NV,"public.seller_portfolio_capability_v1()")
    ok('edição pelo admin acrescenta financeiro: deixa de ser vendedor exclusivo',ed is not None and c and c['ready'] is False and c['reason']=='not_seller',(ed,e,c,e2))
    ed,e=call(UADM,f"public.admin_edit_user_profile_v1('{NV}','{stamp()}'::timestamptz,'{{\"nome\":\"Novo Vendedor\"}}'::jsonb,ARRAY['vendedor']::public.app_role[],ARRAY[]::uuid[],NULL::uuid,NULL::uuid)")
    c,e2=call(NV,"public.seller_portfolio_capability_v1()")
    ok('edição volta a vendedor exclusivo: carteira PNA preservada',ed is not None and c and c['ready'] and [p['partner_id'] for p in c['partners']]==[PNA],(ed,e,c,e2))
    deny('edição com carimbo antigo: conflito',lambda: call(UADM,f"public.admin_edit_user_profile_v1('{NV}','2000-01-01'::timestamptz,'{{\"nome\":\"X Y\"}}'::jsonb,ARRAY['vendedor']::public.app_role[],ARRAY[]::uuid[],NULL::uuid,NULL::uuid)"),'PT409','user_edit_conflict')
    deny('admin de outra empresa não edita o vendedor',lambda: call(UADMF,f"public.admin_edit_user_profile_v1('{NV}','{stamp()}'::timestamptz,'{{\"nome\":\"X Y\"}}'::jsonb,ARRAY['vendedor']::public.app_role[],ARRAY[]::uuid[],NULL::uuid,NULL::uuid)"),'42501','user_edit_forbidden')
    rv,e=call(UADM,f"public.admin_revoke_seller_portfolio_v1('{an}','teste revogação')");ok('admin revoga PNA do novo vendedor',rv is not None or e is None,e)
    c,e=call(NV,"public.seller_portfolio_capability_v1()");ok('após revogação: novo vendedor sem parceiros',c and c['partners']==[],c or e)
    # Regressões
    o2,e=full_create(UGC,P);ok('regressão: gestor comercial lança para P',o2 is not None,e)
    o3,e=full_create(UB,P);ok('regressão: comprador externo lança próprio pedido',o3 is not None,e)
    deny('regressão: técnico de parceiro segue negado',lambda: full_create(UT,P),'42501','forbidden_financial_terms')
    deny('regressão: financeiro não vira vendedor',lambda: call(UFIN,"public.seller_portfolio_orders_v1()"),'42501','SELLER_SCOPE_DENIED')
    # Rollback exato
    r=run_file('04c-rollback-writers.sql.review');ok('ROLLBACK restaura corpos LIVE',r.returncode==0,r.stderr[-500:])
    for sig,v in json.loads((H/'manifest.json').read_text())['patched'].items():
        ok('rollback md5 LIVE '+sig,d.md5(sig)==v['live'],d.md5(sig))
    deny('após rollback: vendedor sem writers',lambda: full_create(V1,P),'42501','forbidden_partner')
    print('DBG',d.last(f"select count(*) from public.partner_orders where created_by='{V1}'"),d.last("select count(*) from platform_private.seller_portfolio_assignments"))
    ok('após rollback: pedidos e atribuições preservados',d.last(f"select count(*) from public.partner_orders where created_by='{V1}'")=='2' and d.last("select count(*) from platform_private.seller_portfolio_assignments")=='4')
    r=run_file('04c-rollback-writers.sql.review');ok('rollback repetido recusa drift',r.returncode!=0 and 'VENDW_RB_DRIFT' in r.stderr,r.stderr[-200:])
    c,e=call(UGC,"public.c2_internal_order_entry_capability_v1()");ok('após rollback: gestor segue aberto',c and c['order_create'] is True,c or e)
finally:
    out=H/'evidence';out.mkdir(exist_ok=True)
    n=1+max([int(p.stem.split('-')[-1]) for p in out.glob('attempt-*.json')],default=0)
    res=dict(attempt=n,pass_=sum(c['status']=='PASS' for c in checks),fail=sum(c['status']=='FAIL' for c in checks),checks=checks,executed_sha256=executed,
      note='PostgreSQL descartável restaurado do espelho composto; Auth sintética; não prova JWT/RLS/Storage hospedados')
    (out/f'attempt-{n:03d}.json').write_text(json.dumps(res,indent=2,ensure_ascii=False)+'\n')
    print('RESULT',res['pass_'],'PASS',res['fail'],'FAIL',f'attempt-{n:03d}')
