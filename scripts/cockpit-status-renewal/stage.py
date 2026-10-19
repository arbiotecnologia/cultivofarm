"""Verify immutable inputs; never rewrite hashes to approve a candidate."""
from pathlib import Path
import hashlib,json,subprocess,sys
R=Path(__file__).resolve().parent
def verify():
 m=json.loads((R/'manifest.json').read_text())
 if m['project_ref']!='swzpzcwiasxmjutrmvkm':raise ValueError('WRONG_PROJECT')
 for path,digest in m['files'].items():
  if hashlib.sha256((R/path).read_bytes()).hexdigest()!=digest:raise ValueError('ARTIFACT_DRIFT '+path)
 for path,entry in m.get('runtime',{}).items():
  root=R.parents[1]
  if hashlib.sha256((root/path).read_bytes()).hexdigest()!=entry['post']:raise ValueError('RUNTIME_DRIFT '+path)
  if entry['pre']==entry['post']:raise ValueError('INVALID_PRE_POST '+path)
  original=subprocess.check_output(['git','show',m['baseline_commit']+':'+path],cwd=root)
  if hashlib.sha256(original).hexdigest()!=entry['pre'] or (R/entry['rollback']).read_bytes()!=original:raise ValueError('ROLLBACK_DRIFT '+path)
 return m
if __name__=='__main__':verify();print('PASS fixed artifacts + immutable runtime rollback')