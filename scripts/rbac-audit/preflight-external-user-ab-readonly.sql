-- CANDIDATE assertive read-only preflight. Run ONLY on independently verified
-- canonical swzpzcwiasxmjutrmvkm. No GUC used for authorization or destination.
-- A mismatch raises 22012 (division by zero); no silent IF NOT EXISTS.
SELECT 1 / CASE WHEN to_regclass('platform_private.b2b_provisioning_receipts') IS NULL THEN 1 ELSE 0 END AS receipts_must_be_absent;
SELECT 1 / CASE WHEN count(*)=0 THEN 1 ELSE 0 END AS new_functions_absent FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='cf_user_guards_v1' AND p.proname IN ('acquire_invitation_gate','touch_invitation_profiles')) OR (n.nspname IN ('public','platform_private') AND p.proname IN ('b2b_claim_provisioning','b2b_finish_provisioning','b2b_prepare_provisioning_compensation','b2b_complete_provisioning_compensation','external_provisioning_scope'));
SELECT 1 / CASE WHEN count(*)=0 THEN 1 ELSE 0 END AS invitation_trigger_baseline_empty FROM pg_trigger WHERE tgrelid='public.platform_org_admin_invites'::regclass AND NOT tgisinternal;
WITH expected(signature,hash,definer,authexec) AS (VALUES
 ('public.admin_provision_user_profile_v1(uuid,text,text,public.app_role[],uuid[],uuid,uuid,text,text,text,text,text,text)','9a2e228a68f369f32fe323c6c2a7f1b8',false,false),
 ('public.b2b_provisioning_preflight(uuid,text,text)','6c273b67760ba1a2247ed9fd8755dfcf',false,true),
 ('platform_private.b2b_provisioning_preflight(uuid,text,text)','6e2c2eb62d5ecb13188d035f2a3c7f2b',true,true),
 ('public.handle_new_user()','6f3c5072b776329ac5ff9f8bbf6fd7b2',true,false))
SELECT signature,1 / CASE WHEN p.oid IS NOT NULL AND md5(pg_get_functiondef(p.oid))=e.hash AND p.prosecdef=e.definer AND p.proowner='postgres'::regrole AND has_function_privilege('authenticated',p.oid,'EXECUTE')=e.authexec AND NOT has_function_privilege('anon',p.oid,'EXECUTE') THEN 1 ELSE 0 END baseline_exact FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
SELECT 1 / CASE WHEN md5(string_agg(t.tgrelid::regclass::text||':'||t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\n' ORDER BY t.tgrelid::regclass::text,t.tgname))='baf23a188b315c042bc6d3dedd7663a6' THEN 1 ELSE 0 END user_chain_exact FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass);
