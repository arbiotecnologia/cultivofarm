"""Minimal authorized contract for rpc_receivable_money_projection_v1 (review 890bfa4 item 5).

Consumer: deferred receivableOrigin.ts (client.rpc('rpc_receivable_money_projection_v1')),
not mounted in the live src today. origin.sql.review revokes authenticated, so the
reader can never succeed for a real user. This candidate keeps the reviewed body and
adds one private authorization helper (zero grants) evaluated before any row:
active profile+org (h15_actor_organization), canonical financial staff role
(is_financial_staff: administrador/gestor/financeiro), and the contas_receber
entitlement. Only authenticated receives EXECUTE; anon/service_role/PUBLIC stay closed.

The PRE body pin is LOCAL_DERIVED from a disposable restoration and must be
confirmed by a read-only capture before any hosted review. Never applied here.
"""
import hashlib
import re
from pathlib import Path

SIG = 'public.rpc_receivable_money_projection_v1(uuid,integer,integer)'
HELPER = 'platform_private.receivable_money_reader_allowed_v1()'
SOURCE = 'scripts/financial-price-generator-20261029/integration/origin.sql.review'
CHECK = (" IF auth.uid() IS NULL OR org IS NULL OR public.is_financial_staff(auth.uid()) IS NOT TRUE "
         "THEN RAISE EXCEPTION 'MONEY_ORIGIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;\n")
ADDED = (" IF platform_private.receivable_money_reader_allowed_v1() IS NOT TRUE "
         "THEN RAISE EXCEPTION 'MONEY_ORIGIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;\n")


def original_definition(root):
    text = (Path(root) / SOURCE).read_text()
    m = re.search(r"CREATE OR REPLACE FUNCTION public\.rpc_receivable_money_projection_v1\(.*?\nEND \$\$;", text, re.S)
    assert m, 'projection definition not found in source'
    body = m.group(0)
    assert body.count(CHECK) == 1
    return body


def build(root, pre_md5):
    original = original_definition(root)
    candidate = original.replace(CHECK, CHECK + ADDED, 1)
    helper = f"""CREATE OR REPLACE FUNCTION {HELPER.replace('()', '()')} RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL
   AND public.h15_actor_organization() IS NOT NULL
   AND public.is_financial_staff(auth.uid()) IS TRUE
   AND public._saas_user_has_feature(auth.uid(),'contas_receber') IS TRUE;
$$;
REVOKE ALL ON FUNCTION {HELPER} FROM PUBLIC,anon,authenticated,service_role;
"""
    guard = f"""DO $$ BEGIN
 IF md5(pg_get_functiondef('{SIG}'::regprocedure))<>'{pre_md5}'
   OR has_function_privilege('authenticated','{SIG}','EXECUTE')
   OR has_function_privilege('anon','{SIG}','EXECUTE')
   OR has_function_privilege('service_role','{SIG}','EXECUTE') THEN
  RAISE EXCEPTION 'PROJECTION_READER_PRE_DRIFT'; END IF; END $$;
"""
    pre = "BEGIN READ ONLY;\n" + guard + "SELECT 'PRE_OK';\nROLLBACK;\n"
    install = "BEGIN;\n" + guard + helper + candidate + f"""
REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION {SIG} TO authenticated;
COMMIT;
"""
    post = f"""BEGIN READ ONLY;
DO $$ BEGIN
 IF NOT has_function_privilege('authenticated','{SIG}','EXECUTE')
   OR has_function_privilege('anon','{SIG}','EXECUTE')
   OR has_function_privilege('service_role','{SIG}','EXECUTE')
   OR has_function_privilege('authenticated','{HELPER}','EXECUTE')
   OR has_function_privilege('anon','{HELPER}','EXECUTE')
   OR has_function_privilege('service_role','{HELPER}','EXECUTE')
   OR position('receivable_money_reader_allowed_v1' in pg_get_functiondef('{SIG}'::regprocedure))=0 THEN
  RAISE EXCEPTION 'PROJECTION_READER_POST_FAILED'; END IF; END $$;
SELECT 'POST_OK';
ROLLBACK;
"""
    rollback = "BEGIN;\n" + original + f"""
REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION {HELPER} RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT false $$;
REVOKE ALL ON FUNCTION {HELPER} FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
"""
    files = {'13-pre-projection-reader.sql.readonly': pre, '14-install-projection-reader.sql.review': install,
             '15-post-projection-reader.sql.readonly': post, '16-rollback-projection-reader-deny.sql.review': rollback}
    return files, {k: hashlib.sha256(v.encode()).hexdigest() for k, v in files.items()}
