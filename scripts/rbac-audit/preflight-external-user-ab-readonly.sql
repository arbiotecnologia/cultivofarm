-- ONLY SELECT. Expected baseline; never executes provisioning.
SELECT project_ref FROM public.fiscal_environment_marker;
SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) hash,p.proacl,p.proowner::regrole owner FROM pg_proc p WHERE p.proname IN ('admin_provision_user_profile_v1','b2b_provisioning_preflight','b2b_claim_provisioning','b2b_finish_provisioning','b2b_abort_provisioning');
SELECT to_regclass('platform_private.b2b_provisioning_receipts') receipts;
SELECT md5(string_agg(t.tgrelid::regclass::text||':'||t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid)||':'||md5(pg_get_functiondef(t.tgfoid)),E'\n' ORDER BY t.tgrelid::regclass::text,t.tgname)) triggers_hash FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass);
