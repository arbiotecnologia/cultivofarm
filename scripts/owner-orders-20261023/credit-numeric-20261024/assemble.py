"""Local-only arithmetic artifact assembly from immutable captured pg_get_functiondef."""
from pathlib import Path
import json,hashlib,re
H=Path(__file__).resolve().parent
f=json.loads((H/'baseline/function.json').read_text())
source=(H/'baseline/function.sql').read_text()
assert source==f['sql'] and hashlib.md5(source.encode()).hexdigest()==f['md5']
assert source.count('v_pct numeric(6,2)')==1
patched=source.replace('v_pct numeric(6,2)','v_pct numeric')
assert patched.replace('v_pct numeric;','v_pct numeric(6,2);')==source
sig='public.fn_b2b_credit_exposure(uuid,numeric,uuid)'
old=f['md5'];new=hashlib.md5(patched.encode()).hexdigest()
def guard(h):
    return f"""DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('{sig}')
 AND md5(pg_get_functiondef(oid))='{h}' AND pg_get_userbyid(proowner)='postgres'
 AND proacl::text IS NOT DISTINCT FROM '{f['acl']}')
 THEN RAISE EXCEPTION 'C2_CREDIT_NUMERIC_DRIFT' USING ERRCODE='42501'; END IF;
END $guard$;
"""
header='-- REVIEW ONLY; prove canonical ref swzpzcwiasxmjutrmvkm externally before execution.\n-- Arithmetic-only; no orders, ACL, data, fiscal validation or writer changes.\n'
for name,h in [('preflight.sql',old),('postflight.sql',new),('postflight-rollback.sql',old)]:
    (H/name).write_text(header+'BEGIN TRANSACTION READ ONLY;\n'+guard(h)+'ROLLBACK;\n')
for name,before,body,after in [('candidate.sql.review',old,patched,new),('rollback.sql.review',new,source,old)]:
    (H/name).write_text(header+'BEGIN;\nSET LOCAL lock_timeout=\'5s\'; SET LOCAL statement_timeout=\'60s\';\n'+guard(before)+body.rstrip()+';\n'+guard(after)+'COMMIT;\n')
(H/'expected.json').write_text(json.dumps({'canonical_ref':'swzpzcwiasxmjutrmvkm','signature':sig,'owner':f['owner'],'acl':f['acl'],'baseline_md5':old,'patched_md5':new,'baseline_sha256':hashlib.sha256(source.encode()).hexdigest(),'patched_sha256':hashlib.sha256(patched.encode()).hexdigest()},indent=2)+'\n')
print('credit-only old/new normalized MD5',old,new)