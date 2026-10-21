"""Offline preparation ONLY. Never connects/applies SQL. Review exact transport ref and HTTP operations first."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--ref',required=True);p.add_argument('--snapshot',required=True);p.add_argument('--http-contract',required=True);p.add_argument('--output',required=True);a=p.parse_args()
if a.ref!='swzpzcwiasxmjutrmvkm':raise SystemExit('STOP: canonical ref mismatch')
s=json.loads(Path(a.snapshot).read_text()); h=json.loads(Path(a.http_contract).read_text())
required=['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info','object.upload','object.upload_update','object.sign','object.sign_many','object.sign_upload_url']
if h.get('ref')!=a.ref or not h.get('storage_version') or h.get('reviewed') is not True or not all(x in h.get('operations',[]) for x in required):raise SystemExit('STOP: reviewed HTTP contract missing')
if s.get('bucket',[None,True])[1] is not False or s.get('rls',[False])[0] is not True or len(s.get('functions',[]))!=5 or not s.get('policies') or not s.get('objects_acl'):raise SystemExit('STOP: incomplete SQL snapshot')
t=Path(__file__).with_name('candidate.sql.review').read_text()
Path(a.output).write_text(t.replace('NULL /* REVIEWED_CONTRACT */',"'"+json.dumps(s,separators=(',',':')).replace("'","''")+"'::jsonb"))
print('Prepared offline for independent review; not executed')
