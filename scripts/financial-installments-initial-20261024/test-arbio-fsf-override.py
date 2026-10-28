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
C = json.loads((H/'arbio-fsf-policy.draft.json').read_text())
OUT = b.ROOT/'docs/auditorias/evidencias-arbio-fsf-override-20261028'
rows = []
def record(label, status, expected, actual, level='LOCAL_DECIMAL_PG_ARITHMETIC', priority='P1'):
    rows.append(dict(id=f'ARFSF-OVR-{len(rows)+1:03}',cenario=label,status=status,
        expectativa=str(expected),observado=str(actual),nivel=level,severidade=priority))
def check(label, expected, actual, level='LOCAL_DECIMAL_PG_ARITHMETIC'):
    record(label, 'PASS' if expected == actual else 'FAIL', expected, actual, level)
def money(x): return x.quantize(D('.01'),rounding=ROUND_HALF_UP)
def main():
    assert C['status']=='DRAFT_REVIEW_ONLY' and C['runtime_enabled'] is False
    assert C['formula'] is None
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
    # Explicit integer-month counterfactuals: never convert dates to financed months.
    for months in [6,8,12]:
        rate=D('1.8') if months<=6 else D('2')
        for start in ['sale','after_30d_HYPOTHETICAL_ONE_MONTH']:
            financed=D(months) if start=='sale' else D(months-1)
            single=money(D('60000')*(1+rate/100)**financed)
            marginal=money(D('60000')*D('1.018')**min(financed,6)*D('1.02')**max(financed-6,0))
            sqlsingle=D(b.pg.sql(f"SELECT fn_b2b_apply_interest(60000,'compound',{rate},{financed})"))
            # Product without intermediate rounding, not repeated helper amortization.
            sqlmarginal=D(b.pg.sql(f"SELECT round(60000*power(1.018::numeric,{min(financed,6)})*power(1.02::numeric,{max(financed-6,0)}),2)"))
            check(f'contrafactual única {months}m/{start}',single,sqlsingle)
            check(f'contrafactual marginal {months}m/{start}',marginal,sqlmarginal)
    for key,rate in [('29d','0'),('30d','0'),('31d','1.8'),('6m_exact','1.8'),('6m_plus_1d','2'),('12m_exact','2')]:
        fixture=next(x for x in C['boundary_fixtures'] if x['key']==key)
        check('fronteira normativa taxa '+key,rate,fixture['rate'],'DRAFT_BOUNDARY_NOT_SERVER_ENFORCEMENT')
        if key in ['29d','30d']:
            check('sem juros valor '+key,D('60000.00'),D(b.pg.sql("SELECT fn_b2b_apply_interest(60000,'none',0,0)")))
        else:
            record('valor/calendário '+key,'BLOCKED','Incidência/data e cálculo aprovados','Rate definida; data civil/30-360 e período financiado não definidos','CONTRACT', 'P0')
    check('>12m sem exceção aprovada','DENY_UNLESS_SEPARATE_APPROVED_EXCEPTIONAL_POLICY',C['owner_override']['beyond_12_months'],'DRAFT_SPEC')
    check('exceção não aprovada',False,C['owner_override']['exceptional_policy_approved'],'DRAFT_SPEC')
    check('desconto não condicionado à quitação antiga',True,C['owner_override']['settlement_only_discount_gate_superseded'],'DRAFT_SPEC')
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
        ('aprovação comercial/jurídica','Preferência única e alternativa marginal NÃO HOMOLOGADAS'),
    ]: record(label,'BLOCKED','Contrato/prova/decisão necessários',reason,'CONTRACT','P0' if 'billing' in label or 'snapshot' in label else 'P1')
    record('JWT/browser/LIVE/pagamento/fiscal','NOT RUN','Somente futuro autorizado','Nenhuma operação realizada','REAL')
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'resultados.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    with (OUT/'matriz.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
    totals={s:sum(r['status']==s for r in rows) for s in ['PASS','FAIL','BLOCKED','NOT RUN']}
    (OUT/'execucao.json').write_text(json.dumps(dict(totals=totals,real_PASS=0,
        draft_sha256=hashlib.sha256((H/'arbio-fsf-policy.draft.json').read_bytes()).hexdigest(),
        ref_of_historical_capture=b.LIVE['ref'],live_recaptured=False,
        method='Decimal 60 digits / ROUND_HALF_UP; captured helper local only; synthetic SETUP; no date resolver enforcement'),indent=2)+'\n')
    print(totals)
    if totals['FAIL']: raise SystemExit(1)
if __name__=='__main__': main()