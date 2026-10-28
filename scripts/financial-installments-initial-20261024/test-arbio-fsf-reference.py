"""Reference audit only. Reuses existing local PG harness, no new runtime module."""
from pathlib import Path
import importlib.util, sys, json, csv, hashlib
from decimal import Decimal as D, ROUND_HALF_UP, getcontext
sys.dont_write_bytecode=True
getcontext().prec=60
H=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('financial_battery',H/'test-financial-battery.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
CONFIG=json.loads((H/'arbio-fsf-policy.draft.json').read_text())
OUT=b.ROOT/'docs/auditorias/evidencias-arbio-fsf-20261028'
rows=[]
def record(scenario,status,expected,actual,level='PG_REAL_BODY_REDUCED_SYNTHETIC_AUTH',priority='P1'):
    row=dict(id=f'ARFSF-{len(rows)+1:03}',cenario=scenario,status=status,expectativa=str(expected),observado=str(actual),nivel=level,severidade=priority)
    rows.append(row);print(status,scenario,actual,flush=True)
def main():
    assert CONFIG['status']=='DRAFT_REVIEW_ONLY' and not CONFIG['runtime_enabled']
    b.pg.start();b.pg.sql(b.SETUP)
    for name in ['fn_b2b_apply_interest','simulate_b2b_payment_plan_secure']:
        b.pg.sql(b.LIVE['bodies'][name])
        args='numeric,text,numeric,numeric' if name=='fn_b2b_apply_interest' else 'uuid,uuid,jsonb,date'
        observed=b.pg.sql(f"SELECT md5(pg_get_functiondef('public.{name}({args})'::regprocedure))")
        assert observed==b.LIVE['hashes'][name]
        record('pin '+name,'PASS',b.LIVE['hashes'][name],observed,'LOCAL_HASH_CONSISTENCY')
    for v in CONFIG['reference_vectors']:
        net=D(v['table'])*(1-D(v['discount'])/100)
        expected=(net*(1+D(v['rate'])/100)**v['months']).quantize(D('.01'),rounding=ROUND_HALF_UP)
        assert expected==D(v['expected'])
        observed=D(b.pg.sql(f"SELECT fn_b2b_apply_interest({net},'compound',{v['rate']},{v['months']})"))
        assert observed==expected
        record(v['key']+' Decimal vs installed interest','PASS',expected,observed)
    # Negative semantics remain in caller, not the pure arithmetic helper.
    b.pg.sql(f"INSERT INTO partner_accounts VALUES('{b.uid(1)}',true); INSERT INTO commercial_payment_plans VALUES('{b.uid(10)}','CASH LOCAL','CASH',true,0,40,'none',0,7,1,false,false,false,0,'discount_from_base');")
    cart=json.dumps(dict(table_amount=100000,discount_amount=40000,net_amount=60000,quote_required=False,lines=[]))
    session=f"SELECT set_config('test.uid','{b.uid(100)}',false); SELECT set_config('test.role','parceiro_b2b',false); SELECT set_config('test.partner','{b.uid(1)}',false); SELECT set_config('test.cart',{b.literal(cart)},false);"
    result=json.loads(b.pg.sql(session+f"SELECT simulate_b2b_payment_plan_secure('{b.uid(1)}','{b.uid(10)}','[]'::jsonb)").splitlines()[-1])
    # No payment receipt exists in this harness. This exposes missing gate in isolated simulation.
    assert result['final_amount']==60000
    record('40% simulação não comprova quitação','BLOCKED','Concessão somente após quitação comprovada','Retorna60000 como simulação sem pagamento; não cria pedido nem constitui concessão',priority='P0')
    err=b.pg.sql(session+f"SELECT simulate_b2b_payment_plan_secure('{b.uid(1)}','{b.uid(10)}','[]'::jsonb,current_date-1)",ok=False)
    assert 'invalid_due_date' in err;record('vencimento retroativo simulação','PASS','invalid_due_date','invalid_due_date')
    # Existing captured credit body, matched to read-only LIVE hash; reduced tables, no JWT/RLS claim.
    capture=json.loads((b.ROOT/'scripts/owner-orders-20261023/credit-numeric-20261024/current-base-reconciliation-20261024/capture/functions.json').read_text())
    credit=next(f for f in capture['functions'] if f['sig']=='public.fn_b2b_credit_exposure(uuid,numeric,uuid)')
    assert credit['md5']=='213ac31f3a30816ead75365b0d1fed18'
    b.pg.sql("""CREATE TABLE partner_financial_settings(partner_id uuid,credit_limit numeric,overdue_tolerance_days int,block_if_overdue boolean,credit_limit_action text); GRANT ALL ON partner_financial_settings TO postgres;
      ALTER TABLE accounts_receivable ADD partner_id uuid,ADD status text;
      ALTER TABLE accounts_receivable_installments ADD received_amount numeric DEFAULT 0;
      ALTER TABLE partner_orders ADD partner_id uuid,ADD status text,ADD final_amount_with_interest numeric,ADD total numeric,ADD receivable_generated boolean;
      CREATE TABLE partner_order_financial_links(partner_order_id uuid); GRANT ALL ON partner_order_financial_links TO postgres;""")
    b.pg.sql(credit['sql']);assert b.pg.sql("SELECT md5(pg_get_functiondef('fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure))")==credit['md5']
    def exposure(amount=0): return json.loads(b.pg.sql(f"SELECT fn_b2b_credit_exposure('{b.uid(1)}',{amount},NULL)"),parse_float=D)
    b.pg.sql(f"INSERT INTO partner_financial_settings VALUES('{b.uid(1)}',100000,0,true,'block');")
    for amount,reason in [(100000,'OK'),('100000.01','LIMIT_EXCEEDED_BLOCK')]:
        r=exposure(amount);assert r['reason_code']==reason;record('limite '+str(amount),'PASS',reason,r['reason_code'])
    b.pg.sql(f"UPDATE partner_financial_settings SET credit_limit=0;");assert exposure()['reason_code']=='NO_LIMIT_DEFINED';record('limite indefinido','PASS','NO_LIMIT_DEFINED','NO_LIMIT_DEFINED')
    b.pg.sql(f"UPDATE partner_financial_settings SET credit_limit=100000; INSERT INTO accounts_receivable(id,partner_id,status) VALUES('{b.uid(202)}','{b.uid(1)}','OPEN'); INSERT INTO accounts_receivable_installments(receivable_id,original_amount,received_amount,status,due_date) VALUES('{b.uid(202)}',1000,200,'PARTIAL',current_date-1);")
    r=exposure();assert r['reason_code']=='OVERDUE_BLOCK' and D(str(r['saldo_vencido']))==800;record('saldo vencido um dia + parcial','PASS','OVERDUE_BLOCK;800',json.dumps(r,default=str))
    # Contrasts order policy immediate block with existing single tolerance setting.
    b.pg.sql('UPDATE partner_financial_settings SET overdue_tolerance_days=5;')
    for days,reason in [(5,'OK'),(6,'OVERDUE_BLOCK')]:
        b.pg.sql(f'UPDATE accounts_receivable_installments SET due_date=current_date-{days};')
        assert exposure()['reason_code']==reason;record('calculador tolerancia5 atraso'+str(days),'PASS',reason,reason)
    record('tolerancia5 nao cumpre pedido bloqueado por qualquer vencido','BLOCKED','Pedido0d e entrega>5d gates distintos','Um campo de tolerância não autoriza dois gates; transporte de entrega não exercitado')
    for scenario,reason in [
      ('fonte cinco páginas/validade contratual','Arquivo não disponível; transcrição não atesta assinatura/vigência'),
      ('40% quitado real / parcial / pendente','Receipts/liquidação canônica e concessão precisam contrato instalado'),
      ('30d taxa exata','0 a1% não escolhe taxa; vetor0% não default'),
      ('safra mínimo/calendário/parcelas','Parâmetros ausentes, max_days não presumido meses*30'),
      ('risco médio/sem garantia forte','Classificação e suficiência/garantias adicionais sem contrato canônico provado'),
      ('90d contrato/histórico positivo','Documento binário/aceite/histórico não provados'),
      ('acordo descumprido/reincidência','Sem comando canônico revisado da suspensão'),
      ('produção/entrega dupla aprovação','Contratos operacionais/A2 contidos; não ativar'),
      ('mora pro-rata/multa/correção','Sugerida; day basis e índice indefinidos, nenhuma fórmula defaultada'),
      ('antecipação/triangular/documentos','Exigem validação legal e autorização binária própria'),
      ('idempotência/ACK perdido','Regressões consumidor executadas separadamente; não receipts pagamento real'),
      ('cross-tenant A/B e dois parceiros owner','Calculator não é endpoint; Auth/RLS completos não carregados'),
      ('snapshots históricos/taxa pós-faturar','Bateria anterior tem FAIL/P0; cadeia integral imutável não exercitada'),
      ('preços hectare históricos','Não importar como preços vigentes, resolver dose/custo/ficha exige evidência'),
    ]:record(scenario,'BLOCKED','Contrato instalado e validação',reason)
    record('JWT/browser/pagamento/fiscal real','NOT RUN','Gate futuro autorizado','Proibidos nesta rodada','REAL')
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'resultados-pg.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    with (OUT/'matriz.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
    totals={s:sum(x['status']==s for x in rows) for s in ['PASS','FAIL','BLOCKED','NOT RUN']}
    (OUT/'execucao.json').write_text(json.dumps(dict(postgres=totals,real_PASS=0,has_failures=totals['FAIL']>0,
      draft_sha256=hashlib.sha256((H/'arbio-fsf-policy.draft.json').read_bytes()).hexdigest(),
      stubs=['Auth/roles/C2','cart resolver/hash','plan selector','schema reduced'],credit_hash=credit['md5'],
      source_original_available=False,limitations='Arithmetic/credit isolated bodies; not payment or policy enforcement'),indent=2)+'\n')
    print('TOTAL',totals)
if __name__=='__main__':main()