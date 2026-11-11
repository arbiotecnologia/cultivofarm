#!/usr/bin/env python3
"""Testes do delta de writers do Vendedor no espelho composto restaurado (PostgreSQL descartável).
Executa os bytes finais 01c/02c/03c/04c com SHA conferido. Auth sintética: não prova JWT/RLS/Storage hospedados."""
import hashlib,json,sys,threading,time
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
    return d.raw(pre+f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claims='"+json.dumps({'sub':uid,'role':'authenticated','iat':1})+"';"+s)
def call(uid,expr,pre=''):
    r=act(uid,f"SELECT ({expr})::text;",pre)
    if r.returncode: return None,(r.stderr.strip().splitlines() or [''])[0]
    lines=r.stdout.strip().splitlines();v=lines[-1] if lines else ''
    try: return json.loads(v),None
    except Exception: return (v if v else True),None
def deny(name,r,tok): ok(name,r[0] is None and tok in (r[1] or ''),r)
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
    deny('vendedor não atribui carteira',call(V1,f"public.admin_assign_seller_portfolio_v1('{V1}','{PNA}','auto')"),'SELLER_PORTFOLIO_FORBIDDEN')
    deny('gestor comercial não atribui carteira',call(UGC,f"public.admin_assign_seller_portfolio_v1('{V1}','{PNA}','x')"),'SELLER_PORTFOLIO_FORBIDDEN')
    deny('admin A não atribui vendedor de F',call(UADM,f"public.admin_assign_seller_portfolio_v1('{VB}','{P2}','x')"),'SELLER_PORTFOLIO_SELLER_INVALID')
    # Instalação
    r=run_file('02c-install-writers.sql.review',"SET app.expected_ref='swzpzcwiasxmjutrmvkm';");ok('INSTALL transação única',r.returncode==0,r.stderr[-800:])
    r=run_file('03c-post-writers.sql.readonly');ok('POST_PASS',r.returncode==0 and 'VENDW_POST_PASS' in r.stdout,r.stderr[-400:])
    r=run_file('02c-install-writers.sql.review',"SET app.expected_ref='swzpzcwiasxmjutrmvkm';");ok('reinstalação recusada (PRE interno)',r.returncode!=0 and 'VENDW_PRE' in r.stderr,r.stderr[-300:])
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
    deny('V1 catálogo de parceiro não atribuído',call(V1,f"public.get_partner_catalog_secure('{PNA}')"),'forbidden_partner')
    deny('V1 catálogo de P2 (de V2)',call(V1,f"public.get_partner_catalog_secure('{P2}')"),'forbidden_partner')
    deny('VB catálogo de P (outro tenant)',call(VB,f"public.get_partner_catalog_secure('{P}')"),'forbidden')
    r=call(V1,f"public.get_partner_packaging_offers_secure('{P}')");ok('V1 lê embalagens de P',r[0] is not None,r)
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
        deny('vendedor não aprova pedido',call(V1,f"public.approve_partner_order('{oid}',NULL)"),'')
        ok('status preservado após tentativa de aprovação',d.last(f"select status from public.partner_orders where id='{oid}'")==row.split('|')[0])
        deny('vendedor não aprova termos financeiros',call(V1,f"public.approve_b2b_payment_terms_secure('{oid}','x')"),'')
        deny('vendedor não rejeita termos financeiros',call(V1,f"public.reject_b2b_payment_terms_secure('{oid}','x')"),'')
        ords,e=call(V1,"public.seller_portfolio_orders_v1()");ok('V1 lê o pedido na carteira',ords and any(x['id']==oid for x in ords['orders']),ords or e)
        ords,e=call(V2,"public.seller_portfolio_orders_v1()");ok('V2 não vê pedido de P',ords is not None and not any(x['id']==oid for x in ords['orders']),ords or e)
    # Negativas de alvo
    deny('V1 não lança para parceiro não atribuído',full_create(V1,PNA),'C2_SELLER_TARGET_DENIED:not_assigned')
    deny('V1 não lança para P2 (outro vendedor)',full_create(V1,P2),'C2_SELLER_TARGET_DENIED:not_assigned')
    deny('V1 não lança para parceiro de outro tenant',full_create(V1,PF),'C2_SELLER_TARGET_DENIED:target_outside_portfolio')
    deny('VB não lança para P',full_create(VB,P),'C2_SELLER_TARGET_DENIED')
    deny('vendedor não publica condição',call(V1,f"public.b2b_payment_condition_publish('{P3}','boleto','{u(92)}','{u(97)}',30,1,0::numeric,NULL)"),'')
    deny('vendedor não lista planos administrativos',call(V1,"public.rpc_admin_list_commercial_plans()"),'')
    deny('vendedor não altera atribuição de condição',call(V1,f"public.b2b_payment_condition_assign('{P}','{P3}','boleto',2,false)"),'')
    # Bloqueio fiscal distinto de ausência funcional (transação revertida; sem alterar snapshots)
    pre_draft=f"BEGIN; SET LOCAL session_replication_role=replica; UPDATE public.company_fiscal_settings SET configuration_status='DRAFT' WHERE organization_id='{A}' AND is_active; SET LOCAL session_replication_role=origin;"
    r=act(V1,"SELECT public.seller_portfolio_capability_v1()::text; ROLLBACK;",pre_draft)
    cap=json.loads([l for l in r.stdout.splitlines() if l.startswith('{')][-1]) if r.returncode==0 else None
    ok('emitente não validado: fiscal_block issuer_not_validated e order_create false, quote_respond mantido',cap and cap['fiscal_block']=='issuer_not_validated' and cap['order_create'] is False and cap['quote_respond'] is True and cap['partners'],cap or r.stderr[-300:])
    s,_=sim(V1,P);jr,_=attempt(V1,P)
    r=act(V1,f"SELECT public.create_partner_order_condition_secure('{P}',NULL,'{js(ITEMS)}'::jsonb,NULL,'{P3}','{s['cart_hash']}','{jr['key']}','{js(CH)}'::jsonb)::text; ROLLBACK;",pre_draft)
    ok('emitente não validado: criação bloqueada B2B_INTERNAL_ISSUER_NOT_VALIDATED',r.returncode!=0 and 'B2B_INTERNAL_ISSUER_NOT_VALIDATED' in r.stderr,r.stderr[-300:])
    # Cotação: comprador externo cria pedido sob consulta; vendedor responde
    q0=counts()
    sq,e=call(UB,f"public.simulate_b2b_payment_plan_secure('{P}','{PLQ}','{js(ITEMS)}'::jsonb)")
    jrq,e2=attempt(UB,P)
    cq,e3=call(UB,f"public.create_partner_order_secure('{P}',NULL,'{js(ITEMS)}'::jsonb,NULL,'{PLQ}',NULL,NULL,'{(sq or {}).get('cart_hash')}','{(jrq or {}).get('key')}')") if sq and jrq else (None,e or e2)
    ok('comprador cria pedido sob consulta',cq is not None and d.last(f"select status from public.partner_orders where id='{cq['id']}'")=='aguardando_cotacao',cq or e3)
    if cq:
        qid=cq['id']
        ords,e=call(V1,"public.seller_portfolio_orders_v1()");qo=[x for x in (ords or {}).get('orders',[]) if x['id']==qid]
        ok('V1 vê cotação pendente com itens',qo and qo[0]['items'],ords or e)
        lines=[{"item_id":it['id'],"preco_unitario":10} for it in (qo[0]['items'] if qo else [])]
        deny('V2 não responde cotação de P',call(V2,f"public.respond_b2b_order_quote_secure('{qid}','{js(lines)}'::jsonb,NULL,NULL,NULL)"),'')
        deny('VB não responde cotação de P',call(VB,f"public.respond_b2b_order_quote_secure('{qid}','{js(lines)}'::jsonb,NULL,NULL,NULL)"),'')
        rr,e=call(V1,f"public.respond_b2b_order_quote_secure('{qid}','{js(lines)}'::jsonb,NULL,NULL,NULL)")
        if rr is None and 'quote' in (e or '') and 'line' in (e or ''): pass
        ok('V1 responde cotação de P',rr is not None and d.last(f"select status from public.partner_orders where id='{qid}'")!='aguardando_cotacao',rr or e)
        rr2,e=call(V1,f"public.respond_b2b_order_quote_secure('{qid}','{js(lines)}'::jsonb,NULL,NULL,NULL)")
        ok('segunda resposta não duplica (replay ou recusa explícita)',(rr2 is not None and rr2.get('order_id',rr2.get('id'))==(rr or {}).get('order_id',(rr or {}).get('id'))) or (rr2 is None and e),rr2 or e)
        q1=counts();ok('resposta de cotação sem NF/recebível/reserva/entrega/envio',all(q1[k]==q0[k] for k in q0),(q0,q1))
    # Revalidação transacional: lock do vínculo serializa revogação
    hold=d.root
    import subprocess
    p1=subprocess.Popen(d.psql(),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    p1.stdin.write(f"BEGIN; SET ROLE authenticated; SET request.jwt.claim.sub='{V1}'; SET request.jwt.claims='{{\"sub\":\"{V1}\",\"role\":\"authenticated\",\"iat\":1}}'; SELECT platform_private.seller_portfolio_lock('{V1}','{P}'); SELECT pg_sleep(4); COMMIT;\n");p1.stdin.close()
    time.sleep(1.2)
    r=act(UADM,f"SET lock_timeout='800ms'; SELECT public.admin_revoke_seller_portfolio_v1('{a1}','revogacao concorrente');")
    p1.wait(timeout=20)
    ok('revogação espera o vínculo travado pelo writer (lock_timeout)',r.returncode!=0 and 'lock timeout' in r.stderr,r.stderr[-200:])
    # Revogação efetiva
    r,e=call(UADM,f"public.admin_revoke_seller_portfolio_v1('{a1}','fim da carteira')");ok('admin revoga P de V1',e is None,e)
    c,e=call(V1,"public.seller_portfolio_capability_v1()");ok('após revogação: carteira vazia',c and c['partners']==[] and c['order_create'] is False and c['reason']=='no_partner_in_scope',c or e)
    deny('após revogação: criação negada',full_create(V1,P),'C2_SELLER_TARGET_DENIED:not_assigned')
    deny('após revogação: catálogo negado',call(V1,f"public.get_partner_catalog_secure('{P}')"),'forbidden_partner')
    ok('histórico de atribuição preservado',d.last(f"select count(*) from platform_private.seller_portfolio_audit where assignment_id='{a1}'")=='2')
    # Reatribuição + perfil inativo
    a3,e=call(UADM,f"public.admin_assign_seller_portfolio_v1('{V1}','{P}','reativacao')");ok('reatribuição cria novo vínculo',a3 is not None and a3!=a1,e)
    d.sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{V1}'")
    deny('perfil inativo: criação negada',full_create(V1,P),'')
    c,e=call(V1,"public.seller_portfolio_capability_v1()");ok('perfil inativo: capacidade fechada',(c and c['ready'] is False) or e,c or e)
    d.sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{V1}'")
    d.sql(f"DELETE FROM public.user_roles WHERE user_id='{V1}' AND role='vendedor'")
    deny('papel revogado: criação negada',full_create(V1,P),'')
    d.sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{V1}','vendedor')")
    # Regressões
    o2,e=full_create(UGC,P);ok('regressão: gestor comercial lança para P',o2 is not None,e)
    o3,e=full_create(UB,P);ok('regressão: comprador externo lança próprio pedido',o3 is not None,e)
    deny('regressão: técnico de parceiro segue negado',full_create(UT,P),'')
    deny('regressão: financeiro não vira vendedor',call(UFIN,"public.seller_portfolio_orders_v1()"),'SELLER_SCOPE_DENIED')
    # Rollback exato
    r=run_file('04c-rollback-writers.sql.review');ok('ROLLBACK restaura corpos LIVE',r.returncode==0,r.stderr[-500:])
    for sig,v in json.loads((H/'manifest.json').read_text())['patched'].items():
        ok('rollback md5 LIVE '+sig,d.md5(sig)==v['live'],d.md5(sig))
    deny('após rollback: vendedor sem writers',full_create(V1,P),'')
    ok('após rollback: pedidos e atribuições preservados',d.last(f"select count(*) from public.partner_orders where created_by='{V1}'")=='1' and d.last("select count(*) from platform_private.seller_portfolio_assignments")=='3')
    r=run_file('04c-rollback-writers.sql.review');ok('rollback repetido recusa drift',r.returncode!=0 and 'VENDW_RB_DRIFT' in r.stderr,r.stderr[-200:])
    c,e=call(UGC,"public.c2_internal_order_entry_capability_v1()");ok('após rollback: gestor segue aberto',c and c['order_create'] is True,c or e)
finally:
    out=H/'evidence';out.mkdir(exist_ok=True)
    n=1+max([int(p.stem.split('-')[-1]) for p in out.glob('attempt-*.json')],default=0)
    res=dict(attempt=n,pass_=sum(c['status']=='PASS' for c in checks),fail=sum(c['status']=='FAIL' for c in checks),checks=checks,executed_sha256=executed,
      note='PostgreSQL descartável restaurado do espelho composto; Auth sintética; não prova JWT/RLS/Storage hospedados')
    (out/f'attempt-{n:03d}.json').write_text(json.dumps(res,indent=2,ensure_ascii=False)+'\n')
    print('RESULT',res['pass_'],'PASS',res['fail'],'FAIL',f'attempt-{n:03d}')
