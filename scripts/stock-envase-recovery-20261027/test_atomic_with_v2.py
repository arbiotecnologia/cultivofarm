"""Re-run the FULL delivery-atomic-hardening regression (test_pg.py, 97 cases) on the v2 COMPOSITION:
atomic install -> proof install + POST (= applied release-combined) -> stock/envase v2 install-v2 (PRE+POST),
on disposable PG. Atomic evidence files are restored afterwards; results go to this package."""
import json, shutil, sys
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
PROOF = H.parent / 'delivery-proof-authz-20261030'
sys.path.insert(0, str(ATOMIC)); sys.path.insert(0, str(PROOF)); sys.path.insert(0, str(H))
import assemble_proof
import test_pg as T
res = ATOMIC / 'test-results.json'; bak = H / '.atomic-test-results.bak'
shutil.copyfile(res, bak)
orig_sql = T.sql
state = {'done': False}
def sql_with_v2(s):
    out = orig_sql(s)
    if not state['done'] and s == (ATOMIC / 'install.sql.review').read_text():
        assemble_proof.build()
        orig_sql((PROOF / 'install.sql.review').read_text())
        orig_sql((PROOF / 'postflight.sql.review').read_text())
        orig_sql((H / 'install-v2.sql.review').read_text())   # PRE pins + candidate + exact POST, one transaction
        orig_sql((H / 'postflight-v2.sql.review').read_text())
        state['done'] = True
        print('PROOF_AND_V2_INSTALLED_AFTER_ATOMIC exact POSTs ok', flush=True)
    return out
T.sql = sql_with_v2
rc = 0
try:
    T.main()
except SystemExit as e:
    rc = e.code or 0
finally:
    if res.exists(): shutil.copyfile(res, H / 'test-atomic-with-v2-results.json')
    shutil.copyfile(bak, res); bak.unlink()
    r = json.loads((H / 'test-atomic-with-v2-results.json').read_text())
    print('ATOMIC_WITH_V2', 'v2_installed=' + str(state['done']), sum(x['status'] == 'PASS' for x in r), 'PASS',
          sum(x['status'] == 'FAIL' for x in r), 'FAIL', sum(x['status'] == 'BLOCKED' for x in r), 'BLOCKED', flush=True)
    if not state['done']: rc = 1
sys.exit(rc)
