-- INATIVO. Canonical target swzpzcwiasxmjutrmvkm. No automatic execution.
BEGIN TRANSACTION READ ONLY;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $pre$ BEGIN
IF current_database() IS NULL THEN RAISE EXCEPTION 'C2DJ_DATABASE_UNKNOWN'; END IF;
IF current_setting('request.jwt.claims',true) IS NOT NULL AND current_setting('request.jwt.claims',true) <> ''
 THEN RAISE EXCEPTION 'C2DJ_MIGRATION_CONTEXT_REQUIRED'; END IF;
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
DO $structure$ BEGIN IF (SELECT md5(jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='partner_order_idempotency'))::text) FROM pg_class c WHERE c.oid='public.partner_order_idempotency'::regclass) IS DISTINCT FROM '3c5afe617195db177fe831c877473258' THEN RAISE EXCEPTION 'C2DJ_POI_STRUCTURE_DRIFT'; END IF; END $structure$;
DO $updated$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.update_updated_at_column()'::regprocedure) IS DISTINCT FROM 'a27bb088c067b7b77a9f0707b0048e40' THEN RAISE EXCEPTION 'C2DJ_UPDATED_DRIFT'; END IF; END $updated$;
-- LEGACY_CAPTURE_BEGIN: exact audited rows, not absence/drain inference.
DO $legacy$ BEGIN
IF (SELECT count(*) FROM public.partner_order_idempotency) <> 5
 OR EXISTS(SELECT 1 FROM public.partner_order_idempotency i JOIN public.partner_orders o ON o.id=i.order_id
 WHERE i.created_by IS DISTINCT FROM 'beb25695-3957-48b0-aff8-6316520ea189'::uuid
 OR i.partner_id IS DISTINCT FROM '7e52de9a-4bed-4d1e-8200-3255a805465c'::uuid
 OR o.created_by IS DISTINCT FROM i.created_by OR o.partner_id IS DISTINCT FROM i.partner_id
 OR o.c2_external_origin_snapshot->>'organization_id' IS DISTINCT FROM '007bb519-cba0-4704-be2c-cb93ad010048'
 OR (i.idempotency_key,i.order_id) NOT IN (
 ('d200eb8a-2451-41f5-9161-11b82d20fac8','d4539dd9-b090-4433-9ed3-6f8f5d3e767b'::uuid),
 ('0dc12922-a037-46db-a5de-ecb91148ba7a','405ff73f-1667-43a3-a41c-56d9500dfd8b'::uuid),
 ('5cea2654-be52-4e2e-b52a-c3e1075ea381','6c23167c-e453-4724-82eb-8eb17e840539'::uuid),
 ('c76f3a8d-e1e0-4e89-b2a4-903803224b87','467959ea-d1ab-447b-81f6-7fbd3b774c22'::uuid),
 ('20d3da20-8e67-4890-bdf2-8d2bbba4f4ed','255057ba-8025-4fa5-a32f-ca3402d6c591'::uuid)))
 OR (SELECT count(*) FROM public.partner_order_idempotency i JOIN public.partner_orders o ON o.id=i.order_id)<>5
 OR (SELECT idempotency_key FROM public.partner_order_idempotency ORDER BY created_at DESC,id DESC LIMIT 1)
 IS DISTINCT FROM '20d3da20-8e67-4890-bdf2-8d2bbba4f4ed'
 THEN RAISE EXCEPTION 'C2DJ_LEGACY_CAPTURE_DRIFT'; END IF;
END $legacy$;
-- LEGACY_CAPTURE_END
DO $fresh$ BEGIN IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)')) IS DISTINCT FROM '34d63edfd2ca1354e5e466dc066887b5' THEN RAISE EXCEPTION 'C2DJ_FUNCTIONDEF_DRIFT:public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'; END IF; END $fresh$;
DO $fresh$ BEGIN IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_close_partner_order_attempt_core(uuid,text)')) IS DISTINCT FROM '500ba0b03d527bfc7ab4e88414d45cdf' THEN RAISE EXCEPTION 'C2DJ_FUNCTIONDEF_DRIFT:platform_private.c2_close_partner_order_attempt_core(uuid,text)'; END IF; END $fresh$;
DO $fresh$ BEGIN IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('public.close_partner_order_attempt_v1(uuid,text)')) IS DISTINCT FROM 'bf440eaea3677ba845781958fe7f39c5' THEN RAISE EXCEPTION 'C2DJ_FUNCTIONDEF_DRIFT:public.close_partner_order_attempt_v1(uuid,text)'; END IF; END $fresh$;
DO $fresh$ BEGIN IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_partner_order_attempt_authz(uuid,uuid)')) IS DISTINCT FROM 'e15d9fccd42c67caf51b15122a61270d' THEN RAISE EXCEPTION 'C2DJ_FUNCTIONDEF_DRIFT:platform_private.c2_partner_order_attempt_authz(uuid,uuid)'; END IF; END $fresh$;
DO $fresh$ BEGIN IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_order_actor_scope(uuid,uuid)')) IS DISTINCT FROM '54c4327d63f48e39f598129ff9dd8f09' THEN RAISE EXCEPTION 'C2DJ_FUNCTIONDEF_DRIFT:platform_private.c2_order_actor_scope(uuid,uuid)'; END IF; END $fresh$;
DO $fresh$ BEGIN IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_closure_guard()')) IS DISTINCT FROM '123db8ade3b5723e900f00a64f7380ec' THEN RAISE EXCEPTION 'C2DJ_FUNCTIONDEF_DRIFT:platform_private.c2_attempt_closure_guard()'; END IF; END $fresh$;
DO $fresh$ BEGIN IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_closure_immutable()')) IS DISTINCT FROM '8a97d87af0bed061919f25295f4ffb37' THEN RAISE EXCEPTION 'C2DJ_FUNCTIONDEF_DRIFT:platform_private.c2_attempt_closure_immutable()'; END IF; END $fresh$;
DO $closure_rows$ BEGIN
IF (SELECT count(*) FROM platform_private.partner_order_idempotency_closures)<>1
 OR NOT EXISTS(SELECT 1 FROM platform_private.partner_order_idempotency_closures
 WHERE partner_id='7e52de9a-4bed-4d1e-8200-3255a805465c' AND idempotency_key='7eda3f91-52a8-457c-9abd-6980920b9c0c'
 AND closed_by='beb25695-3957-48b0-aff8-6316520ea189' AND closed_org='007bb519-cba0-4704-be2c-cb93ad010048')
 THEN RAISE EXCEPTION 'C2DJ_CLOSURE_ROWS_DRIFT'; END IF;
END $closure_rows$;
ROLLBACK;
