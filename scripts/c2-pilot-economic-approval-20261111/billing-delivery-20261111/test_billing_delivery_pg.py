#!/usr/bin/env python3
"""Bateria integrada faturamento parcial + entrega (PB-001042) no ESPELHO descartável — nunca hospedado.
Executa somente rotinas efetivas do espelho (estado reportado de produção + piloto 02/05 com bytes conferidos).
Costuras declaradas em SEAMS; nenhum resultado final (NF autorizada, título, residual, saldo) é inserido diretamente.
Auth por claims SQL é sintética: não prova JWT/RLS/Storage hospedados.
Uso: python3 test_billing_delivery_pg.py   (requer /tmp/vendedor-mirror.dump; ver README.md)"""
import hashlib,importlib.util as iu,json,subprocess,sys,time,uuid
from pathlib import Path
H=Path(__file__).resolve().parent;P=H.parent;sys.path.insert(0,str(P))
import fixture as X
EV=H/'evidence';EV.mkdir(exist_ok=True)
att=EV/f"attempt-{max([int(p.name[-3:]) for p in EV.glob('attempt-*')],default=0)+1:03d}";att.mkdir()
checks=[];executed=[];SEAMS=[];FINDINGS=[]
def rec(scn,name,status,detail=None):
    checks.append(dict(scenario=scn,test=name,status=status,detail=None if detail is None else (detail if isinstance(detail,(dict,list)) else str(detail)[:1500])))
    print(f"{status} [{scn}] {name}",'' if status=='PASS' else str(detail)[:600],flush=True)
def ok(scn,name,cond,detail=None): rec(scn,name,'PASS' if cond else 'FAIL',None if cond else detail)
def seam(s): SEAMS.append(s); print('SEAM',s,flush=True)
SUMS={l.split()[1]:l.split()[0] for l in (P/'SHA256SUMS').read_text().splitlines()}
m=X.Mirror(55841);d=m.d;js=X.js
# attempt-008: claims sem 'exp' faziam catalog_tenant_actor negar (falha do harness, não do produto). Claims completas como logistics-linked-approval.
m.claims=lambda uid: f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claims='"+json.dumps({'sub':uid,'role':'authenticated','iat':1,'exp':4102444800})+"';"
REF="SET c2pilot.expected_ref='swzpzcwiasxmjutrmvkm';"
def run_file(n,pre=REF):
    b=(P/n).read_bytes();s=hashlib.sha256(b).hexdigest()
    assert s==SUMS[n],('SHA_MISMATCH',n);executed.append(dict(file=n,sha256=s));return d.raw(pre+b.decode())
cnt=lambda q:int(d.last(q))
T=lambda t: d.last(f"SELECT to_regclass('{t}') IS NOT NULL")=='t'
def err(e): return e or ''
def fp():
    parts=[f"(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,',' ORDER BY x.id),'')) FROM {t} x)" for t in
      ('public.partner_orders','public.partner_order_payment_terms','public.partner_order_payment_schedule','public.partner_order_items','public.ordens_servico','public.estoque_produto','platform_private.b2b_financial_forecasts')]
    parts+=[f"(SELECT count(*) FROM {t})" for t in ('public.accounts_receivable','public.accounts_receivable_installments','public.fiscal_invoices','public.fiscal_events','public.estoque_movimentacoes','public.entregas','public.notificacoes_operacionais','platform_private.b2b_financial_forecast_events','public.partner_order_audit_logs','public.receivable_payments')]
    for t in ('public.comunicacao_outbox','public.communication_outbox'):
        if T(t): parts.append(f"(SELECT count(*) FROM {t})")
    return d.last("SELECT md5(concat_ws('|',"+",".join(parts)+"))")
def deny(scn,name,thunk,tok):
    b=fp();r=thunk();a=fp();e=err(r[1])
    ok(scn,f'{name} [{tok}]',r[0] is None and tok in e and a==b,dict(result=r,effects_changed=a!=b))
key=lambda: 'k-'+uuid.uuid4().hex
ap=lambda uid,o,kind,k,h: m.call(uid,f"public.c2_pilot_economic_approve_v1('{o}','{kind}','{k}','{h}','aprovacao explicita piloto')")
def evh(o): return json.loads(d.last(f"SELECT platform_private.c2_pilot_econ_evidence_v1('{o}')::text"))['evidence_hash']
def enable(o,h=4):
    return run_file('05-pilot-enable.sql.review',REF+f"SET c2pilot.order_id='{o}';SET c2pilot.commercial_actor='{X.UGC}';SET c2pilot.credit_actor='{X.UFIN}';SET c2pilot.hours='{h}';SET c2pilot.reason='PILOTO PB-001042 ESPELHO BILLING';")
