"""Stage only reviewed source outside checkout; no hosted operations."""
from pathlib import Path
import json,hashlib,sys
H=Path(__file__).resolve().parent
ROOT=H.parents[1]
BASELINE='c30af10c472255c919d167bc555c4f757eedaff0'
APPROVAL='e6a67a2d4c0146760c17e6c5bf6003027dedf87f'
PRE='d181e5b904cb8b4b5ad8a42a0f398173909d73da9b63e54cb06479c0a7b8a73f'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def stage(destination,rollback=False):
 dest=Path(destination).resolve()
 if dest==ROOT or ROOT in dest.parents:raise ValueError('destination_inside_project')
 if dest.exists() and any(dest.iterdir()):raise ValueError('destination_not_empty')
 m=json.loads((H/'manifest.json').read_text())
 if m['canonical_ref']!='swzpzcwiasxmjutrmvkm':raise ValueError('wrong_ref')
 if m['baseline_commit']!=BASELINE or m['approval_commit']!=APPROVAL:raise ValueError('fixed_baseline_drift')
 f=m['runtime']
 if f['path']!='src/components/ordens-servico/OSDetalhesDialog.tsx' or f['pre']!=PRE or f['pre']==f['post']:raise ValueError('scope_drift')
 for path,digest in m['protected'].items():
  if sha(ROOT/path)!=digest:raise ValueError('protected_drift:'+path)
 for path,digest in m['artifacts'].items():
  if sha(H/path)!=digest:raise ValueError('artifact_drift:'+path)
 if sha(ROOT/f['path'])!=f['post'] or sha(H/f['rollback'])!=f['pre']:raise ValueError('source_drift')
 p=dest/f['path'];p.parent.mkdir(parents=True,exist_ok=True)
 p.write_bytes((H/f['rollback'] if rollback else ROOT/f['path']).read_bytes())
if __name__=='__main__':
 if len(sys.argv)!=3 or sys.argv[1] not in ('candidate','rollback'):raise SystemExit('stage.py candidate|rollback external-directory')
 stage(sys.argv[2],sys.argv[1]=='rollback')