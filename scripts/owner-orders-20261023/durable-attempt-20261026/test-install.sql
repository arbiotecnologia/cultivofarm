-- DISPOSABLE ONLY: production pins require explicit fixture substitution. Never hosted.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
LOCK TABLE public.partner_order_idempotency IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.partner_orders IN SHARE MODE;
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

CREATE TABLE platform_private.partner_order_attempt_journal (
 actor_id uuid NOT NULL, organization_id uuid NOT NULL, partner_id uuid NOT NULL REFERENCES public.partner_accounts(id),
 generation bigint NOT NULL CHECK(generation>0), idempotency_key text NOT NULL UNIQUE,
 predecessor_key text, imported_order_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,organization_id,partner_id,generation),
 CHECK(length(idempotency_key)=36)
);
REVOKE ALL ON platform_private.partner_order_attempt_journal FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON platform_private.partner_order_attempt_journal TO service_role;
ALTER TABLE platform_private.partner_order_attempt_journal ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER c2dj_no_change BEFORE UPDATE OR DELETE ON platform_private.partner_order_attempt_journal
 FOR EACH ROW EXECUTE FUNCTION platform_private.c2_attempt_closure_immutable();
CREATE TRIGGER c2dj_no_truncate BEFORE TRUNCATE ON platform_private.partner_order_attempt_journal
 FOR EACH STATEMENT EXECUTE FUNCTION platform_private.c2_attempt_closure_immutable();

-- ACCESS EXCLUSIVE on idempotency is held across assertions, import and barriers.
-- Derive historical organization from immutable origin, NEVER current profile.
INSERT INTO platform_private.partner_order_attempt_journal(actor_id,organization_id,partner_id,generation,idempotency_key,imported_order_id)
 SELECT DISTINCT ON (i.created_by,(coalesce(o.c2_external_origin_snapshot,o.internal_origin_snapshot)->>'organization_id')::uuid,i.partner_id)
 i.created_by,(coalesce(o.c2_external_origin_snapshot,o.internal_origin_snapshot)->>'organization_id')::uuid,
 i.partner_id,1,i.idempotency_key,i.order_id
 FROM public.partner_order_idempotency i JOIN public.partner_orders o ON o.id=i.order_id
 ORDER BY i.created_by,(coalesce(o.c2_external_origin_snapshot,o.internal_origin_snapshot)->>'organization_id')::uuid,i.partner_id,i.created_at DESC,i.id DESC;

CREATE FUNCTION platform_private.c2_attempt_scope_lock(p_uid uuid,p_partner uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
DECLARE org uuid; fresh uuid;
BEGIN
 IF p_uid IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'C2DJ_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 PERFORM platform_private.c2_partner_order_attempt_authz(p_uid,p_partner);
 SELECT organization_id INTO org FROM public.profiles WHERE user_id=p_uid AND ativo;
 IF org IS NULL THEN RAISE EXCEPTION 'C2DJ_ORG_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('b2b_attempt_scope:'||p_uid::text||':'||org::text||':'||p_partner::text,0));
 PERFORM platform_private.c2_partner_order_attempt_authz(p_uid,p_partner);
 SELECT organization_id INTO fresh FROM public.profiles WHERE user_id=p_uid AND ativo;
 IF fresh IS DISTINCT FROM org THEN RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
 RETURN org;
END $function$;

CREATE FUNCTION platform_private.c2_attempt_dispatch_guard(p_uid uuid,p_partner uuid,p_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
DECLARE org uuid; j platform_private.partner_order_attempt_journal;
BEGIN
 org := platform_private.c2_attempt_scope_lock(p_uid,p_partner);
 SELECT * INTO j FROM platform_private.partner_order_attempt_journal
 WHERE actor_id=p_uid AND organization_id=org AND partner_id=p_partner ORDER BY generation DESC LIMIT 1;
 IF j.idempotency_key IS DISTINCT FROM p_key OR p_key IS NULL THEN
  RAISE EXCEPTION 'C2DJ_REGISTERED_ATTEMPT_REQUIRED' USING ERRCODE='42501'; END IF;
END $function$;

CREATE FUNCTION platform_private.c2_attempt_journal_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
BEGIN
 -- Also fences old function bodies in flight and arbitrary old/downgraded clients.
 IF TG_OP='UPDATE' AND (NEW.partner_id,NEW.idempotency_key,NEW.created_by)
  IS DISTINCT FROM (OLD.partner_id,OLD.idempotency_key,OLD.created_by) THEN
  RAISE EXCEPTION 'C2DJ_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 -- Fail BEFORE any scope lock; this trigger NEVER acquires scope (old body may hold idem).
 IF NOT EXISTS(SELECT 1 FROM platform_private.partner_order_attempt_journal j
  WHERE j.actor_id=auth.uid() AND j.partner_id=NEW.partner_id AND j.idempotency_key=btrim(NEW.idempotency_key)) THEN
  RAISE EXCEPTION 'C2DJ_REGISTERED_ATTEMPT_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:'||NEW.partner_id::text||':'||btrim(NEW.idempotency_key),0));
 PERFORM platform_private.c2_partner_order_attempt_authz(auth.uid(),NEW.partner_id);
 IF NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'C2DJ_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.partner_order_attempt_journal j JOIN public.profiles p
  ON p.user_id=j.actor_id AND p.organization_id=j.organization_id AND p.ativo
  WHERE j.actor_id=auth.uid() AND j.partner_id=NEW.partner_id AND j.idempotency_key=btrim(NEW.idempotency_key)) THEN
  RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $function$;
