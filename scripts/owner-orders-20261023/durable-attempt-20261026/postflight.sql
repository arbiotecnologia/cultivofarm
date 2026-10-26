-- INATIVO. Canonical target swzpzcwiasxmjutrmvkm. No automatic execution.
BEGIN TRANSACTION READ ONLY;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_scope_lock(uuid,uuid)')) IS DISTINCT FROM '8e6d6191d2821ec6e8d0ba07f4d8190c' THEN RAISE EXCEPTION 'C2DJ_POST:platform_private.c2_attempt_scope_lock(uuid,uuid)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_dispatch_guard(uuid,uuid,text)')) IS DISTINCT FROM '9e217430e43e594e51645ec6184abfa0' THEN RAISE EXCEPTION 'C2DJ_POST:platform_private.c2_attempt_dispatch_guard(uuid,uuid,text)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_journal_write_guard()')) IS DISTINCT FROM '6cce9e233aa526dc4e5d49fa3e32c563' THEN RAISE EXCEPTION 'C2DJ_POST:platform_private.c2_attempt_journal_write_guard()'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid)')) IS DISTINCT FROM 'fc87c86c2258daed3f1882fa3dad702a' THEN RAISE EXCEPTION 'C2DJ_POST:platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.recover_partner_order_attempt_v1(uuid,text,bigint,boolean,uuid)')) IS DISTINCT FROM 'f5aa40591cfc0f436f579f20ce2f563a' THEN RAISE EXCEPTION 'C2DJ_POST:public.recover_partner_order_attempt_v1(uuid,text,bigint,boolean,uuid)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)')) IS DISTINCT FROM 'dfbd71f8f352b275ddab9619aff33c78' THEN RAISE EXCEPTION 'C2DJ_POST:public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_close_partner_order_attempt_core(uuid,text)')) IS DISTINCT FROM 'c19107af28f3ecbbd537cec3c54d0e5f' THEN RAISE EXCEPTION 'C2DJ_POST:platform_private.c2_close_partner_order_attempt_core(uuid,text)'; END IF; END $post$;
DO $metadata$ BEGIN
IF (SELECT relacl::text FROM pg_class WHERE oid='platform_private.partner_order_attempt_journal'::regclass)
 IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=r/postgres}'
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='platform_private.partner_order_attempt_journal'::regclass)
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='platform_private' AND tablename='partner_order_attempt_journal')
 THEN RAISE EXCEPTION 'C2DJ_JOURNAL_ACL_RLS'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='c2_attempt_journal_guard' AND NOT tgisinternal
 AND tgrelid='public.partner_order_idempotency'::regclass AND tgenabled='O'
 AND tgfoid='platform_private.c2_attempt_journal_write_guard()'::regprocedure AND tgtype=23)
 THEN RAISE EXCEPTION 'C2DJ_TRIGGER'; END IF;
END $metadata$;
DO $acl$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_scope_lock(uuid,uuid)') AND pg_get_userbyid(proowner)='postgres' AND prosecdef=true AND proacl::text='{postgres=X/postgres}' AND proconfig=ARRAY['search_path=""','lock_timeout=5s']::text[]) THEN RAISE EXCEPTION 'C2DJ_METADATA:platform_private.c2_attempt_scope_lock(uuid,uuid)'; END IF; END $acl$;
DO $acl$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_dispatch_guard(uuid,uuid,text)') AND pg_get_userbyid(proowner)='postgres' AND prosecdef=true AND proacl::text='{postgres=X/postgres}' AND proconfig=ARRAY['search_path=""','lock_timeout=5s']::text[]) THEN RAISE EXCEPTION 'C2DJ_METADATA:platform_private.c2_attempt_dispatch_guard(uuid,uuid,text)'; END IF; END $acl$;
DO $acl$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_journal_write_guard()') AND pg_get_userbyid(proowner)='postgres' AND prosecdef=true AND proacl::text='{postgres=X/postgres}' AND proconfig=ARRAY['search_path=""','lock_timeout=5s']::text[]) THEN RAISE EXCEPTION 'C2DJ_METADATA:platform_private.c2_attempt_journal_write_guard()'; END IF; END $acl$;
DO $acl$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid)') AND pg_get_userbyid(proowner)='postgres' AND prosecdef=true AND proacl::text='{postgres=X/postgres,authenticated=X/postgres}' AND proconfig=ARRAY['search_path=""','lock_timeout=5s']::text[]) THEN RAISE EXCEPTION 'C2DJ_METADATA:platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid)'; END IF; END $acl$;
DO $acl$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.recover_partner_order_attempt_v1(uuid,text,bigint,boolean,uuid)') AND pg_get_userbyid(proowner)='postgres' AND prosecdef=false AND proacl::text='{postgres=X/postgres,authenticated=X/postgres}' AND proconfig=ARRAY['search_path=""']::text[]) THEN RAISE EXCEPTION 'C2DJ_METADATA:public.recover_partner_order_attempt_v1(uuid,text,bigint,boolean,uuid)'; END IF; END $acl$;
DO $closure$ BEGIN
IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='platform_private.c2_attempt_closure_guard()'::regprocedure)
 IS DISTINCT FROM '140ceb10660fb226fda78fb94277d17e' THEN RAISE EXCEPTION 'C2DJ_CLOSURE_DRIFT'; END IF;
END $closure$;
ROLLBACK;
