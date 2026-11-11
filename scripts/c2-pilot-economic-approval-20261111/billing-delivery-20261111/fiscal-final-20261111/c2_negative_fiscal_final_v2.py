#!/usr/bin/env python3
"""v2: + preparação auth.users antes das constraints (prep_restore.sh) e negativa de origem de entrega via rpc_b2b_resale_os_create_v1 com controle positivo.
Negativa C2 (PB-like) na composição fiscal FINAL (851b14f9 + 2×R$10 attempt-222 dump) + Vendedor 02a–02d + piloto 01/02/03/05.
Banco descartável em /tmp/felig (db c2). Nunca hospedado. NF sintética = costura declarada; resultado só pelo callback H13 real.
Claims SQL sintéticas: não provam JWT/RLS/Storage."""
import hashlib,json,sys,uuid
from pathlib import Path
H=Path(__file__).resolve().parent;P=H.parents[1];sys.path.insert(0,'/tmp/c2neg');sys.path.insert(0,str(P))
import db,fixture as X
X.A='00000000-0000-0000-0000-000000000001'  # empresa vendedora da composição fiscal (difere do espelho Vendedor)
EV=H/'evidence';EV.mkdir(exist_ok=True)
att=EV/f"attempt-{max([int(p.name[-3:]) for p in EV.glob('attempt-*')],default=0)+1:03d}";att.mkdir()
m=X.Mirror.__new__(X.Mirror);m.d=db.DB('c2');d=m.d
m.claims=lambda uid: f"SET ROLE authenticated; SET request.jwt.claim.sub='{uid}'; SET request.jwt.claims='"+json.dumps({'sub':uid,'role':'authenticated','iat':1,'exp':4102444800})+"';"
checks=[];SEAMS=[]
def ok(n,c,det=None): checks.append(dict(test=n,status='PASS' if c else 'FAIL',detail=None if c else str(det)[:1500]));print('PASS' if c else 'FAIL',n,'' if c else str(det)[:500],flush=True)
def info(n,det): checks.append(dict(test=n,status='INFO',detail=det));print('INFO',n,str(det)[:300])
REF="SET c2pilot.expected_ref='swzpzcwiasxmjutrmvkm';"
SUMS={l.split()[1]:l.split()[0] for l in (P/'SHA256SUMS').read_text().splitlines()}
def run_file(n,pre=REF):
    b=(P/n).read_bytes();assert hashlib.sha256(b).hexdigest()==SUMS[n],n;return d.raw(pre+b.decode())
cnt=lambda q:int(d.last(q))
def fp(o):
    return d.last(f"""SELECT md5(concat_ws('|',(SELECT to_jsonb(po)::text FROM public.partner_orders po WHERE id='{o}'),
     (SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{o}' OR b2b_document_id IN (SELECT id FROM public.fiscal_invoices WHERE partner_order_id='{o}')),
     (SELECT count(*) FROM public.accounts_receivable_installments),(SELECT count(*) FROM public.accounts_receivable),
     (SELECT to_jsonb(f)::text FROM platform_private.b2b_financial_forecasts f WHERE order_id='{o}'),
     (SELECT count(*) FROM platform_private.b2b_financial_forecast_events),(SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{o}'),
     (SELECT count(*) FROM public.entregas WHERE partner_order_id='{o}')))""")
def deny(n,res,tok,o,before):
    a=fp(o);ok(f'{n} [{tok}]',res[0] is None and tok in (res[1] or '') and a==before,dict(res=res,changed=a!=before))
