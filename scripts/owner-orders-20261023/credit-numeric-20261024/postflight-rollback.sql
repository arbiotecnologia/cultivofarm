-- REVIEW ONLY; prove canonical ref swzpzcwiasxmjutrmvkm externally before execution.
-- Arithmetic-only; no orders, ACL, data, fiscal validation or writer changes.
BEGIN TRANSACTION READ ONLY;
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.fn_b2b_credit_exposure(uuid,numeric,uuid)')
 AND md5(pg_get_functiondef(oid))='3bcc92e68f80b86bc01db7b5e94ee4c6' AND pg_get_userbyid(proowner)='postgres'
 AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}')
 THEN RAISE EXCEPTION 'C2_CREDIT_NUMERIC_DRIFT' USING ERRCODE='42501'; END IF;
END $guard$;
ROLLBACK;
