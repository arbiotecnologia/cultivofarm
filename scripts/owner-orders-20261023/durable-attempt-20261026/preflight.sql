-- INATIVO. Canonical target swzpzcwiasxmjutrmvkm. No automatic execution.
BEGIN TRANSACTION READ ONLY;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $pre$ BEGIN
IF current_database() IS NULL THEN RAISE EXCEPTION 'C2DJ_DATABASE_UNKNOWN'; END IF;
IF to_regclass('platform_private.partner_order_attempt_journal') IS NOT NULL THEN
 RAISE EXCEPTION 'C2DJ_TARGET_PRESENT'; END IF;
END $pre$;
DO $pin$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)')) IS DISTINCT FROM '71d1f32e00c5c9857eae51999dc40ef0' THEN RAISE EXCEPTION 'C2DJ_DRIFT:public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'; END IF; END $pin$;
DO $pin$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_close_partner_order_attempt_core(uuid,text)')) IS DISTINCT FROM 'dcb22362321fa041353242674db58057' THEN RAISE EXCEPTION 'C2DJ_DRIFT:platform_private.c2_close_partner_order_attempt_core(uuid,text)'; END IF; END $pin$;
DO $pin$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.close_partner_order_attempt_v1(uuid,text)')) IS DISTINCT FROM '3f48dbe69577bb77428a6abe4a30671f' THEN RAISE EXCEPTION 'C2DJ_DRIFT:public.close_partner_order_attempt_v1(uuid,text)'; END IF; END $pin$;
DO $pin$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_closure_immutable()')) IS DISTINCT FROM '3375615fd81e3671cc581297c75e9600' THEN RAISE EXCEPTION 'C2DJ_DRIFT:platform_private.c2_attempt_closure_immutable()'; END IF; END $pin$;
DO $pin$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_partner_order_attempt_authz(uuid,uuid)')) IS DISTINCT FROM '0c5ded5e797ded21cc08e28c2958175d' THEN RAISE EXCEPTION 'C2DJ_DRIFT:platform_private.c2_partner_order_attempt_authz(uuid,uuid)'; END IF; END $pin$;
DO $pin$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_closure_guard()')) IS DISTINCT FROM '140ceb10660fb226fda78fb94277d17e' THEN RAISE EXCEPTION 'C2DJ_DRIFT:platform_private.c2_attempt_closure_guard()'; END IF; END $pin$;
DO $c2ac_postflight$
DECLARE r record;
BEGIN
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)');
  IF r.m IS DISTINCT FROM '71d1f32e00c5c9857eae51999dc40ef0' OR r.o<>'postgres' OR NOT r.s OR r.c IS DISTINCT FROM ARRAY['search_path=public']::text[] OR r.a IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' THEN
    RAISE EXCEPTION 'C2AC_POST:create'; END IF;
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_close_partner_order_attempt_core(uuid,text)');
  IF r.m IS DISTINCT FROM 'dcb22362321fa041353242674db58057' OR r.o<>'postgres' OR NOT r.s
     OR r.c IS DISTINCT FROM ARRAY['search_path=""','lock_timeout=5s']::text[]
     OR r.a IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}' THEN RAISE EXCEPTION 'C2AC_POST:core'; END IF;
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('public.close_partner_order_attempt_v1(uuid,text)');
  IF r.m IS DISTINCT FROM '3f48dbe69577bb77428a6abe4a30671f' OR r.o<>'postgres' OR r.s
     OR r.c IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR r.a IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}' THEN RAISE EXCEPTION 'C2AC_POST:wrapper'; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_closure_immutable()')) IS DISTINCT FROM '3375615fd81e3671cc581297c75e9600' THEN RAISE EXCEPTION 'C2AC_POST:immutable_fn'; END IF;
  IF has_function_privilege('anon','public.close_partner_order_attempt_v1(uuid,text)','EXECUTE') OR has_function_privilege('anon','platform_private.c2_close_partner_order_attempt_core(uuid,text)','EXECUTE')
     OR has_function_privilege('service_role','platform_private.c2_close_partner_order_attempt_core(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'C2AC_POST:exec_privileges'; END IF;
  IF (SELECT relacl::text FROM pg_class WHERE oid='platform_private.partner_order_idempotency_closures'::regclass) IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=r/postgres}'
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='platform_private.partner_order_idempotency_closures'::regclass)
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='platform_private' AND tablename='partner_order_idempotency_closures') THEN
    RAISE EXCEPTION 'C2AC_POST:closures_acl_rls'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='platform_private.partner_order_idempotency_closures'::regclass AND NOT tgisinternal
        AND tgfoid=to_regprocedure('platform_private.c2_attempt_closure_immutable()')) <> 2 THEN RAISE EXCEPTION 'C2AC_POST:immutability_triggers'; END IF;
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_partner_order_attempt_authz(uuid,uuid)');
  IF r.m IS DISTINCT FROM '0c5ded5e797ded21cc08e28c2958175d' OR r.o<>'postgres' OR r.s OR r.c IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR r.a IS DISTINCT FROM '{postgres=X/postgres}' THEN RAISE EXCEPTION 'C2AC_POST:authz'; END IF;
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_closure_guard()');
  IF r.m IS DISTINCT FROM '140ceb10660fb226fda78fb94277d17e' OR r.o<>'postgres' OR NOT r.s OR r.c IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR r.a IS DISTINCT FROM '{postgres=X/postgres}' THEN RAISE EXCEPTION 'C2AC_POST:guard_fn'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_order_idempotency'::regclass AND tgname='c2_attempt_closure_guard'
        AND tgfoid=to_regprocedure('platform_private.c2_attempt_closure_guard()') AND tgenabled='O' AND NOT tgisinternal
        AND tgtype = (1|2|4|16)::int2) THEN RAISE EXCEPTION 'C2AC_POST:write_barrier_trigger'; END IF;
END $c2ac_postflight$;
DO $scope$ BEGIN
IF (SELECT md5(pg_get_functiondef(oid))||' '||proacl::text FROM pg_proc
 WHERE oid=to_regprocedure('platform_private.c2_order_actor_scope(uuid,uuid)'))
 IS DISTINCT FROM '54c4327d63f48e39f598129ff9dd8f09 {postgres=X/postgres}'
 THEN RAISE EXCEPTION 'C2DJ_SCOPE_DRIFT'; END IF;
END $scope$;
ROLLBACK;