d.sql("UPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=false WHERE singleton;");SEAMS.append('S0 gate global de criação de previsão OFF (produção)')
m.setup_quote_plan();SEAMS.append('S1 plano global COT (quote_only) adotado pela empresa A')
SEAMS.append('S2 configuração fiscal ativa da emitente desativada só durante a criação (writer grava C2 pendente contábil)')
PB=m.buyer_quote_order();r=m.respond_quote(PB);ok('cotação respondida pelo writer real (R$10)',r[0] is not None,r)
s=d.last(f"SELECT status||'|'||(c2_external_origin_snapshot->>'contract')||'|'||total||'|'||coalesce(internal_economic_snapshot::text,'null') FROM public.partner_orders po WHERE id='{PB}'")
ok('PB-like: em_analise_comercial, C2 pendente contábil, total 20, snapshot nulo',s=='em_analise_comercial|C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1|20.00|null',s)
for n in ('01-pre.sql.readonly','02-install.sql.review','03-post.sql.readonly'):
    r=run_file(n);ok(f'piloto {n} sobre a composição fiscal final',r.returncode==0,r.stderr[-500:])
r=run_file('05-pilot-enable.sql.review',REF+f"SET c2pilot.order_id='{PB}';SET c2pilot.commercial_actor='{X.UGC}';SET c2pilot.credit_actor='{X.UFIN}';SET c2pilot.hours='4';SET c2pilot.reason='PB ESPELHO FISCAL FINAL';")
ok('05 habilitação estreita do PB',r.returncode==0 and 'C2PILOT_ENABLE_PASS' in r.stdout,r.stderr[-400:])
h=json.loads(d.last(f"SELECT platform_private.c2_pilot_econ_evidence_v1('{PB}')::text"))['evidence_hash']
a=m.call(X.UGC,f"public.c2_pilot_economic_approve_v1('{PB}','commercial','k-{uuid.uuid4().hex}','{h}','aprovacao explicita')")
b=m.call(X.UFIN,f"public.c2_pilot_economic_approve_v1('{PB}','credit','k-{uuid.uuid4().hex}','{h}','aprovacao explicita')")
f0=json.loads(d.last(f"SELECT jsonb_build_object('id',id,'total',total_amount,'residual',residual_amount,'state',state)::text FROM platform_private.b2b_financial_forecasts WHERE order_id='{PB}'"))
ok('duas aprovações explícitas → previsão 20/20 aguardando_fiscal',a[0] and b[0] and f0['total']==20 and f0['residual']==20 and f0['state']=='aguardando_fiscal',dict(a=a,b=b,f=f0))
F0=fp(PB)
deny('approve_partner_order LIVE',m.call(X.UGC,f"public.approve_partner_order('{PB}',NULL)"),'C2_ACCOUNTING_PENDING',PB,F0)
deny('approve_b2b_credit LIVE',m.call(X.UFIN,f"public.approve_b2b_credit('{PB}',NULL)"),'C2_ACCOUNTING_PENDING',PB,F0)
deny('generate_b2b_receivable_secure (Financeiro)',m.call(X.UFIN,f"public.generate_b2b_receivable_secure('{PB}')"),'C2_ACCOUNTING_PENDING',PB,F0)
el=m.call(X.UADM,f"public.fn_fiscal_invoice_eligibility('PARTNER_ORDER','{PB}')");ok('elegibilidade fiscal do PB: não elegível',el[0] and el[0]['eligible'] is False,el);info('motivos',el[0])
# NF sintética de R$10 para o PB (costura de documento, idêntica ao harness) e retorno autorizado pelo callback H13 real.
SEAMS.append('S3 documento NF sintético (fiscal_invoices/itens/xml/transmissão SENT) para o PB; resultado só pelo callback real')
item=d.last(f"SELECT id FROM public.partner_order_items WHERE order_id='{PB}' LIMIT 1");cs=d.last("SELECT id FROM public.company_fiscal_settings WHERE organization_id='00000000-0000-0000-0000-000000000001' AND is_active LIMIT 1")
inv,xr,tx=str(uuid.uuid4()),str(uuid.uuid4()),str(uuid.uuid4());key='3526'+'2'*34+'004242';xs=hashlib.sha256(b'{}').hexdigest()
EP='https://hnfe.fazenda.mg.gov.br/LOCAL-SYNTHETIC-NO-NETWORK';fpr=hashlib.sha256(f'NFeAutorizacao4|{EP}|{xs}'.encode()).hexdigest()
r=d.raw(f"""SET ROLE service_role;
INSERT INTO public.fiscal_invoices(id,invoice_type,document_model,idempotency_key,status,normalized_status,environment,company_settings_id,organization_id,partner_order_id,debtor_partner_id,issue_date,total_amount,created_by,provider_reference,access_key)
 VALUES('{inv}','NFE','NFE','pb-neg:{inv}','PENDING','PENDING','HOMOLOGATION','{cs}','00000000-0000-0000-0000-000000000001','{PB}','{X.P}','2027-02-01',10,'{X.UADM}','PB-NEG','{key}');
INSERT INTO public.fiscal_invoice_items(fiscal_invoice_id,partner_order_item_id,item_sequence,item_kind,quantity,commercial_unit,taxable_quantity,taxable_unit,net_value) VALUES('{inv}','{item}',1,'PRODUCT',1,'UN',25,'KG',10);
INSERT INTO public.fiscal_xml_runs(id,fiscal_invoice_id,idempotency_key,run_version,schema_version,environment_code,access_key,state,payload,payload_sha256,signed_sha256,signed_path,signed_at,validation,signature_metadata,created_by,updated_at)
 VALUES('{xr}','{inv}','pb-neg-xml:{inv}',1,'LOCAL-NFE-4.00','2','{key}','SIGNED','{{}}'::jsonb,'{xs}','{xs}','local/{inv}.xml',now(),'{{"synthetic":true}}'::jsonb,'{{"synthetic":true}}'::jsonb,'{X.UADM}',now());
INSERT INTO public.fiscal_sefaz_transmissions(id,fiscal_invoice_id,xml_run_id,service,environment_code,endpoint_host,endpoint_url,idempotency_key,request_fingerprint,state,outcome,c_stat,x_motivo,ch_nfe,n_prot,ambiente_retorno,dh_recbto,completed_at,created_by)
 VALUES('{tx}','{inv}','{xr}','NFeAutorizacao4','2','hnfe.fazenda.mg.gov.br','{EP}','pb-neg-tx:{tx}','{fpr}','SENT','PENDING','103','PROCESSANDO','{key}',NULL,'2',now(),NULL,'{X.UADM}');""")
