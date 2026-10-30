"""Re-run the FULL delivery-atomic-hardening regression (test_pg.py, 97 cases) with the
proof package installed right after the atomic install, on disposable PG. The atomic
package's own evidence files are restored afterwards; results go to this package."""
import json, shutil, sys
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
sys.path.insert(0, str(ATOMIC)); sys.path.insert(0, str(H))
import assemble_proof
import test_pg as T
res = ATOMIC / 'test-results.json'; bak = H / '.atomic-test-results.bak'
shutil.copyfile(res, bak)
orig_sql = T.sql
state = {'done': False}
def sql_with_proof(s):
    out = orig_sql(s)
    if not state['done'] and s == (ATOMIC / 'install.sql.review').read_text():
        state['done'] = True
        assemble_proof.build()
        orig_sql((H / 'install.sql.review').read_text())
        orig_sql((H / 'postflight.sql.review').read_text())
        print('PROOF_PACKAGE_INSTALLED_AFTER_ATOMIC exact POST ok', flush=True)
    return out
T.sql = sql_with_proof
rc = 0
try:
    T.main()
except SystemExit as e:
    rc = e.code or 0
finally:
    if res.exists(): shutil.copyfile(res, H / 'test-atomic-with-proof-results.json')
    shutil.copyfile(bak, res); bak.unlink()
    r = json.loads((H / 'test-atomic-with-proof-results.json').read_text())
    print('ATOMIC_WITH_PROOF', 'proof_installed=' + str(state['done']), sum(x['status'] == 'PASS' for x in r), 'PASS',
          sum(x['status'] == 'FAIL' for x in r), 'FAIL', sum(x['status'] == 'BLOCKED' for x in r), 'BLOCKED', flush=True)
    if not state['done']: rc = 1
sys.exit(rc)
