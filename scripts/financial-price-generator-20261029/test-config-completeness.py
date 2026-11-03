"""Offline disposable PG only. Reuses audit harness and labels all synthetic authority.
Run in a clean /tmp copy; never a hosted connection or operational installer.
"""
import importlib.util, pathlib, json, sys
sys.dont_write_bytecode = True
H = pathlib.Path(__file__).resolve().parent
s = importlib.util.spec_from_file_location('price_config_harness', H / 'test-price-generator.py')
t = importlib.util.module_from_spec(s); sys.modules[s.name] = t; s.loader.exec_module(t)
t.main(str(H / 'config-harness-results.json'))
rows = []
def check(name, expected, actual):
    row = dict(id='CFG-FIX-%03d' % (len(rows)+1), scenario=name, expected=expected, actual=actual, status='PASS' if expected==actual else 'FAIL', level='DISPOSABLE_PG_SYNTHETIC_AUTH')
    rows.append(row); print(json.dumps(row))
p = t.PZ
for field, value in [('credit_limit','NULL'),('credit_limit',"'NaN'"),('block_if_overdue','NULL'),('overdue_tolerance_days','NULL'),('credit_limit_action','NULL'),('credit_limit_action',"'unknown'")]:
    # One transaction; rollback prevents contaminating the next field.
    actual = t.pg.sql(f"BEGIN; UPDATE public.partner_financial_settings SET {field}={value} WHERE partner_id='{p}'; SELECT coalesce(platform_private.b2b_credit_config_block('{p}'),'ALLOWED'); ROLLBACK;").strip().splitlines()[-1]
    expected = 'limite_nao_definido' if field=='credit_limit' else 'configuracao_financeira_incompleta'
    check('NULL/nonfinite configuration '+field+'='+value, expected, actual)
check('configured partner remains available', 'ALLOWED', t.pg.sql(f"SELECT coalesce(platform_private.b2b_credit_config_block('{p}'),'ALLOWED')"))
out = pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else H/'config-completeness-results.json'
out.write_text(json.dumps(dict(level='DISPOSABLE_PG_COMPONENT_NOT_E2E', synthetic=['Auth/h15/staff','fiscal origin','accounting gate','settings harness'], checks=rows),indent=2))
raise SystemExit(1 if any(r['status']=='FAIL' for r in rows) else 0)