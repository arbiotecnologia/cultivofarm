"""Re-run the delivery-proof regression (test_proof_pg.py) on the v2 COMPOSITION: atomic -> proof (+exact POST)
-> stock/envase install-v2 (PRE+POST) -> proof fixtures/tests -> proof rollback. Disposable PG only.
The proof package's tracked artifacts it rewrites (capture/post-expected.json, install/postflight) are restored."""
import json, shutil, sys, traceback, types
from pathlib import Path
H = Path(__file__).resolve().parent
ATOMIC = H.parent / 'delivery-atomic-hardening-20261030'
PROOF = H.parent / 'delivery-proof-authz-20261030'
sys.path.insert(0, str(ATOMIC)); sys.path.insert(0, str(PROOF)); sys.path.insert(0, str(H))
keep = [PROOF / 'capture/post-expected.json', PROOF / 'install.sql.review', PROOF / 'postflight.sql.review', PROOF / 'test-proof-results.json']
saved = {p: p.read_bytes() for p in keep if p.exists()}
src = (PROOF / 'test_proof_pg.py').read_text()
anchor = "    sql((H / 'postflight.sql.review').read_text()); passed('exact POST passes on installed instance', expressions=len(exp))\n"
assert src.count(anchor) == 1
inj = anchor + ("    sql((V2 / 'install-v2.sql.review').read_text()); sql((V2 / 'postflight-v2.sql.review').read_text())\n"
                "    passed('V2 COMPOSITION: stock/envase install-v2 PRE+POST on top of atomic+proof')\n")
M = types.ModuleType('test_proof_pg_v2'); M.__file__ = str(PROOF / 'test_proof_pg.py'); M.V2 = H
exec(compile(src.replace(anchor, inj), str(PROOF / 'test_proof_pg.py'), 'exec'), M.__dict__)
rc = 0
try:
    M.main()
except Exception:
    traceback.print_exc(); M.checks.append({'test': 'execution stopped at concrete failure', 'status': 'FAIL', 'error': traceback.format_exc()[-3000:]})
finally:
    (H / 'test-proof-with-v2-results.json').write_text(json.dumps(M.checks, indent=2) + '\n')
    for p, b in saved.items(): p.write_bytes(b)
    r = M.checks
    print('PROOF_WITH_V2', sum(x['status'] == 'PASS' for x in r), 'PASS', sum(x['status'] != 'PASS' for x in r), 'NOT_PASS', flush=True)
    if not any('V2 COMPOSITION' in x['test'] for x in r) or any(x['status'] != 'PASS' for x in r): rc = 1
sys.exit(rc)
