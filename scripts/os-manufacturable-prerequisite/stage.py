"""Validate all bytes before staging. Never applies to checkout/hosted systems."""
from pathlib import Path
import hashlib,json,sys
H=Path(__file__).resolve().parent
ROOT=H.parents[1]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def stage(destination,rollback=False):
 dest=Path(destination).resolve()
 if dest==ROOT or ROOT in dest.parents: raise ValueError('destination_inside_project')
 if dest.exists() and any(dest.iterdir()): raise ValueError('destination_not_empty')
 if sha(H/'manifest.json')!=(H/'manifest.sha256').read_text().strip(): raise ValueError('manifest_drift')
 m=json.loads((H/'manifest.json').read_bytes())
 if m['canonical_ref']!='swzpzcwiasxmjutrmvkm': raise ValueError('binding_unproven')
 for p,d in m['protected'].items():
  if sha(ROOT/p)!=d: raise ValueError('protected_drift:'+p)
 for p,d in m['artifacts'].items():
  if sha(ROOT/p)!=d: raise ValueError('artifact_drift:'+p)
 for f in m['files']:
  if sha(ROOT/f['path'])!=f['post']: raise ValueError('source_drift:'+f['path'])
  if sha(H/f['rollback'])!=f['pre']: raise ValueError('rollback_drift:'+f['path'])
 for f in m['files']:
  target=dest/f['path'];target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes((H/f['rollback'] if rollback else ROOT/f['path']).read_bytes())
if __name__=='__main__':
 if len(sys.argv)!=3 or sys.argv[1] not in ('candidate','rollback'): raise SystemExit('stage.py candidate|rollback external-dir')
 stage(sys.argv[2],sys.argv[1]=='rollback')