CREATE TRIGGER c2_attempt_journal_guard BEFORE INSERT OR UPDATE OF partner_id,idempotency_key,created_by
 ON public.partner_order_idempotency FOR EACH ROW EXECUTE FUNCTION platform_private.c2_attempt_journal_write_guard();

CREATE FUNCTION platform_private.c2_recover_order_attempt_core(p_partner uuid,p_expected_key text DEFAULT NULL,
 p_expected_generation bigint DEFAULT NULL,p_advance boolean DEFAULT false,p_ack_order uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
DECLARE uid uuid:=auth.uid(); org uuid; j platform_private.partner_order_attempt_journal;
  result jsonb; nextgen bigint; nextkey text; fresh uuid;
BEGIN
 org := platform_private.c2_attempt_scope_lock(uid,p_partner);
 SELECT * INTO j FROM platform_private.partner_order_attempt_journal
 WHERE actor_id=uid AND organization_id=org AND partner_id=p_partner ORDER BY generation DESC LIMIT 1;
 IF p_advance THEN
  IF j.idempotency_key IS NULL OR p_expected_key IS DISTINCT FROM j.idempotency_key
   OR p_expected_generation IS DISTINCT FROM j.generation THEN
   RAISE EXCEPTION 'C2DJ_CAS_CONFLICT' USING ERRCODE='40001'; END IF;
  -- Explicit click only; existing atomic close is the ONLY way to abandon uncertain K.
  result := platform_private.c2_close_partner_order_attempt_core(p_partner,j.idempotency_key);
  SELECT organization_id INTO fresh FROM public.profiles WHERE user_id=uid AND ativo;
  IF fresh IS DISTINCT FROM org THEN RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  IF result->>'state'='in_progress' THEN RETURN jsonb_build_object('contract','C2_ORDER_JOURNAL_V1','state','unknown'); END IF;
  IF result->>'state'='committed' AND p_ack_order IS DISTINCT FROM (result->>'order_id')::uuid THEN
   RETURN result || jsonb_build_object('contract','C2_ORDER_JOURNAL_V1','key',j.idempotency_key,'generation',j.generation); END IF;
  IF result->>'state' NOT IN ('closed','committed') OR result->>'state' IS NULL THEN
   RAISE EXCEPTION 'C2DJ_INVALID_CLOSURE'; END IF;
 ELSIF j.idempotency_key IS NOT NULL THEN
  -- Recovery is read-only with respect to closure; never auto-close an absent order.
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:'||p_partner::text||':'||j.idempotency_key,0));
  PERFORM platform_private.c2_partner_order_attempt_authz(uid,p_partner);
  SELECT organization_id INTO fresh FROM public.profiles WHERE user_id=uid AND ativo;
  IF fresh IS DISTINCT FROM org THEN RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('state','committed','order_id',i.order_id,'numero',o.numero) INTO result
   FROM public.partner_order_idempotency i JOIN public.partner_orders o ON o.id=i.order_id
   WHERE i.partner_id=p_partner AND i.idempotency_key=j.idempotency_key AND i.created_by=uid;
  IF result IS NULL THEN
   result := jsonb_build_object('state',CASE WHEN EXISTS(SELECT 1 FROM platform_private.partner_order_idempotency_closures
    WHERE partner_id=p_partner AND idempotency_key=j.idempotency_key) THEN 'closed' ELSE 'uncertain' END);
  END IF;
  RETURN result || jsonb_build_object('contract','C2_ORDER_JOURNAL_V1','key',j.idempotency_key,'generation',j.generation);
 ELSIF p_expected_key IS NOT NULL OR p_expected_generation IS NOT NULL THEN
  -- Lost legacy memory cannot be adopted by mere key knowledge.
  RAISE EXCEPTION 'C2DJ_LEGACY_RECONCILIATION_REQUIRED' USING ERRCODE='42501';
 END IF;
 nextgen := coalesce(j.generation,0)+1; nextkey := gen_random_uuid()::text;
 IF j.idempotency_key IS NULL AND EXISTS(SELECT 1 FROM public.partner_order_idempotency i
 WHERE i.created_by=uid AND i.partner_id=p_partner) THEN
  RAISE EXCEPTION 'C2DJ_LEGACY_RECONCILIATION_REQUIRED' USING ERRCODE='42501'; END IF;
 INSERT INTO platform_private.partner_order_attempt_journal(actor_id,organization_id,partner_id,generation,idempotency_key,predecessor_key)
 VALUES(uid,org,p_partner,nextgen,nextkey,j.idempotency_key);
 RETURN jsonb_build_object('contract','C2_ORDER_JOURNAL_V1','state','reserved','key',nextkey,'generation',nextgen);
END $function$;

CREATE FUNCTION public.recover_partner_order_attempt_v1(p_partner uuid,p_expected_key text DEFAULT NULL,
 p_expected_generation bigint DEFAULT NULL,p_advance boolean DEFAULT false,p_ack_order uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT platform_private.c2_recover_order_attempt_core(p_partner,p_expected_key,p_expected_generation,p_advance,p_ack_order);
$function$;

CREATE FUNCTION platform_private.c2_order_journal_capability(p_partner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $function$
DECLARE org uuid;
BEGIN
 org:=platform_private.c2_attempt_scope_lock(auth.uid(),p_partner);
 RETURN jsonb_build_object('contract','C2_ORDER_JOURNAL_V1','enabled',true,'actor_id',auth.uid(),'organization_id',org,'partner_id',p_partner);
END $function$;
CREATE FUNCTION public.partner_order_journal_capability_v1(p_partner uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $function$
 SELECT platform_private.c2_order_journal_capability(p_partner);
$function$;
REVOKE ALL ON FUNCTION platform_private.c2_order_journal_capability(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.c2_order_journal_capability(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.partner_order_journal_capability_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.partner_order_journal_capability_v1(uuid) TO authenticated;
REVOKE ALL ON FUNCTION platform_private.c2_attempt_scope_lock(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform_private.c2_attempt_dispatch_guard(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform_private.c2_attempt_journal_write_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.recover_partner_order_attempt_v1(uuid,text,bigint,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_partner_order_attempt_v1(uuid,text,bigint,boolean,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.create_partner_order_secure(p_partner_id uuid, p_observacoes text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_requested_delivery_date date DEFAULT NULL::date, p_payment_plan_id uuid DEFAULT NULL::uuid, p_first_due_date date DEFAULT NULL::date, p_installment_count integer DEFAULT NULL::integer, p_expected_cart_hash text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean; v_is_finance boolean; v_is_gestor boolean; v_is_internal boolean;
  v_is_partner boolean; v_is_partner_tech boolean; v_user_partner uuid;
  v_order_id uuid; v_numero text; v_plan record; v_cart jsonb; v_line jsonb;
  v_quote boolean; v_table numeric(14,2); v_disc numeric(14,2); v_net numeric(14,2);
  v_interest numeric(14,2); v_final numeric(14,2); v_hash text;
  v_installments integer; v_first_due date; v_terms_id uuid;
  v_status partner_order_status; v_fin_status text; v_approval_status text;
  v_credit jsonb; v_block_reason text := NULL;
  v_inst numeric(14,2); v_accum numeric(14,2) := 0;
  v_amount_i numeric(14,2); v_principal_i numeric(14,2); v_interest_i numeric(14,2);
  v_due_i date; v_admin record; i integer;
  v_idem text; v_prev_idem record; v_result jsonb;
  v_items_canon text; v_req_fp text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  PERFORM platform_private.c2_order_actor_scope(v_uid, p_partner_id); -- c2_ord_scope
  PERFORM platform_private.c2_owner_order_guard(v_uid, p_partner_id, p_payment_plan_id); -- c2_ord_guard
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;
  IF p_payment_plan_id IS NULL THEN RAISE EXCEPTION 'payment_plan_required'; END IF;

  -- assinatura autoritativa obrigatoria para TODOS os chamadores
  IF NULLIF(btrim(COALESCE(p_expected_cart_hash,'')),'') IS NULL THEN
    RAISE EXCEPTION 'cart_hash_required';
  END IF;
  v_idem := NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');
  IF v_idem IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF length(v_idem) > 120 THEN RAISE EXCEPTION 'invalid_idempotency_key'; END IF;

  -- ---------------------------------------------------------------
  -- request fingerprint canônico: reqfp_v2
  -- Cobre todos os parâmetros materialmente capazes de alterar o
  -- pedido resultante. Itens são normalizados (tipo|id|quantidade
  -- numérica canônica) e ordenados deterministicamente; textos são
  -- normalizados por btrim. cart_hash continua validado à parte.
  -- ---------------------------------------------------------------
  SELECT COALESCE(string_agg(t, ';' ORDER BY t), '')
    INTO v_items_canon
    FROM (
      SELECT lower(COALESCE(btrim(l->>'item_tipo'), '-')) || '|' ||
             lower(COALESCE(btrim(l->>'item_id'), '-'))   || '|' ||
             COALESCE(trim(to_char(COALESCE(NULLIF(btrim(l->>'quantidade'),'')::numeric, 0),
                                   'FM9999999990.000000')), '0') AS t
        FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) AS l
    ) s;

  v_req_fp := encode(sha256(convert_to(
      'reqfp_v2'
      || '|partner='   || p_partner_id::text
      || '|plan='      || COALESCE(p_payment_plan_id::text,'-')
      || '|delivery='  || COALESCE(p_requested_delivery_date::text,'-')
      || '|firstdue='  || COALESCE(p_first_due_date::text,'-')
      || '|inst='      || COALESCE(p_installment_count::text,'-')
      || '|obs='       || COALESCE(btrim(p_observacoes),'-')
      || '|items='     || v_items_canon
    ,'UTF8')),'hex');

  v_is_admin        := has_role(v_uid,'administrador'::app_role);
  v_is_finance      := has_role(v_uid,'financeiro'::app_role);
  v_is_gestor       := has_role(v_uid,'gestor_comercial'::app_role);
  v_is_internal     := v_is_admin OR v_is_finance OR v_is_gestor;
  v_is_partner      := has_role(v_uid,'parceiro_b2b'::app_role);
  v_is_partner_tech := has_role(v_uid,'parceiro_b2b_tecnico'::app_role);
  v_user_partner    := public.get_user_partner_id();

  IF has_role(v_uid,'cliente_produtor'::app_role) AND NOT (v_is_internal OR v_is_partner) THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED';
  END IF;

  IF v_is_partner_tech AND NOT (v_is_internal OR v_is_partner) THEN
    RAISE EXCEPTION 'partner_tech_cannot_create_order';
  END IF;

  IF NOT v_is_internal THEN
    IF NOT v_is_partner OR v_user_partner IS NULL OR v_user_partner <> p_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  PERFORM 1 FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  -- idempotencia (lock deterministico #1: parceiro+chave)
  PERFORM platform_private.c2_attempt_dispatch_guard(v_uid,p_partner_id,v_idem);
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_idem, 0));
  -- c2_attempt_closure_v2: a espera no lock pode atravessar revogações; revalida a
  -- autorização canônica APÓS o lock e antes de revelar replay ou criar (ponto de
  -- linearização = esta instrução; revogação confirmada depois dela não é observada).
  PERFORM platform_private.c2_partner_order_attempt_authz(v_uid, p_partner_id);
  IF NOT EXISTS(SELECT 1 FROM platform_private.partner_order_attempt_journal j JOIN public.profiles p ON p.user_id=j.actor_id AND p.organization_id=j.organization_id AND p.ativo WHERE j.actor_id=v_uid AND j.partner_id=p_partner_id AND j.idempotency_key=v_idem) THEN RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  -- Fechamento durável sob ESTE MESMO lock: recusa envio tardio antes de qualquer efeito.
  -- (Corpos antigos em voo são cobertos pelo trigger c2_attempt_closure_guard.)
  IF EXISTS (SELECT 1 FROM platform_private.partner_order_idempotency_closures c
              WHERE c.partner_id = p_partner_id AND c.idempotency_key = v_idem) THEN
    RAISE EXCEPTION 'idempotency_key_closed';
  END IF;
  SELECT * INTO v_prev_idem FROM public.partner_order_idempotency
   WHERE partner_id = p_partner_id AND idempotency_key = v_idem;
  IF FOUND THEN
    -- linhas históricas sem fingerprint não podem ser reexecutadas em
    -- silêncio apenas com cart_hash: fail-safe, sem criar pedido.
    IF v_prev_idem.request_fingerprint IS NULL THEN
      RAISE EXCEPTION 'idempotency_legacy_unverifiable';
    END IF;
    IF v_prev_idem.cart_hash IS DISTINCT FROM p_expected_cart_hash THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    IF v_prev_idem.request_fingerprint IS DISTINCT FROM v_req_fp THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_prev_idem.result_snapshot;
  END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;
  IF v_plan.monthly_interest_percent < 0 THEN RAISE EXCEPTION 'invalid_interest_rate'; END IF;
  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;

  v_credit := public.fn_b2b_credit_exposure(p_partner_id, 0, NULL);
  IF COALESCE((v_credit->>'block_if_overdue')::boolean,false)
     AND COALESCE((v_credit->>'tem_vencidos')::boolean,false) THEN
    RAISE EXCEPTION 'credit_blocked_overdue';
  END IF;

  IF NOT v_is_internal THEN
    v_installments := GREATEST(COALESCE(v_plan.installment_count,1),1);
  ELSE
    IF p_installment_count IS NOT NULL AND p_installment_count <= 0 THEN
      RAISE EXCEPTION 'invalid_installment_count';
    END IF;
    v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);
  END IF;

  v_cart  := public.fn_resolve_b2b_cart(p_partner_id, p_payment_plan_id, p_items, current_date);
  v_quote := COALESCE((v_cart->>'quote_required')::boolean,false);
  v_table := (v_cart->>'table_amount')::numeric;
  v_disc  := (v_cart->>'discount_amount')::numeric;
  v_net   := (v_cart->>'net_amount')::numeric;
  v_final := CASE WHEN v_quote THEN 0
                  ELSE public.fn_b2b_apply_interest(v_net, v_plan.interest_type,
                         v_plan.monthly_interest_percent, v_plan.months_count) END;

  v_hash := public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final);
  IF p_expected_cart_hash <> v_hash THEN
    RAISE EXCEPTION 'price_changed';
  END IF;

  IF v_quote THEN v_table := 0; v_disc := 0; v_net := 0; END IF;
  v_interest := ROUND(v_final - v_net, 2);

  IF NOT v_quote AND v_plan.minimum_order_amount IS NOT NULL AND v_table < v_plan.minimum_order_amount THEN
    RAISE EXCEPTION 'below_minimum_order_amount';
  END IF;

  IF p_first_due_date IS NOT NULL AND p_first_due_date < current_date THEN
    RAISE EXCEPTION 'invalid_due_date';
  END IF;
  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);

  IF v_plan.requires_financial_approval OR v_plan.requires_guarantee THEN
    v_fin_status := 'pending'; v_approval_status := 'pending';
  ELSE
    v_fin_status := 'not_required'; v_approval_status := 'not_required';
  END IF;

  IF v_first_due > current_date + v_plan.max_days THEN
    IF NOT v_is_internal OR NOT (v_plan.requires_financial_approval OR v_plan.requires_guarantee) THEN
      v_first_due := current_date + v_plan.max_days;
    ELSE
      v_fin_status := 'pending'; v_approval_status := 'pending';
    END IF;
  END IF;

  IF v_quote THEN
    v_status := 'aguardando_cotacao'::partner_order_status;
  ELSE
    -- lock deterministico #2: credito do parceiro
    PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || p_partner_id::text, 0));
    v_credit := public.fn_b2b_credit_exposure(p_partner_id, v_final, NULL);

    IF COALESCE((v_credit->>'block_if_overdue')::boolean,false)
       AND COALESCE((v_credit->>'tem_vencidos')::boolean,false) THEN
      RAISE EXCEPTION 'credit_blocked_overdue';
    END IF;

    IF COALESCE((v_credit->>'credit_limit')::numeric,0) > 0
       AND (v_credit->>'exposicao_projetada')::numeric > (v_credit->>'credit_limit')::numeric THEN
      IF COALESCE(v_credit->>'credit_limit_action','block') = 'approval_required' THEN
        v_status := 'aguardando_aprovacao_credito'::partner_order_status;
        v_block_reason := 'limite_excedido';
      ELSE
        RAISE EXCEPTION 'credit_limit_exceeded';
      END IF;
    ELSE
      v_status := 'em_analise_comercial'::partner_order_status;
    END IF;
  END IF;

  -- Issue only after canonical role/partner/plan/cart/hash/credit checks and idempotent replay.
  IF NOT v_is_internal AND platform_private.c2_owner_order_create_allowed(v_uid,p_partner_id) THEN
    PERFORM platform_private.issue_ticket('c2_external_order_create',p_partner_id);
  END IF;
  INSERT INTO public.partner_orders(
    partner_id, status, subtotal, desconto_total, total, observacoes, created_by,
    requested_delivery_date, ready_for_production, payment_plan_id, payment_condition_status,
    credit_block_reason
  ) VALUES (
    p_partner_id, v_status, 0, 0, 0, NULLIF(p_observacoes,''), v_uid,
    p_requested_delivery_date, false, p_payment_plan_id,
    CASE WHEN v_quote THEN 'quote_required' ELSE 'defined' END,
    v_block_reason
  ) RETURNING id, numero INTO v_order_id, v_numero;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_cart->'lines') LOOP
    INSERT INTO public.partner_order_items(
      order_id, product_id, microrganismo_id, quantidade, preco_unitario,
      desconto_percentual, subtotal, unidade_medida, volume_ml,
      produto_nome_snapshot, produto_codigo_snapshot,
      preco_tabela_snapshot, desconto_percentual_snapshot, preco_unitario_final_snapshot,
      pricing_mode_snapshot, price_source_snapshot, base_price_snapshot,
      condition_price_snapshot, plan_discount_percent_snapshot,
      unit_type_snapshot, volume_ml_snapshot, price_rule_id_snapshot
    ) VALUES (
      v_order_id,
      CASE WHEN v_line->>'item_tipo'='produto' THEN (v_line->>'item_id')::uuid END,
      CASE WHEN v_line->>'item_tipo'='microrganismo' THEN (v_line->>'item_id')::uuid END,
      (v_line->>'quantidade')::numeric,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'final_unit_price')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'plan_discount_percent')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'line_final_amount')::numeric, 0) END,
      v_line->>'unidade_medida',
      NULLIF(v_line->>'volume_ml','')::numeric,
      v_line->>'nome', v_line->>'codigo',
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'base_price')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'plan_discount_percent')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'final_unit_price')::numeric, 0) END,
      v_line->>'pricing_mode', v_line->>'price_source',
      CASE WHEN v_quote THEN NULL ELSE NULLIF(v_line->>'base_price','')::numeric END,
      CASE WHEN v_quote THEN NULL ELSE NULLIF(v_line->>'condition_price','')::numeric END,
      CASE WHEN v_quote THEN NULL ELSE NULLIF(v_line->>'plan_discount_percent','')::numeric END,
      v_line->>'unidade_medida',
      NULLIF(v_line->>'volume_ml','')::numeric,
      NULLIF(v_line->>'rule_id','')::uuid
    );
  END LOOP;

  IF NOT v_quote THEN
    INSERT INTO public.partner_order_payment_terms(
      partner_order_id, payment_plan_id, plan_name_snapshot, plan_code_snapshot,
      discount_percent_snapshot, monthly_interest_percent_snapshot, months_count_snapshot,
      installment_count, first_due_date, interest_type_snapshot,
      table_amount, discount_amount, net_amount_after_discount,
      financial_interest_amount, final_amount, approval_status, created_by,
      pricing_mode_snapshot, credit_decision_snapshot
    ) VALUES (
      v_order_id, v_plan.id, v_plan.name, v_plan.code,
      v_plan.discount_percent, v_plan.monthly_interest_percent, v_plan.months_count,
      v_installments, v_first_due, v_plan.interest_type,
      v_table, v_disc, v_net, v_interest, v_final, v_approval_status, v_uid,
      COALESCE(v_plan.pricing_mode,'discount_from_base'), v_credit
    ) RETURNING id INTO v_terms_id;

    IF v_installments = 1 THEN
      INSERT INTO public.partner_order_payment_schedule(
        partner_order_id, payment_terms_id, installment_number, due_date,
        amount, principal_amount, interest_amount)
      VALUES (v_order_id, v_terms_id, 1, v_first_due, v_final, v_net, v_interest);
    ELSE
      v_inst := ROUND(v_final / v_installments, 2);
      FOR i IN 1..v_installments LOOP
        IF i < v_installments THEN v_amount_i := v_inst; ELSE v_amount_i := ROUND(v_final - v_accum,2); END IF;
        v_accum := v_accum + v_amount_i;
        v_principal_i := ROUND(v_amount_i * (v_net / NULLIF(v_final,0)), 2);
        v_interest_i  := ROUND(v_amount_i - v_principal_i, 2);
        v_due_i := v_first_due + ((i-1)*30);
        INSERT INTO public.partner_order_payment_schedule(
          partner_order_id, payment_terms_id, installment_number, due_date,
          amount, principal_amount, interest_amount)
        VALUES (v_order_id, v_terms_id, i, v_due_i, v_amount_i, v_principal_i, v_interest_i);
      END LOOP;
    END IF;
  END IF;

  UPDATE public.partner_orders SET
    subtotal = v_table, desconto_total = v_disc, total = v_final,
    payment_terms_id = v_terms_id,
    table_amount = v_table, commercial_discount_amount = v_disc,
    net_amount_after_discount = v_net, financial_interest_amount = v_interest,
    final_amount_with_interest = v_final,
    requires_financial_approval = (NOT v_quote AND (v_plan.requires_financial_approval OR v_plan.requires_guarantee)),
    financial_approval_status = CASE WHEN v_quote THEN 'not_required' ELSE v_fin_status END
  WHERE id = v_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_order_id, p_partner_id, v_uid, 'created_via_rpc',
          jsonb_build_object('numero', v_numero, 'total', v_final,
                             'items', jsonb_array_length(p_items),
                             'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
                             'quote_required', v_quote,
                             'cart_hash', v_hash,
                             'hash_validated', true,
                             'idempotency_key', v_idem,
                             'fingerprint_algo', 'reqfp_v2',
                             'credit_reason_code', v_credit->>'reason_code',
                             'requested_delivery_date', p_requested_delivery_date));

  IF NOT v_quote THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
    VALUES (v_order_id, p_partner_id, v_uid, 'payment_terms_defined',
            jsonb_build_object('payment_plan_id', v_plan.id, 'plan_code', v_plan.code,
              'table_amount', v_table, 'discount_amount', v_disc,
              'net_amount_after_discount', v_net, 'financial_interest_amount', v_interest,
              'final_amount', v_final, 'first_due_date', v_first_due,
              'installment_count', v_installments,
              'requires_financial_approval', (v_plan.requires_financial_approval OR v_plan.requires_guarantee)));
  END IF;

  IF COALESCE((v_credit->>'credit_limit')::numeric,0) <= 0 THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
    VALUES (v_order_id, p_partner_id, v_uid, 'credit_limit_not_defined',
            jsonb_build_object('reason_code', v_credit->>'reason_code',
                               'exposicao_projetada', v_credit->>'exposicao_projetada'));
  END IF;

  FOR v_admin IN
    SELECT r AS user_id FROM platform_private.c2_order_internal_recipients(p_partner_id) r -- c2_ord_recipients
  LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_admin.user_id,
            CASE WHEN v_quote THEN 'pedido_b2b_cotacao' ELSE 'pedido_b2b_novo' END,
            CASE WHEN v_quote THEN 'Cotação B2B ' || v_numero ELSE 'Novo pedido B2B ' || v_numero END,
            CASE WHEN v_quote THEN 'Pedido sob consulta aguardando cotação comercial.'
                 ELSE 'Novo pedido B2B aguardando análise comercial. Total: R$ ' || to_char(v_final,'FM999G999G990D00') END,
            '/comercial/pedidos-b2b');
  END LOOP;

  v_result := jsonb_build_object(
    'id', v_order_id, 'numero', v_numero,
    'status', v_status::text,
    'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
    'quote_required', v_quote,
    'cart_hash', v_hash,
    'idempotency_key', v_idem,
    'subtotal', v_table, 'desconto_total', v_disc, 'total', v_final,
    'table_amount', v_table, 'discount_amount', v_disc,
    'net_amount_after_discount', v_net, 'financial_interest_amount', v_interest,
    'final_amount', v_final,
    'payment_terms_id', v_terms_id,
    'credit_reason_code', v_credit->>'reason_code',
    'credit_block_reason', v_block_reason,
    'requires_financial_approval', (NOT v_quote AND (v_plan.requires_financial_approval OR v_plan.requires_guarantee)),
    'financial_approval_status', CASE WHEN v_quote THEN 'not_required' ELSE v_fin_status END);

  INSERT INTO public.partner_order_idempotency(
    partner_id, idempotency_key, cart_hash, order_id, result_snapshot, created_by, request_fingerprint)
  VALUES (p_partner_id, v_idem, p_expected_cart_hash, v_order_id, v_result, v_uid, v_req_fp);

  DELETE FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope='c2_external_order_create' AND target=p_partner_id;
  RETURN v_result;