info('inserção do documento sintético (pode ser negada por guardas reais)',dict(rc=r.returncode,err=r.stderr[-400:]))
if r.returncode==0:
    v=json.loads(d.last(f"SELECT version FROM platform_private.b2b_financial_forecasts WHERE order_id='{PB}'"))
    sy=m.call(X.UFIN,f"public.rpc_b2b_forecast_fiscal_sync_v1('{tx}',{v})");info('sync de início de emissão da previsão do PB',sy)
    F1=fp(PB)
    body=json.dumps({'cStat':'104','protocolCStat':'100','nProt':'PB-NEG-PROT','chNFe':key,'xMotivo':'LOTE PROCESSADO; PROTOCOLO AUTORIZADO','tpAmb':'2','dhRecbto':'2027-02-01T12:00:00Z'})
    cb=[d.raw(f"SET ROLE service_role;SELECT public.rpc_fiscal_sefaz_transmit_record_v1('{tx}','SUCCEEDED','{body}'::jsonb);") for _ in range(2)]
    info('callback autorizado H13 + replay',[dict(rc=c.returncode,out=c.stdout[-400:],err=c.stderr[-400:]) for c in cb])
    st=json.loads(d.last(f"SELECT jsonb_build_object('inv_status',normalized_status,'receivable',receivable_id)::text FROM public.fiscal_invoices WHERE id='{inv}'"))
    ok('após callback autorizado: nenhum título para a NF do PB',cnt(f"SELECT count(*) FROM public.accounts_receivable WHERE b2b_document_id='{inv}'")==0 and st['receivable'] is None,st)
    f1=json.loads(d.last(f"SELECT jsonb_build_object('residual',residual_amount,'state',state)::text FROM platform_private.b2b_financial_forecasts WHERE order_id='{PB}'"))
    ok('previsão do PB não reduz (residual 20) e nenhum FISCAL_CONFIRMED',f1['residual']==20 and cnt(f"SELECT count(*) FROM platform_private.b2b_financial_forecast_events e JOIN platform_private.b2b_financial_forecasts f ON f.id=e.forecast_id WHERE f.order_id='{PB}' AND e.event_type='FISCAL_CONFIRMED'")==0,f1)
    ok('nenhuma alocação de documento para o PB',cnt(f"SELECT count(*) FROM platform_private.b2b_document_allocations WHERE document_id='{inv}'")==0)
    info('estado final da NF sintética do PB',st)