def forecast(o):
    v=d.last(f"SELECT coalesce((SELECT jsonb_build_object('id',id,'state',state,'total',total_amount,'residual',residual_amount,'version',version,'source',economic_snapshot->>'source')::text FROM platform_private.b2b_financial_forecasts WHERE order_id='{o}'),'null')")
    return json.loads(v)
def ar_for(o): return cnt(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{o}' OR partner_order_id='{o}'") if d.last("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts_receivable' AND column_name='partner_order_id'")=='1' else cnt(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{o}'")
def nfi(o): return cnt(f"SELECT count(*) FROM public.fiscal_invoices WHERE partner_order_id='{o}' OR source_id='{o}'")
def grant(gate,op,partner=None,order=None,item=None,product=None,stock=None,delivery=None,actor=None):
    vals=",".join("NULL" if v is None else f"'{v}'::uuid" for v in [actor or X.UADM,X.A,partner,order,item,product,stock,delivery])
    return d.last(f"""INSERT INTO platform_private.resale_pilot_allowlist_v1(gate,operation,actor_id,organization_id,partner_id,order_id,order_item_id,product_id,stock_id,delivery_id,synthetic,valid_until,created_by)
      VALUES('{gate}','{op}',{vals},true,now()+interval '2 hours','{X.UADM}') RETURNING id;""")
