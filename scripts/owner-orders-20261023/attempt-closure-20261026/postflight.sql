-- INATIVO / REVISAO INDEPENDENTE. Nao aplicar sem autorizacao. Gerado por assemble.py.
BEGIN TRANSACTION READ ONLY;

DO $c2ac_postflight$
DECLARE r record;
BEGIN
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)');
  IF r.m IS DISTINCT FROM '006d20ee80e4ab94a7d266d7ede57c67' OR r.o<>'postgres' OR NOT r.s OR r.c IS DISTINCT FROM ARRAY['search_path=public']::text[] OR r.a IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' THEN
    RAISE EXCEPTION 'C2AC_POST:create'; END IF;
  SELECT md5(prosrc) m, pg_get_userbyid(proowner) o, prosecdef s, proconfig c, proacl::text a INTO r FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_close_partner_order_attempt_core(uuid,text)');
  IF r.m IS DISTINCT FROM 'ba556b900ec5cd8060c25d79028a5727' OR r.o<>'postgres' OR NOT r.s
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
END $c2ac_postflight$;
ROLLBACK;
