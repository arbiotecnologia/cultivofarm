"""Run exact closed install plus original integration/concurrency in disposable PG."""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

H = Path(__file__).resolve().parent
OUT = H / 'evidence'
OUT.mkdir(exist_ok=True)
results = []


def run(name, args):
    with (OUT / (name + '.log')).open('w') as log:
        result = subprocess.run(args, stdout=log, stderr=subprocess.STDOUT)
    results.append({'step': name, 'exit': result.returncode})
    (OUT / 'run-results.json').write_text(json.dumps(results, indent=2) + '\n')
    if result.returncode:
        raise SystemExit(result.returncode)


run('prepare-exact', [sys.executable, str(H / 'prepare_local.py')])
# Historical harness imports a socket-only module from /tmp/c2neg.
Path('/tmp/c2neg').mkdir(exist_ok=True)
shutil.copyfile(H / 'db.py', '/tmp/c2neg/db.py')
with tempfile.TemporaryDirectory(prefix='original-cancel-final-tests-', dir='/tmp') as temp:
    work = Path(temp)
    (work / 'evidence').mkdir()
    shutil.copytree(H.parent / 'capture', work / 'capture')
    for name in ['test_deterministic.py', 'test_integration.py']:
        shutil.copyfile(H.parent / name, work / name)
        run(name, [sys.executable, str(work / name)])
    shutil.copytree(work / 'evidence', OUT / 'original-harness', dirs_exist_ok=True)
run('final-roundtrip-awaiting', [sys.executable, str(H / 'test_final.py')])
(OUT / 'exitcode').write_text('0\n')
print('FINAL_LOCAL_SUITE_PASS', OUT)