#!/usr/bin/env python3
"""Offline deterministic Edge assembly, explicit ref only, all text UTF-8 LF. Never deploys."""
import argparse,hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--ref',required=True,choices=['vrlcdwmlytukrjezrrnf','swzpzcwiasxmjutrmvkm']);parser.add_argument('--service',required=True,choices=['documentary','documents']);parser.add_argument('--out',required=True)
a=parser.parse_args()
source=H/'service' if a.service=='documentary' else H/'documents/service'
out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
files=['index.ts','documentarySuggestions.ts','inference.ts'] if a.service=='documentary' else ['index.ts','integrity.ts']
if a.service=='documentary':
 (out/'generated').mkdir(exist_ok=True)
 for p in sorted((source/'generated').glob('*.ts')):(out/'generated'/p.name).write_text(p.read_text(encoding='utf-8').replace('"@lovable.dev/ai-gateway"','"npm:@lovable.dev/ai-gateway@0.1.11"'),encoding='utf-8',newline='\n')
for name in files:(out/name).write_text((source/name).read_text(encoding='utf-8'),encoding='utf-8',newline='\n')
(out/'binding.ts').write_text(f'// Generated explicit binding; no environment mutation or fallback.\nexport const PROJECT_REF = "{a.ref}" as const;\n',encoding='utf-8',newline='\n')
manifest={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*.ts'))}
(out/'manifest.json').write_text(json.dumps({'ref':a.ref,'service':a.service,'files':manifest},indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'ref':a.ref,'service':a.service,'output':str(out),'deployed':False}))