END
$function$;
CREATE OR REPLACE FUNCTION platform_private.c2_close_partner_order_attempt_core(p_partner_id uuid, p_idempotency_key text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_idem text;
  v_scope_org uuid; v_current_org uuid;
  v_found boolean; v_order_id uuid; v_numero text;
BEGIN
  -- Autorização canônica ANTES do lock e de revelar qualquer estado.
  PERFORM platform_private.c2_partner_order_attempt_authz(v_uid, p_partner_id);
  v_scope_org := platform_private.c2_attempt_scope_lock(v_uid,p_partner_id);
  v_idem := NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');
  IF v_idem IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF length(v_idem) > 120 THEN RAISE EXCEPTION 'invalid_idempotency_key'; END IF;

  -- MESMO lock do create. Espera limitada (lock_timeout da função): estouro => in_progress,
  -- nunca conclusivo e sem nenhuma escrita.
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_idem, 0));
  EXCEPTION WHEN lock_not_available THEN
    RETURN jsonb_build_object('contract','C2_ORDER_ATTEMPT_CLOSURE_V1','state','in_progress');
  END;

  -- Revalida APÓS a espera: revogação/perfil/parceiro inativo confirmados durante a espera
  -- abortam sem revelar committed e sem gravar closed.
  PERFORM platform_private.c2_partner_order_attempt_authz(v_uid, p_partner_id);
  SELECT organization_id INTO v_current_org FROM public.profiles WHERE user_id=v_uid AND ativo;
  IF v_current_org IS DISTINCT FROM v_scope_org THEN RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;

  SELECT true, i.order_id INTO v_found, v_order_id
    FROM public.partner_order_idempotency i
   WHERE i.partner_id = p_partner_id AND i.idempotency_key = v_idem;
  IF v_found THEN
    SELECT o.numero INTO v_numero FROM public.partner_orders o WHERE o.id = v_order_id;
    RETURN jsonb_build_object('contract','C2_ORDER_ATTEMPT_CLOSURE_V1','state','committed',
                              'order_id', v_order_id, 'numero', v_numero);
  END IF;

  INSERT INTO platform_private.partner_order_idempotency_closures(partner_id, idempotency_key, closed_by, closed_org)
  VALUES (p_partner_id, v_idem, v_uid,
          (SELECT p.organization_id FROM public.profiles p WHERE p.user_id = v_uid))
  ON CONFLICT (partner_id, idempotency_key) DO NOTHING;
  RETURN jsonb_build_object('contract','C2_ORDER_ATTEMPT_CLOSURE_V1','state','closed');
