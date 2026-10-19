"""Offline byte-exact source stage; never patches checkout or hosted systems."""
from pathlib import Path
import hashlib,json,sys
H=Path(__file__).resolve().parent
ROOT=H.parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def stage(destination,rollback=False):
 dest=Path(destination).resolve()
 if dest==ROOT or ROOT in dest.parents:raise ValueError('destination_inside_project')
 if dest.exists() and any(dest.iterdir()):raise ValueError('destination_not_empty')
 if sha(H/'manifest.json')!=(H/'manifest.sha256').read_text().strip():raise ValueError('manifest_drift')
 m=json.loads((H/'manifest.json').read_bytes())
 if m['canonical_ref']!='swzpzcwiasxmjutrmvkm':raise ValueError('wrong_binding')
 for p,d in m['protected'].items():
  if sha(ROOT/p)!=d:raise ValueError('protected_drift:'+p)
 for p,d in m['artifacts'].items():
  if sha(ROOT/p)!=d:raise ValueError('artifact_drift:'+p)
 for f in m['files']:
  if sha(ROOT/f['path'])!=f['post'] or sha(H/f['rollback'])!=f['pre']:raise ValueError('source_drift')
 for f in m['files']:
  p=dest/f['path'];p.parent.mkdir(parents=True,exist_ok=True)
  p.write_bytes((H/f['rollback'] if rollback else ROOT/f['path']).read_bytes())
if __name__=='__main__':
 if len(sys.argv)!=3 or sys.argv[1] not in ('candidate','rollback'):raise SystemExit('stage.py candidate|rollback external-directory')
 stage(sys.argv[2],sys.argv[1]=='rollback')
