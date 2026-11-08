#!/usr/bin/env python3
"""Composition driver, executes only in /tmp mirror; all experiments are local."""
import importlib.util,json,os,sys,traceback
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
assert ROOT.is_relative_to(Path('/tmp')), 'TEMP_MIRROR_REQUIRED'
OUT=Path(os.environ['NEW_E2E_OUT'])
checks=[]
def load(name,p):
 s=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def main():
 try:
  physical=ROOT/'scripts/b2b-downstream-audit-20261107/physical/finished-product'
  B=load('new_finished',physical/'test_after.py').B
  # Start from exact captured catalog, not an unidentified cached fixture.
  result=B.restore.restore()
  (OUT/'restore-results.json').write_text(json.dumps(result,indent=2)+'\n')
  assert not any(result.values()),result
  B.C.prepare_checkpoint(Path('/tmp')/'new-order-checkpoint.sql')
  checks.append(dict(test='fresh full physical catalog restoration and reviewed upstream composition',status='PASS'))
  # Capture the new checkpoint under the path used by existing local helper.
  # Subsequent composition is continued in this same database; no source evidence reused.
  print('NEW_PHYSICAL_BOOT_OK',flush=True)
 except Exception:
  traceback.print_exc();checks.append(dict(test='new composition',status='FAIL'))
 finally:
  (OUT/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
 return 0 if checks and all(x['status']=='PASS' for x in checks) else 1
if __name__=='__main__':sys.exit(main())