END;
$function$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_scope_lock(uuid,uuid)')) IS DISTINCT FROM '8e6d6191d2821ec6e8d0ba07f4d8190c' THEN RAISE EXCEPTION 'C2DJ_POST:platform_private.c2_attempt_scope_lock(uuid,uuid)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_dispatch_guard(uuid,uuid,text)')) IS DISTINCT FROM '9e217430e43e594e51645ec6184abfa0' THEN RAISE EXCEPTION 'C2DJ_POST:platform_private.c2_attempt_dispatch_guard(uuid,uuid,text)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_attempt_journal_write_guard()')) IS DISTINCT FROM '851aacc3e631832493a34bcb6106b53a' THEN RAISE EXCEPTION 'C2DJ_POST:platform_private.c2_attempt_journal_write_guard()'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid)')) IS DISTINCT FROM '1a166cfa7c4b16fcc10e7724b4a6492a' THEN RAISE EXCEPTION 'C2DJ_POST:platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.recover_partner_order_attempt_v1(uuid,text,bigint,boolean,uuid)')) IS DISTINCT FROM 'f5aa40591cfc0f436f579f20ce2f563a' THEN RAISE EXCEPTION 'C2DJ_POST:public.recover_partner_order_attempt_v1(uuid,text,bigint,boolean,uuid)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_order_journal_capability(uuid)')) IS DISTINCT FROM 'f6d227ad7beaee697df0319911f847eb' THEN RAISE EXCEPTION 'C2DJ_POST:platform_private.c2_order_journal_capability(uuid)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.partner_order_journal_capability_v1(uuid)')) IS DISTINCT FROM '6ca96c9dbdc55adfc21bcc9d3aafebdb' THEN RAISE EXCEPTION 'C2DJ_POST:public.partner_order_journal_capability_v1(uuid)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)')) IS DISTINCT FROM '74cfb688546817e6236d5195d069e29e' THEN RAISE EXCEPTION 'C2DJ_POST:public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'; END IF; END $post$;
DO $post$ BEGIN IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_close_partner_order_attempt_core(uuid,text)')) IS DISTINCT FROM '4d7a7a49b27ab78fd33a6cdac75833c5' THEN RAISE EXCEPTION 'C2DJ_POST:platform_private.c2_close_partner_order_attempt_core(uuid,text)'; END IF; END $post$;
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
DO $acl$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('platform_private.c2_order_journal_capability(uuid)') AND pg_get_userbyid(proowner)='postgres' AND prosecdef=true AND proacl::text='{postgres=X/postgres,authenticated=X/postgres}' AND proconfig=ARRAY['search_path=""','lock_timeout=5s']::text[]) THEN RAISE EXCEPTION 'C2DJ_METADATA:platform_private.c2_order_journal_capability(uuid)'; END IF; END $acl$;
DO $acl$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.partner_order_journal_capability_v1(uuid)') AND pg_get_userbyid(proowner)='postgres' AND prosecdef=false AND proacl::text='{postgres=X/postgres,authenticated=X/postgres}' AND proconfig=ARRAY['search_path=""']::text[]) THEN RAISE EXCEPTION 'C2DJ_METADATA:public.partner_order_journal_capability_v1(uuid)'; END IF; END $acl$;
DO $closure$ BEGIN
IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='platform_private.c2_attempt_closure_guard()'::regprocedure)
 IS DISTINCT FROM '140ceb10660fb226fda78fb94277d17e' THEN RAISE EXCEPTION 'C2DJ_CLOSURE_DRIFT'; END IF;
