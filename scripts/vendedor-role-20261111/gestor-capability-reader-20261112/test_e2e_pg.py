#!/usr/bin/env python3
"""E2E local: carteira do vendedor -> pedido -> aprovação comercial (gestor) -> termos (financeiro) -> previsão,
e capacidade do gestor antes/depois do delta 02e. PostgreSQL descartável; Auth por claims SQL (sintética, não prova JWT/RLS)."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;W=H.parent/'writers-20261111';sys.path.insert(0,str(W));sys.path.insert(0,str(H))
import mirror_db, generate as G
u=lambda n:f"00000000-0000-0000-0000-{n:012d}"
A='007bb519-cba0-4704-be2c-cb93ad010048';F=u(2);P,PNA,P2,PF=u(11),u(12),u(85),u(13)
UB,UT,UADM,UFIN,UGC=u(21),u(22),u(24),u(29),u(30);V1,V2,VB=u(901),u(902),u(903);P3=u(81)
ITEMS=[{"item_id":u(32),"item_tipo":"produto","packaging_id":u(51),"quantidade":1}]
CH={"payment_method":"boleto","payment_condition_version":2,"payment_deadline_days":30}
checks=[];ids={};executed={}
def ok(n,c,det=None):
    checks.append(dict(test=n,status='PASS' if c else 'FAIL',detail=None if c else str(det)[:900]));print(('PASS ' if c else 'FAIL ')+n,'' if c else str(det)[:500],flush=True)
d=mirror_db.DB(55793);js=lambda x:json.dumps(x).replace("'","''")
def call(uid,expr):
    r=d.raw("\\set VERBOSITY verbose\nSET ROLE authenticated; SET request.jwt.claim.sub='"+uid+"'; SET request.jwt.claims='"+json.dumps({'sub':uid,'role':'authenticated','iat':1})+f"';SELECT ({expr})::text;")
    if r.returncode: return None,next((l for l in r.stderr.splitlines() if l.startswith('ERROR:')),r.stderr.strip()[:300])
    v=(r.stdout.strip().splitlines() or [''])[-1]
    try: return json.loads(v),None
    except Exception: return (v or True),None
def run(n,pre=''):
    b=(H/n).read_bytes();s=hashlib.sha256(b).hexdigest();assert s==json.loads((H/'manifest.json').read_text())['files'][n];executed.setdefault(n,[]).append(s);return d.raw(pre+b.decode())
REF="SET app.expected_ref='swzpzcwiasxmjutrmvkm';"
def full_create(uid,partner):
    s,e=call(uid,f"public.simulate_b2b_payment_condition_secure('{partner}','{P3}','{js(ITEMS)}'::jsonb,'{js(CH)}'::jsonb)")
    if s is None: return None,e
    jr,e=call(uid,f"public.recover_partner_order_attempt_v1('{partner}',NULL,NULL,false,NULL)")
    if jr and jr.get('state')=='committed':
        jr,e=call(uid,f"public.recover_partner_order_attempt_v1('{partner}','{jr['key']}',{jr['generation']},true,'{jr['order_id']}')")
    if jr is None: return None,e
    c,e=call(uid,f"public.create_partner_order_condition_secure('{partner}',NULL,'{js(ITEMS)}'::jsonb,NULL,'{P3}','{s['cart_hash']}','{jr['key']}','{js(CH)}'::jsonb)")
    return (dict(order=c,sim=s) if c else None),e
q=d.last
cnt=lambda: {t:q(f"select count(*) from public.{t}") for t in ['accounts_receivable','accounts_receivable_installments','fiscal_invoices','fiscal_events','comunicacao_outbox','estoque_movimentacoes','entregas']}
def state(oid):
    return json.loads(q(f"""select json_build_object('status',o.status,'created_by',o.created_by,'approved_by',o.approved_by,'approved_at',o.approved_at is not null,
      'financial_approval_status',o.financial_approval_status,'numero',o.numero,'table',o.table_amount,'discount',o.commercial_discount_amount,'total',o.total,'final',o.final_amount_with_interest,'credit_approved_by',o.credit_approved_by,'requires_fin',o.requires_financial_approval,'origin_actor',o.internal_origin_snapshot->>'actor_user_id',
      'terms',(select json_agg(json_build_object('id',t.id,'status',t.approval_status,'approved_by',t.approved_by)) from public.partner_order_payment_terms t where t.partner_order_id=o.id),
      'schedule',(select json_agg(json_build_object('n',s.installment_number,'due',s.due_date,'amount',s.amount) order by s.installment_number) from public.partner_order_payment_schedule s where s.partner_order_id=o.id),
      'forecasts',(select json_agg(json_build_object('id',f.id,'state',f.state,'amount',f.total_amount,'residual',f.residual_amount,'commercial_by',f.commercial_approved_by,'credit_by',f.credit_approved_by)) from platform_private.b2b_financial_forecasts f where f.order_id=o.id))::text
      from public.partner_orders o where o.id='{oid}'"""))
def approve_flow(label,oid,internal):
    s0=state(oid);ids[label]=dict(order_id=oid,created=s0)
    r=call(V1,f"public.approve_partner_order('{oid}',NULL)");ok(f'{label}: vendedor não aprova comercialmente',r[0] is None,r)
    r=call(UFIN,f"public.approve_partner_order('{oid}',NULL)");ok(f'{label}: financeiro não aprova comercialmente',r[0] is None,r)
    r=call(V1,f"public.approve_b2b_payment_terms_secure('{oid}','x')");ok(f'{label}: vendedor não aprova termos',r[0] is None,r)
    r=call(UFIN,f"public.approve_b2b_payment_terms_secure('{oid}','FINANCEIRO LOCAL SINTETICO')");ok(f'{label}: financeiro aprova termos (crédito)',r[0] is not None,r)
    s1=state(oid);ids[label]['after_terms']=s1
    ok(f'{label}: termos aprovados pelo financeiro; sem previsão antes da comercial',s1['terms'] and all(x['approved_by']==UFIN for x in s1['terms']) and not s1['forecasts'],s1)
    r=call(UGC,f"public.approve_partner_order('{oid}',NULL)");ids[label]['commercial_result']=r[1] or r[0]
    s2=state(oid);ids[label]['after_commercial']=s2
    if internal:
        ok(f'{label}: aprovação comercial de pedido de origem interna segue contida (B2B_INTERNAL_DOWNSTREAM_UNVERIFIED), sem previsão',r[0] is None and 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' in (r[1] or '') and not s2['forecasts'] and s2['approved_by'] is None,(r,s2))
    else:
        ok(f'{label}: gestor comercial aprova comercialmente',r[0] is not None and s2['approved_by']==UGC,(r,s2))
        ids[label]['finding_reverse_order_no_forecast']=not s2['forecasts']
        print('OBSERVADO termos antes da comercial -> previsão:',s2['forecasts'])
def canonical_flow(label,oid):
    ids[label]=dict(order_id=oid,created=state(oid))
    r=call(UGC,f"public.approve_partner_order('{oid}',NULL)");ok(f'{label}: gestor comercial aprova comercialmente',r[0] is not None,r)
    s1=state(oid);ok(f'{label}: sem previsão só com a comercial',not s1['forecasts'] and s1['approved_by']==UGC,s1)
    r=call(UFIN,f"public.approve_b2b_payment_terms_secure('{oid}','FINANCEIRO LOCAL SINTETICO')");ok(f'{label}: financeiro aprova termos',r[0] is not None,r)
    s2=state(oid);ids[label]['final']=s2
    ok(f'{label}: previsão única aguardando NF, autores distintos (gestor/financeiro)',s2['forecasts'] and len(s2['forecasts'])==1 and s2['forecasts'][0]['commercial_by']==UGC and s2['forecasts'][0]['credit_by']==UFIN and s2['forecasts'][0]['state']=='aguardando_fiscal',s2)
    r=call(UFIN,f"public.approve_b2b_payment_terms_secure('{oid}','FINANCEIRO LOCAL SINTETICO')");s3=state(oid)
    ok(f'{label}: repetição não duplica previsão',len(s3['forecasts'] or [])==1,(r,s3))
    r=call(UFIN,f"public.get_b2b_financial_forecast_secure('{oid}')");ok(f'{label}: financeiro lê a previsão',r[0] is not None,r);ids[label]['forecast_read']=r[0]
    r=call(V1,f"public.get_b2b_financial_forecast_secure('{oid}')");ok(f'{label}: vendedor não lê a previsão',r[0] is None,r)
def probe_gestor_terms(oid):
    r=call(UGC,f"public.approve_b2b_payment_terms_secure('{oid}','gestor tenta termos')");ids['gestor_terms_probe']=dict(order_id=oid,result=r[1] or r[0],terms=state(oid)['terms'])
    print('OBSERVADO gestor_comercial em approve_b2b_payment_terms_secure:',r)
try:
    ok('restore sem erros além das FKs auth',all('foreign key' in x for x in d.restore_errors),d.restore_errors[:3])
    G.prepare(d)
    for uid,org in [(V1,A),(V2,A),(VB,F)]:
        d.sql(f"INSERT INTO public.profiles(id,user_id,nome,ativo,organization_id,senha_provisoria) VALUES(gen_random_uuid(),'{uid}','VENDEDOR SINTETICO',true,'{org}',false);INSERT INTO public.user_roles(user_id,role) VALUES('{uid}','vendedor');")
    ok('base: leitor oficial = carteira 66899286 e capacidade gestor = LIVE e2619c71',d.md5(G.READER)==G.NEW_READER and d.md5(G.SIG)==G.LIVE)
    c,e=call(UGC,"public.c2_internal_order_entry_capability_v1()");ok('ANTES do delta: gestor fechado por catalog_reader_pending (falha reproduzida)',c and c['reason']=='catalog_reader_pending' and c['order_create'] is False,c or e)
    base=cnt()
    a1,e=call(UADM,f"public.admin_assign_seller_portfolio_v1('{V1}','{P}','carteira E2E sintetica')");ok('admin atribui P a V1',a1 is not None,e);ids['assignment']=a1
    r=call(UGC,f"public.admin_assign_seller_portfolio_v1('{V2}','{P}','x')");ok('gestor não atribui carteira',r[0] is None,r)
    r=call(UADM,f"public.admin_assign_seller_portfolio_v1('{V2}','{P}','duplo')");ok('P não pode ir a segundo vendedor (exclusivo)',r[0] is None,r)
    c,e=call(V1,"public.seller_portfolio_capability_v1()");ok('V1: carteira só com P, order_create',c and [x['partner_id'] for x in c['partners']]==[P] and c['order_create'],c or e)
    c,e=call(V2,"public.seller_portfolio_capability_v1()");ok('V2: sem parceiros',c and c['partners']==[],c or e)
    o,e=full_create(V1,P);ok('V1 grava pedido para P pela entrada canônica',o is not None,e)
    if o:
        oid=o['order']['id'];st=state(oid)
        ok('pedido do vendedor com origem server-side = V1',st['created_by']==V1 and st['origin_actor']==V1,st)
        ords,_=call(V2,"public.seller_portfolio_orders_v1()");ok('V2 não vê o pedido',ords is not None and not any(x['id']==oid for x in ords['orders']))
        ords,_=call(VB,"public.seller_portfolio_orders_v1()");ok('vendedor de outra empresa não vê',ords is not None and not any(x['id']==oid for x in ords['orders']))
        r=full_create(V1,PNA);ok('V1 não grava para parceiro fora da carteira',r[0] is None and 'C2_SELLER_TARGET_DENIED' in (r[1] or ''),r)
        r=full_create(VB,P);ok('vendedor de outra empresa não grava para P',r[0] is None,r)
        approve_flow('vendedor',oid,True)
    # Delta do gestor
    r=run('01e-pre.sql.readonly',"SET app.expected_ref='wrong';");ok('PRE ref divergente falha fechada',r.returncode!=0 and 'GCAP_PRE_REF_UNPROVEN' in r.stderr)
    r=run('01e-pre.sql.readonly',REF);ok('PRE_PASS',r.returncode==0 and 'GCAP_PRE_PASS' in r.stdout,r.stderr[-300:])
    r=run('02e-install.sql.review',REF);ok('INSTALL 02e',r.returncode==0,r.stderr[-500:])
    r=run('03e-post.sql.readonly');ok('POST_PASS',r.returncode==0 and 'GCAP_POST_PASS' in r.stdout,r.stderr[-300:])
    r=run('02e-install.sql.review',REF);ok('reinstalação recusada por drift',r.returncode!=0 and 'GCAP_PRE_DRIFT' in r.stderr)
    c,e=call(UGC,"public.c2_internal_order_entry_capability_v1()");ok('DEPOIS: gestor abre com parceiros da própria empresa',c and c['order_create'] is True and c['reason'] is None and P in [x['partner_id'] for x in c['partners']] and PF not in [x['partner_id'] for x in c['partners']],c or e)
    c,e=call(V1,"public.c2_internal_order_entry_capability_v1()");ok('DEPOIS: vendedor continua fora da capacidade do gestor',c and c['order_create'] is False and c['reason']=='actor_not_allowed',c or e)
    c,e=call(UFIN,"public.c2_internal_order_entry_capability_v1()");ok('DEPOIS: financeiro fora da capacidade do gestor',c and c['order_create'] is False,c or e)
    c,e=call(UB,"public.c2_internal_order_entry_capability_v1()");ok('DEPOIS: comprador externo fora',c and c['order_create'] is False,c or e)
    o2,e=full_create(UGC,P);ok('gestor grava pedido para P',o2 is not None,e)
    if o2: approve_flow('gestor',o2['order']['id'],True)
    o4,e=full_create(UGC,P);ok('gestor grava segundo pedido (sonda de alçada de termos)',o4 is not None,e)
    if o4: probe_gestor_terms(o4['order']['id'])
    o3,e=full_create(UB,P);ok('comprador externo grava pedido para P (controle financeiro positivo)',o3 is not None,e)
    if o3: approve_flow('comprador_ordem_inversa',o3['order']['id'],False)
    o5,e=full_create(UB,P);ok('comprador grava segundo pedido (sequência canônica)',o5 is not None,e)
    if o5: canonical_flow('comprador_canonico',o5['order']['id'])
    r=full_create(UGC,PF);ok('gestor não grava para parceiro de outra empresa',r[0] is None,r)
    ok('nenhum título/NF/evento fiscal/envio/reserva/entrega criado (recebível só após NF)'+'' if True else '',cnt()==base,(base,cnt()))
    #/NF/evento fiscal/envio/reserva/entrega criado',cnt()==base,(base,cnt()))
    r=run('04e-rollback.sql.review');ok('ROLLBACK restaura LIVE',r.returncode==0 and d.md5(G.SIG)==G.LIVE,r.stderr[-300:])
    r=run('04e-rollback.sql.review');ok('rollback repetido recusa drift',r.returncode!=0 and 'GCAP_RB_DRIFT' in r.stderr)
    ok('pedidos preservados após rollback',all(q(f"select count(*) from public.partner_orders where id='{v['order_id']}'")=='1' for k,v in ids.items() if isinstance(v,dict)))
    import subprocess
    c=d.psql();subprocess.run([str(mirror_db.PG/'pg_dump'),'-h',c[c.index('-h')+1],'-p',d.port,'-U','postgres','-Fc','-f','/tmp/vendedor-e2e-final.dump','postgres'],check=False)
finally:
    out=H/'evidence';n=1+max([int(p.stem.split('-')[-1]) for p in out.glob('attempt-*.json')],default=0)
    res=dict(attempt=n,pass_=sum(c['status']=='PASS' for c in checks),fail=sum(c['status']=='FAIL' for c in checks),checks=checks,ids=ids,executed_sha256=executed,
      note='PostgreSQL descartável (espelho composto + 02b/catálogo/02c/02d + 02e); dados só nesta base, destruída ao fim; Auth sintética')
    (out/f'attempt-{n:03d}.json').write_text(json.dumps(res,indent=2,ensure_ascii=False,default=str)+'\n');print('RESULT',res['pass_'],'PASS',res['fail'],'FAIL',f'attempt-{n:03d}')
