"""Independent audit controls; existing inactive Price candidate, synthetic fixtures only."""
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP, getcontext
from datetime import date
import importlib.util, json, sys

ROOT = Path(__file__).resolve().parents[2]
PKG = ROOT / 'scripts/financial-installments-initial-20261024'
spec = importlib.util.spec_from_file_location('audit_existing_price', PKG / 'price-schedule.py')
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
getcontext().prec = 60
policy = json.loads((PKG / 'arbio-fsf-policy.draft.json').read_text())
cal = engine.load_real_calendar(PKG / 'calendars/paracatu-mg-2026-2027.json', policy)
rows = []
def check(id, description, expected, actual, source):
    rows.append(dict(id=id,scenario=description,expected=str(expected),actual=str(actual),status='PASS' if expected==actual else 'FAIL',layer='SIMULADO_DECIMAL_CANDIDATO_INATIVO',source=source))
def reject(id, code, fn):
    try: fn(); actual='ACCEPTED'
    except engine.Rejected as e: actual=str(e)
    check(id,code,code,actual,'price-schedule.py')

for n in (1,2,3):
    rate=Decimal(policy['active_candidate']['rates']['n1_30d' if n==1 else f'n{n}'])
    principal=Decimal('60000')
    # Own Decimal PMT and rounding, not engine.oracle_rows.
    i=rate/100; exact=principal/n if not i else principal*i*(1+i)**n/((1+i)**n-1)
    pmt=exact.quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
    balance=principal; expected=[]
    for k in range(n):
        interest=(balance*i).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
        amort=balance if k==n-1 else pmt-interest
        expected.append(interest+amort); balance-=amort
    got=engine.price_schedule('60000',n)
    check(f'AUD-PRICE-{n:03}',f'{n} parcelas Price, taxa recuperada da candidata {rate}%',expected,[x['payment'] for x in got['rows']],'arbio-fsf-policy.draft.json active_candidate (not installed)')
    check(f'AUD-PRICE-CLOSE-{n:03}','saldo final zero',Decimal('0'),got['rows'][-1]['balance'],'price-schedule.py')

check('AUD-DATE-001','NF+30 com clamp sem deriva de fevereiro',[date(2027,1,31),date(2027,2,28),date(2027,3,31)],engine.nominal_dates(date(2027,1,1),3),'price-schedule.py nominal_dates')
check('AUD-DATE-002','geração manual tardia não reinicia NF+30',engine.nominal_dates(date(2026,10,1),3),engine.nominal_dates(date(2026,10,1),3,date(2026,12,1)),'price-schedule.py nominal_dates')
for label,nominal,want in [('WEEKEND','2026-10-31','2026-11-03'),('NATIONAL','2026-09-07','2026-09-08'),('PARACATU','2026-10-20','2026-10-21')]:
    check('AUD-CALENDAR-'+label,'próximo útil nacional/Paracatu sem mudar valor',date.fromisoformat(want),engine.adjusted_due(date.fromisoformat(nominal),cal),'sealed calendar 2026-2027, no hosted verification')
reject('AUD-CALENDAR-COVERAGE','CALENDAR_COVERAGE_EXCEEDED',lambda: engine.adjusted_due(date(2028,1,1),cal))
reject('AUD-CREDIT-001','LIMIT_EXCEEDED_BLOCK',lambda: engine.candidate_plan('99000',3,'0','100000','financed_total'))
check('AUD-CREDIT-002','R$100000 exatos 1x ficam no limite',Decimal('0'),engine.candidate_plan('100000',1,'0','100000','financed_total')['available_after'],'candidate-only includes rounded financed installments')
reject('AUD-CREDIT-003','ZERO_CREDIT_LIMIT',lambda: engine.candidate_plan('1',1,'0','0','financed_total'))
reject('AUD-GENERATION-001','AUTO_GENERATION_BLOCKED',lambda: engine.candidate_plan('1',1,'0','100000','financed_total','automatic'))
reject('AUD-INSTALLMENTS-001','INSTALLMENTS_OUT_OF_RANGE',lambda: engine.price_schedule('60000',4))
reject('AUD-MONEY-001','PRINCIPAL_NOT_POSITIVE',lambda: engine.price_schedule('0',3))
reject('AUD-MONEY-002','PRINCIPAL_NOT_FINITE',lambda: engine.price_schedule('NaN',3))
reject('AUD-NF-001','NF_ISSUE_DATE_REQUIRED',lambda: engine.nominal_dates(None,3))

result={'status':'AUDIT_ONLY_NOT_OPERATIONAL','rates_source':'inactive existing policy; production assignment not proven','hosted':'NOT_EXECUTED','checks':rows,'pass':sum(x['status']=='PASS' for x in rows),'fail':sum(x['status']=='FAIL' for x in rows)}
if len(sys.argv)>1: Path(sys.argv[1]).write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(result,ensure_ascii=False))
raise SystemExit(1 if result['fail'] else 0)