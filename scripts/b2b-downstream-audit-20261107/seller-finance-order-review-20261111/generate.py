"""Builds final direct SQL for the seller-Financeiro order review reader. No hosted access."""
import hashlib, json
from pathlib import Path
H=Path(__file__).resolve().parent
SIG='public.get_b2b_seller_finance_order_review_v1(uuid)'
CANDIDATE_MD5=''  # measured in disposable mirror only
FILES=('01-pre.sql.readonly','02-install.sql.review','03-post.sql.readonly','04-rollback.sql.review')
def body(): return (H/'candidate.sql').read_text()
def pin(expect_absent=False):
    if expect_absent:
        return f"DO $$BEGIN IF to_regprocedure('{SIG}') IS NOT NULL THEN RAISE EXCEPTION 'REVIEW_READER_ALREADY_PRESENT'; END IF; END$$;\n"
    return f"""DO $$DECLARE p oid:=to_regprocedure('{SIG}'); BEGIN
 IF p IS NULL OR md5(pg_get_functiondef(p))<>'{CANDIDATE_MD5}' THEN RAISE EXCEPTION 'REVIEW_READER_CATALOG_DRIFT'; END IF;
 IF has_function_privilege('anon',p,'EXECUTE') OR has_function_privilege('public',p,'EXECUTE') OR NOT has_function_privilege('authenticated',p,'EXECUTE')
   OR pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid=p))<>'postgres' THEN RAISE EXCEPTION 'REVIEW_READER_ACL_DRIFT'; END IF; END$$;\n"""
def render():
    assert len(CANDIDATE_MD5)==32,'MEASURE_FIRST'
    deps="DO $$BEGIN IF to_regprocedure('public.reject_b2b_payment_terms_secure(uuid,text)') IS NULL OR md5(pg_get_functiondef('public.reject_b2b_payment_terms_secure(uuid,text)'::regprocedure))<>'781427080999234bfe74b04e2b8e7ffd' THEN RAISE EXCEPTION 'REJECT_CANDIDATE_NOT_INSTALLED'; END IF; END$$;\n"
    return dict(zip(FILES,(
      'BEGIN READ ONLY;\n'+deps+pin(True)+"SELECT 'PRE_PASS';\nROLLBACK;\n",
      'BEGIN;\n'+deps+pin(True)+body()+'\n'+f"REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION {SIG} TO authenticated;\n"+pin()+'COMMIT;\n',
      'BEGIN READ ONLY;\n'+deps+pin()+"SELECT 'POST_PASS';\nROLLBACK;\n",
      'BEGIN;\n'+pin()+f"DROP FUNCTION {SIG};\n"+pin(True)+"SELECT 'ROLLBACK_PASS';\nCOMMIT;\n")))
def verify_on_disk():
    out={}
    for n,t in render().items():
        p=H/n
        if not p.exists() or p.read_text()!=t: p.write_text(t)
        out[n]=hashlib.sha256(p.read_bytes()).hexdigest()
    return out
if __name__=='__main__':
    s=verify_on_disk()
    (H/'SHA256SUMS').write_text(''.join(f'{v}  {k}\n' for k,v in s.items())+f"{hashlib.sha256((H/'candidate.sql').read_bytes()).hexdigest()}  candidate.sql\n")
    print(json.dumps(dict(candidate_md5=CANDIDATE_MD5,files=s),indent=2))