ok('PB: zero título (por pedido e por documento)',cnt(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{PB}' OR b2b_document_id IN (SELECT id FROM public.fiscal_invoices WHERE partner_order_id='{PB}')")==0)
ok('PB: pedido idêntico ao estado após aprovações (cabeçalho)',d.last(f"SELECT status||'|'||coalesce(internal_economic_snapshot::text,'null') FROM public.partner_orders WHERE id='{PB}'")=='em_analise_comercial|null')
# v2: ponto real de entrada da logística de revenda (OS) — pedido pendente vs controle aprovado do r12.
def effects(o):
    return json.loads(d.last(f"""SELECT jsonb_build_object(
     'residual',(SELECT residual_amount FROM platform_private.b2b_financial_forecasts WHERE order_id='{o}'),
     'titles',(SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{o}' OR b2b_document_id IN (SELECT id FROM public.fiscal_invoices WHERE partner_order_id='{o}')),
     'os',(SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{o}'),
     'entregas',(SELECT count(*) FROM public.entregas WHERE partner_order_id='{o}'),
     'all_os',(SELECT count(*) FROM public.ordens_servico),'all_entregas',(SELECT count(*) FROM public.entregas),
     'stock_moves',(SELECT count(*) FROM public.estoque_movimentacoes),
     'stock_sum',(SELECT coalesce(sum(quantidade),0)::text||'/'||coalesce(sum(quantidade_reservada),0)::text FROM public.estoque_produto),
     'all_titles',(SELECT count(*) FROM public.accounts_receivable),'all_installments',(SELECT count(*) FROM public.accounts_receivable_installments))::text"""))
def os_call(uid,o,it,exp,key,open_seam=False):
    pre="\\set VERBOSITY verbose\n"
    if open_seam:
        # S-OS: endpoint candidato aberto SÓ nesta transação revertida (mesmo GRANT do os_endpoint.py + gate do harness).
        pre+="BEGIN;GRANT EXECUTE ON FUNCTION public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text) TO authenticated;UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true WHERE singleton;"
        pre+=f"INSERT INTO platform_private.resale_pilot_allowlist_v1(gate,operation,actor_id,organization_id,partner_id,order_id,order_item_id,product_id,synthetic,created_by,valid_until) SELECT 'b2b_resale','os_create','{uid}',po.seller_organization_id_eff,po.partner_id,po.id,i.id,i.product_id,true,'{uid}',now()+interval '1 hour' FROM (SELECT id,partner_id,'00000000-0000-0000-0000-000000000001'::uuid seller_organization_id_eff FROM public.partner_orders WHERE id='{o}') po JOIN public.partner_order_items i ON i.order_id=po.id AND i.id='{it}';"
    q=pre+m.claims(uid)+f"SELECT public.rpc_b2b_resale_os_create_v1('{o}','{it}','{exp}'::timestamptz,'{key}');"
    if open_seam: q+=f"RESET ROLE;SELECT (SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{o}')||'|'||(SELECT count(*) FROM public.entregas WHERE partner_order_id='{o}');ROLLBACK;"
    return d.raw(q)
errs=lambda r:[l for l in r.stderr.splitlines() if l.startswith('ERROR')]
CTRL='e11dd06e-9bcc-4e30-bc2c-bfd821c19543';CTRL_ITEM='36b410d0-d7a2-4b1c-8ae1-de57479656c2';CTRL_OS='581bec9c-6c0b-4c1e-84ff-c349271db12e'
e0=effects(PB);g0=fp(PB)
pb_exp=d.last(f"SELECT updated_at FROM public.partner_orders WHERE id='{PB}'")
ctrl_exp=d.last(f"SELECT updated_at FROM public.partner_orders WHERE id='{CTRL}'")
closed=os_call(X.UADM,PB,item,pb_exp,'c2neg-resale-os-0001')
ok('estado contido (sem costura): endpoint OS sem EXECUTE para authenticated',closed.returncode!=0 and 'permission denied' in closed.stderr,errs(closed))
neg=os_call(X.UADM,PB,item,pb_exp,'c2neg-resale-os-0001',True)
neg2=os_call(X.UADM,PB,item,pb_exp,'c2neg-resale-os-0002',True)
info('motivo da negativa OS PB com endpoint aberto',dict(first=errs(neg),second=errs(neg2)))
ok('PB: com endpoint/gate abertos, criação de OS negada por regra de negócio (não ACL), repetição idem',neg.returncode!=0 and neg2.returncode!=0 and 'permission denied' not in neg.stderr+neg2.stderr,dict(a=errs(neg),b=errs(neg2)))
pos=os_call(X.UADM,CTRL,CTRL_ITEM,ctrl_exp,'resale-os-create-0001',True)
pl=[l for l in pos.stdout.strip().splitlines() if l.startswith('{')]
pv=json.loads(pl[-1]) if pos.returncode==0 and pl else None
ok('controle positivo (mesma identidade, mesma costura): pedido aprovado r12 devolve sua OS 581bec9c (replay)',pv is not None and pv.get('ok') is True and pv.get('os_id')==CTRL_OS,dict(rc=pos.returncode,out=pos.stdout[-400:],err=errs(pos)))
e1=effects(PB)
ok('nova conexão: PB e global sem efeito em saldo/título/OS/entrega/estoque; costura revertida',e1==e0 and fp(PB)==g0 and e1['os']==0 and e1['entregas']==0 and e1['titles']==0 and d.last("SELECT enabled::text FROM platform_private.b2b_resale_logistics_gate_v1")=='false' and 'authenticated' not in d.last("SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid='public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)'::regprocedure"),dict(before=e0,after=e1))
SEAMS.append('S-AUTH usuários fictícios em auth.users antes das constraints (prep_restore.sh)')
SEAMS.append('S-OS endpoint candidato rpc_b2b_resale_os_create_v1 + gate + concessão os_create do piloto (ator/org/parceiro/pedido/item/produto exatos, igual ao harness) somente dentro de transações revertidas, idênticas para PB e controle')
neg,neg2=neg,neg2
e2=e1
(att/'effects.json').write_text(json.dumps(dict(before=e0,after_negative=e1,after_positive_control=e2,closed=errs(closed),negative=[neg.stderr[-800:],neg2.stderr[-800:]],positive=dict(rc=pos.returncode,out=pos.stdout[-600:],err=pos.stderr[-600:])),indent=1)+'\n')
(att/'checks.json').write_text(json.dumps(dict(order=PB,seams=SEAMS,checks=checks),indent=1,ensure_ascii=False,default=str)+'\n')
fails=[c for c in checks if c['status']=='FAIL'];(att/'exitcode').write_text(('1' if fails else '0')+'\n');print(len([c for c in checks if c['status']=='PASS']),'PASS',len(fails),'FAIL');sys.exit(1 if fails else 0)