END $closure$;
DO $imports$ BEGIN
IF EXISTS(SELECT 1 FROM platform_private.partner_order_attempt_journal j
 WHERE j.imported_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.partner_order_idempotency i
 WHERE i.created_by=j.actor_id AND i.partner_id=j.partner_id AND i.idempotency_key=j.idempotency_key AND i.order_id=j.imported_order_id))
 THEN RAISE EXCEPTION 'C2DJ_IMPORT_DRIFT'; END IF;
END $imports$;
DO $journal_structure$ BEGIN
IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='platform_private.partner_order_attempt_journal'::regclass AND NOT tgisinternal)<>2
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='platform_private.partner_order_attempt_journal'::regclass
 AND tgname='c2dj_no_change' AND tgenabled='O' AND tgtype=27 AND tgfoid='platform_private.c2_attempt_closure_immutable()'::regprocedure)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='platform_private.partner_order_attempt_journal'::regclass
 AND tgname='c2dj_no_truncate' AND tgenabled='O' AND tgtype=34 AND tgfoid='platform_private.c2_attempt_closure_immutable()'::regprocedure)
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='platform_private.partner_order_attempt_journal'::regclass
 AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (actor_id, organization_id, partner_id, generation)')
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='platform_private.partner_order_attempt_journal'::regclass
 AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (idempotency_key)')
 THEN RAISE EXCEPTION 'C2DJ_JOURNAL_STRUCTURE_DRIFT'; END IF;
END $journal_structure$;
DO $canonical_metadata$ BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'::regprocedure
 AND pg_get_userbyid(proowner)='postgres' AND prosecdef AND proconfig=ARRAY['search_path=public']::text[]
 AND proacl::text='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}')
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='platform_private.c2_close_partner_order_attempt_core(uuid,text)'::regprocedure
 AND pg_get_userbyid(proowner)='postgres' AND prosecdef AND proconfig=ARRAY['search_path=""','lock_timeout=5s']::text[]
 AND proacl::text='{postgres=X/postgres,authenticated=X/postgres}') THEN RAISE EXCEPTION 'C2DJ_CANONICAL_METADATA_DRIFT'; END IF;
END $canonical_metadata$;
COMMIT;
