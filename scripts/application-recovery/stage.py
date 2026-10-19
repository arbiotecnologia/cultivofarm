"""Binary staging only outside checkout; validate every source/rollback/protected hash first."""
from pathlib import Path
import hashlib,json,sys
H=Path(__file__).resolve().parent;ROOT=H.parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def stage(destination,rollback=False):
 dest=Path(destination).resolve()
 if dest==ROOT or ROOT in dest.parents:raise ValueError('destination_inside_project')
 if dest.exists() and any(dest.iterdir()):raise ValueError('destination_not_empty')
 if sha(H/'manifest.json')!=(H/'manifest.sha256').read_text().strip():raise ValueError('manifest_drift')
 m=json.loads((H/'manifest.json').read_bytes())
 if m['canonical_ref']!='swzpzcwiasxmjutrmvkm':raise ValueError('binding_unproven')
 for rel,digest in m['protected'].items():
  if sha(ROOT/rel)!=digest:raise ValueError('protected_drift:'+rel)
 for rel,digest in m['artifacts'].items():
  if sha(H/rel)!=digest:raise ValueError('artifact_drift:'+rel)
 for item in m['files']:
  if sha(ROOT/item['path'])!=item['post']:raise ValueError('source_drift:'+item['path'])
  if item['rollback'] and sha(H/item['rollback'])!=item['pre']:raise ValueError('rollback_drift:'+item['path'])
 removals=[]
 for item in m['files']:
  if rollback and not item['rollback']:removals.append(item['path']);continue
  target=dest/item['path'];target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes((H/item['rollback'] if rollback else ROOT/item['path']).read_bytes())
 if rollback:(dest/'REMOVE-ONLY.json').write_text(json.dumps(removals,indent=2)+'\n')
if __name__=='__main__':
 if len(sys.argv)!=3 or sys.argv[1] not in ('candidate','rollback'):raise SystemExit('usage: stage.py candidate|rollback outside-project-dir')
 stage(sys.argv[2],sys.argv[1]=='rollback')