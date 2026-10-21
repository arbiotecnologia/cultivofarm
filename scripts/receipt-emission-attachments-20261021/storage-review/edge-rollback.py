"""Preflight default. Offline containment only, no deployment/network. No bearer restoration."""
from pathlib import Path
import argparse,hashlib,json
H=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('root',nargs='?',default=str(H.parents[2]));p.add_argument('--apply',action='store_true');a=p.parse_args();r=Path(a.root)
m=json.loads((H/'activation.json').read_text());d=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for f,h in m['preserved'].items():
 if d(r/f)!=h:raise SystemExit('STOP: protected dependency drift '+f)
t=r/'supabase/functions/generate-financial-receipt/index.ts';s=H/'edge-disabled.ts.review'
if d(t)!=m['edge_sha256'] or d(s)!=m['edge_disabled_sha256']:raise SystemExit('STOP: Edge drift')
if a.apply:t.write_bytes(s.read_bytes());print('Edge disabled locally; no deployment, no signatures')
else:print('Preflight PASS; no writes, safe rollback returns 503')
