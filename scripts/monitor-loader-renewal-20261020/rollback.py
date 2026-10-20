"""Explicit manual rollback only; refuses unreviewed drift. Never executed by preparation."""
from pathlib import Path
import hashlib,json
H=Path(__file__).resolve().parent
root=H.parents[1]
manifest=json.loads((H/'manifest.json').read_text())
target=root/'src/hooks/useAuth.tsx'
baseline=H/'rollback/src/hooks/useAuth.tsx.review'
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if digest(baseline)!=manifest['baseline_sha256']:
 raise SystemExit('ROLLBACK_BLOCKED: baseline drift')
if digest(target)==manifest['baseline_sha256']:
 print('Runtime already byte-exact baseline; no write')
elif digest(target)==manifest['candidate_sha256']:
 target.write_bytes(baseline.read_bytes())
 print('Byte-exact baseline restored; deployment remains manual')
else:
 raise SystemExit('ROLLBACK_BLOCKED: unknown runtime drift')