VEND=X.u(931)
SCN_C2='C2-PB001042'
try:
    ok('setup','restore sem erros além das FKs auth conhecidas',all('foreign key' in x for x in d.restore_errors),d.restore_errors[:5])
    stack=m.install_reported_stack();ok('setup','estado reportado: Vendedor 02a/02b/02c/02d (bytes finais)',len(stack)==4,stack)
    d.sql("UPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=false,reason='PRODUCTION_ALIGNED_OFF' WHERE singleton;")
    seam('S0 gate global de criação de previsão alinhado OFF (estado de produção reportado)')
    m.setup_quote_plan();seam('S1 plano global "Sob consulta TESTE" adotado pela empresa A (costura do pacote writers-20261111)')
    seam('S2 configuração fiscal da emitente desativada só durante a criação do pedido C2 (writer canônico grava snapshot pendente contábil)')
    PB=m.buyer_quote_order();r=m.respond_quote(PB);ok(SCN_C2,'cotação respondida pelo writer real',r[0] is not None,r)
    s=d.sql(f"SELECT status||'|'||(c2_external_origin_snapshot->>'contract')||'|'||total||'|'||coalesce(internal_economic_snapshot::text,'null')||'|'||(SELECT approval_status FROM public.partner_order_payment_terms t WHERE t.id=po.payment_terms_id) FROM public.partner_orders po WHERE id='{PB}'")
    ok(SCN_C2,'pedido fiel: em_analise_comercial, C2 pendente contábil, total 20, snapshot nulo',s=='em_analise_comercial|C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1|20.00|null|not_required',s)
    it=d.sql(f"SELECT count(*)||'|'||sum(quantidade)||'|'||max(preco_unitario)||'|'||max(packaging_peso_liquido_kg_snapshot) FROM public.partner_order_items WHERE order_id='{PB}'")
    ok(SCN_C2,'itens: 2 embalagens inteiras de 25 kg x R$10',float(it.split('|')[1])==2 and float(it.split('|')[2])==10 and float(it.split('|')[3])==25,it)
    for n in ('01-pre.sql.readonly','02-install.sql.review','03-post.sql.readonly'):
        r=run_file(n);ok('setup',f'piloto {n} (bytes = SHA256SUMS)',r.returncode==0,r.stderr[-500:])
    r=enable(PB);ok('setup','05 habilitação estreita do PB',r.returncode==0 and 'C2PILOT_ENABLE_PASS' in r.stdout,r.stderr[-400:])
    H0=evh(PB);a,e=ap(X.UGC,PB,'commercial',key(),H0);b,e2=ap(X.UFIN,PB,'credit',key(),H0)
    f0=forecast(PB)
    ok(SCN_C2,'duas aprovações explícitas → uma previsão 20 aguardando_fiscal',a and b and b.get('forecast_id') and f0 and f0['total']==20 and f0['residual']==20 and f0['state']=='aguardando_fiscal',dict(a=a or e,b=b or e2,f=f0))
    PBROW=d.last(f"SELECT md5(to_jsonb(po)::text) FROM public.partner_orders po WHERE id='{PB}'")
    # ---------- Cenário C2: tudo a jusante continua NEGADO mesmo com as duas aprovações econômicas ----------
    PIT=d.last(f"SELECT id FROM public.partner_order_items WHERE order_id='{PB}' LIMIT 1");PPROD=d.last(f"SELECT product_id FROM public.partner_order_items WHERE id='{PIT}'")
    deny(SCN_C2,'LIVE approve_partner_order',lambda: m.call(X.UGC,f"public.approve_partner_order('{PB}',NULL)"),'C2_ACCOUNTING_PENDING')
    deny(SCN_C2,'LIVE approve_b2b_credit',lambda: m.call(X.UFIN,f"public.approve_b2b_credit('{PB}',NULL)"),'C2_ACCOUNTING_PENDING')
    deny(SCN_C2,'título por pedido generate_b2b_receivable_secure (Financeiro)',lambda: m.call(X.UFIN,f"public.generate_b2b_receivable_secure('{PB}')"),'C2_ACCOUNTING_PENDING')
    deny(SCN_C2,'título por pedido generate_b2b_receivable_secure (admin)',lambda: m.call(X.UADM,f"public.generate_b2b_receivable_secure('{PB}')"),'C2_ACCOUNTING_PENDING')
    el=m.call(X.UADM,f"public.fn_fiscal_invoice_eligibility('PARTNER_ORDER','{PB}')")
    ok(SCN_C2,'elegibilidade fiscal do pedido C2: não elegível',el[0] is not None and el[0].get('eligible') is False,el)
    rec(SCN_C2,'motivos de inelegibilidade fiscal (evidência)','INFO',el[0])
    # Liberação física com gate e concessão exata abertos SOMENTE no espelho (costura): ainda assim nega.
    d.sql("UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true WHERE singleton;UPDATE platform_private.finished_product_gate_v1 SET enabled=true WHERE singleton;")
    seam('S3 gates de logística de revenda/produto acabado abertos no espelho + concessões exatas por ator/pedido/item (configuração, nunca resultado)')
    grant('b2b_resale','os_create',X.P,PB,PIT,PPROD)
    upd=d.last(f"SELECT updated_at FROM public.partner_orders WHERE id='{PB}'")
    deny(SCN_C2,'OS de revenda (liberação/entrega) com concessão os_create exata',lambda: m.call(X.UADM,f"public.rpc_b2b_resale_os_create_v1('{PB}','{PIT}','{upd}'::timestamptz,'{key()}')"),'B2B_RESALE')
    ok(SCN_C2,'nenhuma OS para o PB',cnt(f"SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{PB}'")==0)
    av=m.call(X.UADM,f"public.rpc_b2b_resale_os_availability_v1('{PB}')");rec(SCN_C2,'disponibilidade de OS (leitura)','INFO',av)
    deny(SCN_C2,'FSF (outro tenant) não gera título do PB',lambda: m.call(X.UADMF,f"public.generate_b2b_receivable_secure('{PB}')"),'denied')
    for fn,args in (('rpc_fiscal_invoice_apply_authorization_v1',"gen_random_uuid(),repeat('1',44),'P','2026-11-11'::timestamptz,'100','x',gen_random_uuid()"),
                    ('rpc_fiscal_sefaz_transmit_begin_v1',"'x','x','x','x',NULL,NULL,NULL,NULL")):
        deny(SCN_C2,f'{fn} sem EXECUTE para authenticated',lambda fn=fn,args=args: m.call(X.UADM,f"public.{fn}({args})"),'permission denied')
    deny(SCN_C2,'transição privada da previsão sem EXECUTE',lambda: m.call(X.UFIN,f"platform_private.b2b_financial_forecast_transition_v1('{f0['id']}',1,'EMISSION_STARTED','{uuid.uuid4()}','{{}}'::jsonb)"),'permission denied')
    r=m.act(X.UADM,f"UPDATE public.partner_orders SET status='aprovado' WHERE id='{PB}';")
    ok(SCN_C2,'gravação direta de status operacional negada',r.returncode!=0 or d.last(f"SELECT status FROM public.partner_orders WHERE id='{PB}'")=='em_analise_comercial',r.stderr[-300:])
    f1=forecast(PB)
    ok(SCN_C2,'após negativas: previsão intacta 20/20 aguardando_fiscal, 0 NF, 0 título, pedido byte-idêntico',f1==f0 and nfi(PB)==0 and ar_for(PB)==0 and d.last(f"SELECT md5(to_jsonb(po)::text) FROM public.partner_orders po WHERE id='{PB}'")==PBROW,dict(f1=f1,nf=nfi(PB),ar=ar_for(PB)))
    # ---------- Inventário da integração pós-autorização efetiva ----------
    SCN_I='INTEGRACAO'
    ev=d.last("SELECT pg_get_functiondef('platform_private.b2b_financial_forecast_transition_v1(uuid,integer,text,text,jsonb)'::regprocedure)")
    body=d.sql("SELECT pg_get_functiondef('platform_private.b2b_financial_forecast_transition_v1(uuid,integer,text,text,jsonb)'::regprocedure)")
    evs=sorted(set(__import__('re').findall(r"'(EMISSION_[A-Z]+|CONSULTATION_[A-Z_]+|AUTHORIZ[A-Z_]*|INVOICE_[A-Z_]+)'",body)))
    rec(SCN_I,'eventos aceitos pela transição efetiva da previsão','INFO',evs)
    ok(SCN_I,'transição efetiva NÃO tem evento de NF autorizada (sem redução de residual)',not any(x in ('AUTHORIZED','INVOICE_AUTHORIZED','EMISSION_AUTHORIZED','FISCAL_AUTHORIZED') or x.startswith('INVOICE') for x in evs) and not __import__('re').search(r"SET[^;]*residual_amount\s*=",body),evs)
    who_res=d.sql("SELECT coalesce(string_agg(p.oid::regprocedure::text,';'),'') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','platform_private') AND p.prosrc ~* 'b2b_financial_forecasts' AND p.prosrc ~* 'residual_amount\\s*=\\s*[^,]*-'")
    rec(SCN_I,'rotinas que reduzem residual da previsão','INFO',who_res or 'nenhuma')
    auth=d.sql("SELECT pg_get_functiondef('public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamptz,text,text,uuid)'::regprocedure)")
    ok(SCN_I,'autorização fiscal efetiva não toca previsão nem recebível (integração automática ausente)','b2b_financial_forecast' not in auth and 'accounts_receivable' not in auth)
    ins_ar=d.sql("SELECT coalesce(string_agg(p.oid::regprocedure::text,';' ORDER BY 1),'') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','platform_private') AND p.prosrc ~* 'INSERT\\s+INTO\\s+public\\.accounts_receivable\\s*\\('")
    rec(SCN_I,'writers efetivos de accounts_receivable','INFO',ins_ar.split(';'))
    ok(SCN_I,'b2b_allocate_document (B4 por documento) ausente no estado efetivo',d.last("SELECT count(*) FROM pg_proc WHERE proname='b2b_allocate_document'")=='0')
    ok(SCN_I,'unicidade efetiva: um título B2B_ORDER ativo por pedido (duas NFs ⇒ dois títulos impossível nessa origem)',d.last("SELECT count(*) FROM pg_indexes WHERE indexname='ux_ar_one_active_per_b2b_order'")=='1')
    FINDINGS.append('Integração NF autorizada → título/residual da previsão NÃO existe nas rotinas efetivas: apply_authorization só altera fiscal_invoices; a transição da previsão aceita apenas EMISSION_*/CONSULTATION_NOT_AUTHORIZED; título B2B é único por pedido e nasce por gatilho de status do pedido (na_aprovacao/na_entrega/na_producao_finalizada) ou por entrega (DELIVERY), não por NF.')
    globals().update(PB=PB,f0=f0)
    exec((H/'positive_control.py').read_text())
except Exception as ex:
    import traceback;rec('runner','exceção',"FAIL",traceback.format_exc()[-2500:])
finally:
    f=[c for c in checks if c['status']=='FAIL']
    (att/'checks.json').write_text(json.dumps(checks,indent=1,ensure_ascii=False)+'\n')
    (att/'executed.json').write_text(json.dumps(dict(files=executed,seams=SEAMS,findings=FINDINGS,script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        positive_sha256=hashlib.sha256((H/'positive_control.py').read_bytes()).hexdigest() if (H/'positive_control.py').exists() else None),indent=1,ensure_ascii=False)+'\n')
    print(f"TOTAL {len(checks)} PASS {sum(c['status']=='PASS' for c in checks)} FAIL {len(f)} OTHER {sum(c['status'] not in ('PASS','FAIL') for c in checks)} -> {att}")
    sys.exit(1 if f else 0)
