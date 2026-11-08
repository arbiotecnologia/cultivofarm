#!/usr/bin/env python3
"""New source-traced disposable composition; never recovery or hosted transport."""
import hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
H=Path(__file__).resolve().parent
ROOT=H.parents[2]
PG=next(Path('/nix/store').glob('*-postgresql-17.11/bin'))
OUT=H/'evidence';OUT.mkdir(exist_ok=True)

def main():
    work=Path(tempfile.mkdtemp(prefix='new-order-e2e-',dir='/tmp'))
    mirror=work/'project';mirror.mkdir()
    sources=[]
    # Entire scripts tree preserves relative generator dependencies, no repository metadata or secrets.
    shutil.copytree(ROOT/'scripts',mirror/'scripts')
    for p in sorted((ROOT/'scripts').rglob('*')):
        if p.is_file() and p.suffix in ('.py','.json','.review','.readonly','.sql'):
            sources.append(dict(file=str(p.relative_to(ROOT)),sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
    (OUT/'source-manifest.json').write_text(json.dumps(dict(kind='NEW_RECONSTRUCTION_NOT_RECOVERY',baseline='3d6a9ce8 reported reconciliation; current source bytes below',sources=sources),indent=2)+'\n')
    (OUT/'workspace.json').write_text(json.dumps(dict(workspace=str(work),mirror=str(mirror)))+'\n')
    env={**os.environ,'PATH':str(PG)+':'+os.environ['PATH'],'NEW_E2E_OUT':str(OUT)}
    runner=mirror/'scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/compose.py'
    r=subprocess.run([sys.executable,str(runner)],cwd=mirror,env=env,text=True,capture_output=True,timeout=540)
    (OUT/'run.stdout.txt').write_text(r.stdout);(OUT/'run.stderr.txt').write_text(r.stderr)
    (OUT/'run.exitcode').write_text(str(r.returncode)+'\n')
    print(r.stdout[-4500:]);print(r.stderr[-2500:]);return r.returncode
if __name__=='__main__':sys.exit(main())
