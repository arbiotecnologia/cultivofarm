"""Run one existing rehearsal with explicit overall deadline and readable output."""
import json
import subprocess
import sys
import time
from pathlib import Path

H=Path(__file__).resolve().parent
def main():
    if len(sys.argv)!=2 or sys.argv[1] not in ('test_capability_pg',):
        raise SystemExit('Usage: python3 run_bounded.py test_capability_pg')
    name=sys.argv[1];started=time.monotonic()
    with (H/(name+'-current.log.txt')).open('w') as log:
        p=subprocess.Popen([sys.executable,'-u',str(H/(name+'.py'))],stdout=log,stderr=subprocess.STDOUT)
        try:rc=p.wait(timeout=480)
        except subprocess.TimeoutExpired:
            p.kill();p.wait(timeout=5);rc=124
            log.write('\nTOTAL_RUNNER_TIMEOUT limit=480s\n');log.flush()
    result={'runner':name,'exit_code':rc,'elapsed_seconds':round(time.monotonic()-started,3),'budget_seconds':480}
    (H/(name+'-timing.json')).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result),flush=True)
    return rc
if __name__=='__main__':sys.exit(main())