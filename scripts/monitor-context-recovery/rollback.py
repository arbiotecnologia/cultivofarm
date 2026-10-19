from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parents[2]
pkg=Path(__file__).resolve().parent
m=json.loads((pkg/'manifest.json').read_text())
rollback='--apply' in sys.argv
for e in m['files']:
 p=root/e['path']
 if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=e['post_sha256']: raise SystemExit('DRIFT: '+e['path'])
 if e['pre_sha256'] is not None and hashlib.sha256((pkg/'baseline'/e['path']).read_bytes()).hexdigest()!=e['pre_sha256']: raise SystemExit('BASELINE DRIFT: '+e['path'])
print('CHECK_OK: all candidate and baseline hashes match')
if rollback:
 for e in m['files']:
  p=root/e['path']
  if e['pre_sha256'] is None: p.unlink()
  else: p.write_bytes((pkg/'baseline'/e['path']).read_bytes())
 print('ROLLBACK_OK: exact baseline restored (no SQL/publish)')
