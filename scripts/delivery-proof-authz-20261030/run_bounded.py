"""Run exactly one proof rehearsal with an explicit deadline (no aggregate 600 s command)."""
import json, subprocess, sys, time
from pathlib import Path
H = Path(__file__).resolve().parent
RUNNERS = {'test_proof_pg': 480, 'test_proof_install': 480}
def main():
    if len(sys.argv) != 2 or sys.argv[1] not in RUNNERS: raise SystemExit('Usage: run_bounded.py ' + '|'.join(RUNNERS))
    name = sys.argv[1]; budget = RUNNERS[name]; t = time.monotonic()
    with (H / (name + '-current.log.txt')).open('w') as log:
        p = subprocess.Popen([sys.executable, '-u', str(H / (name + '.py'))], stdout=log, stderr=subprocess.STDOUT)
        try: rc = p.wait(timeout=budget)
        except subprocess.TimeoutExpired:
            p.kill(); p.wait(timeout=5); rc = 124; log.write(f'\nTOTAL_RUNNER_TIMEOUT limit={budget}s\n')
    r = {'runner': name, 'exit_code': rc, 'elapsed_seconds': round(time.monotonic() - t, 3), 'budget_seconds': budget}
    (H / (name + '-timing.json')).write_text(json.dumps(r, indent=2) + '\n'); print(json.dumps(r), flush=True); return rc
if __name__ == '__main__': sys.exit(main())
