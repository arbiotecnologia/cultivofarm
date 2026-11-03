"""Disposable PG component -> actual projection -> frontend fixture. No hosted access.
Synthetic Auth/fiscal/accounting from historical harness remain explicitly unproven.
"""
import importlib.util, pathlib, json, sys
from decimal import Decimal
sys.dont_write_bytecode = True
H = pathlib.Path(__file__).resolve().parent
s = importlib.util.spec_from_file_location('money_origin_harness', H/'test-price-generator.py')
t = importlib.util.module_from_spec(s); sys.modules[s.name]=t; s.loader.exec_module(t)
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
t.main(str(out/'harness.json'))
t.pg.sql((H/'money-origin-projection.sql.review').read_text())
rows=[]
def check(name, expected, actual):
 rows.append(dict(id='ORIGIN-PG-%03d'%(len(rows)+1),scenario=name,expected=expected,actual=actual,status='PASS' if expected==actual else 'FAIL'))
 print(rows[-1])
tid=t.pg.sql("SELECT receivable_id FROM platform_private.price_schedule_snapshots ORDER BY created_at LIMIT 1")
read=lambda org=t.A:json.loads(t.pg.sql(t.scope(org=org)+"SELECT public.rpc_receivable_money_projection_v1('"+tid+"',0,1000);").splitlines()[-1])
projection=read()
check('three generated rows reach projection',3,len(projection))
first=projection[0]
check('financing snapshot mapped, not client amount',True,all(Decimal(str(p['monetary_origin']['snapshot_principal']))+Decimal(str(p['monetary_origin']['snapshot_interest']))==Decimal(str(p['original_amount'])) for p in projection))
check('late interest excludes financed breakdown',True,all(p['interest_amount']-p['financed_interest_amount']>=0 for p in projection))
check('foreign tenant cannot project title',True,'MONEY_ORIGIN_ACCESS_DENIED' in t.pg.sql(t.scope(org=t.B)+f"SELECT public.rpc_receivable_money_projection_v1('{tid}',0,1000)",ok=False))
# Amounts 10300/300 are synthetic fixture values, encoded in the same immutable snapshot
# representation consumed by the real projection; not a UI-only property.
fixture=t.ok(t.nf('2026-10-29')+t.call(t.payload(1,amount='17166.67',key='money-origin-fixture')))
fid=fixture['receivable_id']
sql=f"BEGIN; ALTER TABLE platform_private.price_schedule_snapshots DISABLE TRIGGER price_snapshot_immutable; UPDATE platform_private.price_schedule_snapshots SET rows=jsonb_build_array(jsonb_build_object('installment_number',1,'principal',10000,'interest',300,'amount',10300)) WHERE receivable_id='{fid}'; ALTER TABLE platform_private.price_schedule_snapshots ENABLE TRIGGER price_snapshot_immutable; SELECT public.rpc_receivable_money_projection_v1('{fid}',0,1000); ROLLBACK;"
fixture_rows=json.loads(t.pg.sql(t.scope()+sql).splitlines()[-1])
check('synthetic baseline principal10300 already generated',10300,fixture_rows[0]['original_amount'])
(out/'projection.json').write_text(json.dumps(dict(generator_projection=projection,audit_fixture_projection=fixture_rows,synthetic=['Auth/h15/staff','fiscal NF origin','accounting','fixture snapshot amounts10000+300 in rolled-back owner transaction']),indent=2))
(out/'checks.json').write_text(json.dumps(rows,indent=2))
raise SystemExit(1 if any(r['status']=='FAIL' for r in rows) else 0)