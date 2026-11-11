"""Creates isolated source mirror and invokes the existing reconstruction; no hosted access."""
import hashlib,json,os,shutil,subprocess,sys,tempfile
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
def main():
    assert os.environ.get('PGHOST') is None or not os.environ.get('PGHOST'), 'HOSTED_PG_ENV_REFUSED'
    out=H/'evidence';out.mkdir(exist_ok=True)
    nums=[int(x.name.split('-')[-1]) for x in out.glob('attempt-*')]
    attempt=out/f'attempt-{max(nums,default=0)+1:03d}';attempt.mkdir()
    work=Path(tempfile.mkdtemp(prefix='seller-reject-mirror-',dir='/tmp'));mirror=work/'project';mirror.mkdir()
    shutil.copytree(ROOT/'scripts',mirror/'scripts',ignore=shutil.ignore_patterns('evidence','__pycache__','.git'))
    # Some reviewed captures live in evidence; copy them too, retaining all source bytes.
    for p in (ROOT/'scripts').rglob('evidence'):
        if p.is_dir(): shutil.copytree(p,mirror/p.relative_to(ROOT),dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','.git'))
    # Synthetic fixture UUID maps to captured ARBio UUID BEFORE any boot/data/order.
    fixture=mirror/'scripts/b2b-solid-packaging-order-20261106/test-local-pg.py'
    text=fixture.read_text();anchor='A, F = u(1), u(2)';assert text.count(anchor)==1
    fixture.write_text(text.replace(anchor,"A, F = '007bb519-cba0-4704-be2c-cb93ad010048', u(2)"))
    driver=mirror/'scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/compose_current.py'
    text=driver.read_text();anchor="  if os.environ.get('NEW_E2E_LINKED_APPROVAL')=='1':";assert text.count(anchor)==1
    block="""  if os.environ.get('NEW_E2E_SELLER_REJECT')=='1':
   SR=load('seller_reject',ROOT/'scripts/b2b-downstream-audit-20261107/seller-reject-pending-20261111/mirror_flow.py')
   results=SR.run(B,Review70.Review,Q,A,choice,OUT)
   triggers38.assert_and_write(B,ROOT,OUT,'after-seller-reject')
   checks.append(dict(test='38 real captured triggers preserved after seller reject',status='PASS',checks=len(results)))
   return 0
"""
    driver.write_text(text.replace(anchor,block+anchor))
    (attempt/'source-manifest.json').write_text(json.dumps(dict(workspace=str(work),synthetic_seams=['Auth SQL claims; schema and dependency seams inherited from current rebuild','synthetic seller fixture UUID mapped before boot; final candidate unchanged','temporary composition branch; no frozen source edits'],files={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in H.glob('*') if p.is_file()}),indent=2)+'\n')
    pg=next(Path('/nix/store').glob('*-postgresql-17.11/bin'))
    env={**os.environ,'PATH':str(pg)+':'+os.environ['PATH'],'NEW_E2E_OUT':str(attempt),'NEW_E2E_SELLER_REJECT':'1'}
    r=subprocess.run([sys.executable,str(driver)],cwd=mirror,env=env,capture_output=True,text=True,timeout=540)
    (attempt/'run.stdout.txt').write_text(r.stdout);(attempt/'run.stderr.txt').write_text(r.stderr);(attempt/'run.exitcode').write_text(str(r.returncode)+'\n')
    print(json.dumps(dict(attempt=str(attempt),workspace=str(work),exitcode=r.returncode)));print(r.stdout[-4500:]);print(r.stderr[-2500:]);return r.returncode
if __name__=='__main__':sys.exit(main())