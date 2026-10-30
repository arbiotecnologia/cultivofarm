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
import types
# The atomic suite's LAST characterization asserts LIVE behaviour (ungated batch vs gated group: batch wins, no
# deadlock). v2 deliberately gates the batch/motor first, so a raw row-lock holder that later calls the batch
# inverts the order. The composed run replaces ONLY that assertion with the v2 contract: either the original
# outcome, or PostgreSQL deadlock resolution where exactly one side aborts; zero partial effects are then checked
# by the suite's own snapshot checks that follow. Everything else runs byte-identical.
_src = (ATOMIC / 'test_pg.py').read_text()
_old = """    assert '"ok": true' in out and 'DELIVERY_OBSERVED_CONFLICT' in err2 and 'deadlock detected' not in err+err2,err+err2+out+out2
    checks.append({'test':'independent real batch versus group stock wait succeeds batch and rejects stale group without deadlock','status':'PASS','observed':err2})"""
assert _src.count(_old) == 1, 'characterization anchor'
_new = """    _dl = 'deadlock detected' in err+err2
    assert ('"ok": true' in out and 'DELIVERY_OBSERVED_CONFLICT' in err2) or (_dl and (('"ok": true' in out) != ('"success": true' in out2))), err+err2+out+out2
    assert pg.sql("SELECT count(*) FROM platform_private.stock_batch_requests WHERE request_key='independent-batch-proof';").strip().splitlines()[-1] == ('1' if '"ok": true' in out else '0')
    checks.append({'test':'V2 COMPOSITION: raw row-lock holder calling gated batch vs gated group -> '+('deadlock resolved by PostgreSQL, one side aborted, no partial effect' if _dl else 'batch wins, stale group rejected'),'status':'PASS','observed':(err+err2)[-300:],'batch_committed':'"ok": true' in out})"""
T = types.ModuleType('test_pg'); T.__file__ = str(ATOMIC / 'test_pg.py'); sys.modules['test_pg'] = T
exec(compile(_src.replace(_old, _new), str(ATOMIC / 'test_pg.py'), 'exec'), T.__dict__)
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
