"""Run test_v2_pg with an explicit overall deadline; unbuffered log."""
import json, subprocess, sys, time
from pathlib import Path
H = Path(__file__).resolve().parent
t = time.monotonic()
with (H / 'test_v2_pg-current.log.txt').open('w') as log:
    p = subprocess.Popen([sys.executable, '-u', str(H / 'test_v2_pg.py')], stdout=log, stderr=subprocess.STDOUT)
    try: rc = p.wait(timeout=540)
    except subprocess.TimeoutExpired:
        p.kill(); p.wait(timeout=5); rc = 124; log.write('\nTOTAL_RUNNER_TIMEOUT limit=540s\n')
r = {'runner': 'test_v2_pg', 'exit_code': rc, 'elapsed_seconds': round(time.monotonic() - t, 3), 'budget_seconds': 540}
(H / 'test_v2_pg-timing.json').write_text(json.dumps(r, indent=2) + '\n'); print(json.dumps(r)); sys.exit(rc)
