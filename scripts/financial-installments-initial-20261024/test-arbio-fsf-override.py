"""Owner override audit: local PG only; no policy resolver or runtime import created."""
from pathlib import Path
import importlib.util, sys, json, csv, hashlib
from decimal import Decimal as D, ROUND_HALF_UP, getcontext
sys.dont_write_bytecode = True
getcontext().prec = 60
H = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('battery', H/'test-financial-battery.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
C = json.loads((H/'arbio-fsf-policy.full-term-20261028.superseded.json').read_text())
OUT = b.ROOT/'docs/auditorias/evidencias-cadeia-financeira-20261029/price-authority-1753/full-term-superseded-override'
rows = []
def record(label, status, expected, actual, level='LOCAL_DECIMAL_PG_ARITHMETIC', priority='P1'):
    rows.append(dict(id=f'ARFSF-OVR-{len(rows)+1:03}',cenario=label,status=status,
        expectativa=str(expected),observado=str(actual),nivel=level,severidade=priority))
def check(label, expected, actual, level='LOCAL_DECIMAL_PG_ARITHMETIC'):
    record(label, 'PASS' if expected == actual else 'FAIL', expected, actual, level)
def money(x): return x.quantize(D('.01'),rounding=ROUND_HALF_UP)
def main():
    assert C['status']=='HISTORICAL_SUPERSEDED_FOR_NEW_PLANS' and C['runtime_enabled'] is False
    assert C['interest_decision']['interest_start']=='operation_initial_date'
    assert C['interest_decision']['band_incidence']=='single_selected_rate_over_entire_term'
    assert C['interest_decision']['deduct_30_days'] is False
    assert C['interest_decision']['marginal_rates_allowed'] is False
    assert b.pg.root.is_relative_to(Path('/tmp'))
    b.pg.start(); b.pg.sql(b.SETUP)
    b.pg.sql(b.LIVE['bodies']['fn_b2b_apply_interest'])
    observed=b.pg.sql("SELECT md5(pg_get_functiondef('fn_b2b_apply_interest(numeric,text,numeric,numeric)'::regprocedure))")
    check('pin corpo capturado (não recaptura LIVE)', b.LIVE['hashes']['fn_b2b_apply_interest'], observed, 'LOCAL_HASH')
    for p in C['policies']:
        check('desconto fixo '+p['key'],'40',p['discount_percent'],'DRAFT_SPEC')
    for v in C['reference_vectors']:
        net=D(v['table'])*D('.60')
        expected=money(net*(1+D(v['rate'])/100)**v['months'])
        check('vetor fixture '+v['key'],D(v['expected']),expected,'DECIMAL_INDEPENDENT')
        actual=D(b.pg.sql(f"SELECT fn_b2b_apply_interest({net},'compound',{v['rate']},{v['months']})"))
        check('helper '+v['key'],expected,actual)
    # Rejected hypotheses are negative tests, never selectable policy options.
    for months in [3,6,8,12]:
        rate=D('1.8') if months<=6 else D('2')
        whole=money(D('60000')*(1+rate/100)**months)
        grace=money(D('60000')*(1+rate/100)**(months-1))
        check(f'não deduz mês hipotético {months}m',True,whole!=grace,'DECIMAL_NEGATIVE')
        if months>6:
            marginal=money(D('60000')*D('1.018')**6*D('1.02')**(months-6))
            check(f'não usa marginal {months}m',True,whole!=marginal,'DECIMAL_NEGATIVE')
        vector=next(v for v in C['reference_vectors'] if v['months']==months)
        check(f'período completo {months}m',str(whole),vector['expected'],'DRAFT_DECIMAL')
    for key,rate in [('29d','0'),('30d','0'),('31d','1.8'),('6m_exact','1.8'),('6m_plus_1d','2'),('12m_exact','2')]:
        fixture=next(x for x in C['boundary_fixtures'] if x['key']==key)
        check('fronteira normativa taxa '+key,rate,fixture['rate'],'DRAFT_BOUNDARY_NOT_SERVER_ENFORCEMENT')
        if key in ['29d','30d']:
            check('sem juros valor '+key,D('60000.00'),D(b.pg.sql("SELECT fn_b2b_apply_interest(60000,'none',0,0)")))
        else:
            if key in ['31d','6m_plus_1d']:
                record('valor fracionário '+key,'BLOCKED','Convenção contratual não inteira','Faixa definida, sem inventar pro-rata/calendário','CONTRACT', 'P0')
    check('>12m sem exceção aprovada','DENY_UNLESS_SEPARATE_APPROVED_EXCEPTIONAL_POLICY',C['owner_override']['beyond_12_months'],'DRAFT_SPEC')
    check('exceção não aprovada',False,C['owner_override']['exceptional_policy_approved'],'DRAFT_SPEC')
    check('desconto não condicionado à quitação antiga',True,C['owner_override']['settlement_only_discount_gate_superseded'],'DRAFT_SPEC')
    # Installed simulation body in reduced local schema, not hosted policy authorization.
    b.pg.sql(b.LIVE['bodies']['simulate_b2b_payment_plan_secure'])
    b.pg.sql(f"INSERT INTO partner_accounts VALUES('{b.uid(1)}',true); INSERT INTO commercial_payment_plans VALUES('{b.uid(10)}','OWNER LOCAL','OWNER',true,2,40,'compound',8,240,1,true,true,true,0,'discount_from_base');")
    cart=json.dumps(dict(table_amount=100000,discount_amount=40000,net_amount=60000,quote_required=False,lines=[]))
    session=f"SELECT set_config('test.uid','{b.uid(100)}',false); SELECT set_config('test.role','parceiro_b2b',false); SELECT set_config('test.partner','{b.uid(1)}',false); SELECT set_config('test.cart',{b.literal(cart)},false);"
    call=f"SELECT simulate_b2b_payment_plan_secure('{b.uid(1)}','{b.uid(10)}','[]'::jsonb)"
    def simulate(): return json.loads(b.pg.sql(session+call).splitlines()[-1],parse_float=D)
    snapshot=simulate()
    check('simulação 8m taxa2 prazo integral',D('70299.56'),D(str(snapshot['final_amount'])),'PG_SIMULATION_SYNTHETIC_AUTH')
    b.pg.sql('UPDATE commercial_payment_plans SET monthly_interest_percent=1.8,months_count=6;')
    newer=simulate()
    check('nova simulação6m usa1.8',D('66778.69'),D(str(newer['final_amount'])),'PG_SIMULATION_SYNTHETIC_AUTH')
    check('envelope anterior8m não recalculado após mudar plano',D('70299.56'),D(str(snapshot['final_amount'])),'TRANSPORT_SNAPSHOT_NOT_PERSISTED')
    check('taxa do envelope anterior preservada',D('2'),D(str(snapshot['payment_plan']['monthly_interest_percent'])),'TRANSPORT_SNAPSHOT_NOT_PERSISTED')
    for value,column,reason in [(-1,'monthly_interest_percent','invalid_interest_rate'),(41,'discount_percent','discount_exceeds_limit')]:
        b.pg.sql(f'UPDATE commercial_payment_plans SET {column}={value};')
        error=b.pg.sql(session+call,ok=False)
        check('simulação negativa '+reason,True,reason in error,'PG_SIMULATION_SYNTHETIC_AUTH')
        b.pg.sql(f'UPDATE commercial_payment_plans SET {column}='+('1.8' if column=='monthly_interest_percent' else '40')+';')
    error=b.pg.sql(session+call.replace("'[]'::jsonb)","'[]'::jsonb,current_date-1)"),ok=False)
    check('vencimento retroativo recusado',True,'invalid_due_date' in error,'PG_SIMULATION_SYNTHETIC_AUTH')
    error=b.pg.sql(session+f"SELECT set_config('test.partner','{b.uid(2)}',false);"+call,ok=False)
    check('outro parceiro negado guard legado',True,'forbidden_partner' in error,'PG_REDUCED_GUARD_NOT_TENANT_RLS')
    for table,expected in [('100000.01','63298.68'),('0.01','0.01')]:
        net=D(table)*D('.60')
        actual=D(b.pg.sql(f"SELECT fn_b2b_apply_interest({net},'compound',1.8,3)"))
        check('centavos base exata '+table,D(expected),actual,'DECIMAL_ROUNDING_NOT_INSTALLMENT_POLICY')
    for label,reason in [
        ('>12m bloqueio real','Nenhum resolver novo instalado; não confundir especificação DENY com enforcement'),
        ('calendário fim mês/ano bissexto e6m+1d','max_days e months_count não provam meses civis; regra de ancoragem ausente'),
        ('parcelamento/amortização soma/conciliação','Não assumir Price, rateio ou juros por parcela; P0 saldo duplicado e P1 centavos anteriores abertos'),
        ('mudança posterior faixa/replay/ACK perdido','Snapshots/hash e continuity existentes devem ser provados com versão observada; política não instalada'),
        ('snapshot tabela vigente histórico/taxa pós-faturar','Não modificar históricos; guards cadeia integral/JWT não executados'),
        ('cross-tenant A/B RLS e revogação','PG schema/Auth reduzidos não demonstram autorização real'),
        ('limite/risco/garantias/acordo/inadimplência','Preservados; cálculo isolado não prova atribuição nem dupla aprovação'),
        ('produção/entrega/CQ reprovado e título único','Contratos operacionais e A2 contidos; não abrir writer'),
        ('billing aprovação versus entrega','Gatilho indeciso; nenhuma cobrança ou retentativa'),
        ('pro-rata/mora/antecipação/correção','Convenção e índice pendentes; nenhuma fórmula default'),
        ('tabela vigente catálogo/simulador/features','Motor comercial único, parceiro canônico e atribuição específica ainda precisam prova'),
        ('aprovação comercial/jurídica','Incidência e taxa única decididas pelo proprietário; implantação e validação jurídica não executadas'),
        ('1 mês civil versus30dias','Exemplo1m financiado>30d é aritmética explícita1.8%; não classifica mês civil automaticamente'),
    ]: record(label,'BLOCKED','Contrato/prova/decisão necessários',reason,'CONTRACT','P0' if 'billing' in label or 'snapshot' in label else 'P1')
    record('JWT/browser/LIVE/pagamento/fiscal','NOT RUN','Somente futuro autorizado','Nenhuma operação realizada','REAL')
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'resultados.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    with (OUT/'matriz.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
    totals={s:sum(r['status']==s for r in rows) for s in ['PASS','FAIL','BLOCKED','NOT RUN']}
    (OUT/'execucao.json').write_text(json.dumps(dict(totals=totals,real_PASS=0,
        draft_sha256=hashlib.sha256((H/'arbio-fsf-policy.full-term-20261028.superseded.json').read_bytes()).hexdigest(),
        ref_of_historical_capture=b.LIVE['ref'],live_recaptured=False,
        method='Decimal 60 digits / ROUND_HALF_UP; captured helper local only; synthetic SETUP; no date resolver enforcement'),indent=2)+'\n')
    print(totals)
    if totals['FAIL']: raise SystemExit(1)
if __name__=='__main__': main()