"""Offline candidate packaging; no writes to runtime, CQ, hosted or user sessions."""
from pathlib import Path
import json,hashlib,difflib
H=Path(__file__).resolve().parent;root=H.parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
b=H/'rollback/src/hooks/useAuth.tsx.review';c=H/'candidate-v2/src/hooks/useAuth.tsx'
if sha(root/'src/hooks/useAuth.tsx')!=sha(b):raise SystemExit('PACKAGE_BLOCKED: runtime baseline drift')
cq=root/'scripts/manual-cq-recovery-20261020';cm=json.loads((cq/'manifest.json').read_text())
for f,d in cm['files'].items():
 if sha(cq/f)!=d:raise SystemExit('PACKAGE_BLOCKED: CQ drift '+f)
(H/'frontend.patch').write_text(''.join(difflib.unified_diff(b.read_text().splitlines(True),c.read_text().splitlines(True),fromfile='a/src/hooks/useAuth.tsx',tofile='b/src/hooks/useAuth.tsx')))
m={'canonical_ref':'swzpzcwiasxmjutrmvkm','published_baseline_receipt':'afa2417fb2ac305636b9bc82786d62ae9af0a632','runtime_changed':False,'applied':False,'hosted':False,'lease_changed':False,'baseline_sha256':sha(b),'candidate_sha256':sha(c),'cq_manifest_sha256':sha(cq/'manifest.json'),'files':{}}
for p in sorted(H.rglob('*')):
 if p.is_file() and p.name!='manifest.json' and '__pycache__' not in p.parts:m['files'][str(p.relative_to(H))]=sha(p)
(H/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
print('Candidate only;',len(m['files']),'hashes; runtime/CQ unchanged')