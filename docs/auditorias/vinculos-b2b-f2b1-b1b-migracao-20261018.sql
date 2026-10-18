-- F2-B1 2026-10-18 | SOMENTE REVISÃO. Nada executado hosted.
-- Ref obrigatório swzpzcwiasxmjutrmvkm; confirmar externamente, não por GUC/database.
-- NO-GO instalação. Preflight termina em exceção deliberada até nova revisão.
-- Único body candidato: contexto comercial; NÃO fecha todos canais.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE item record; fn record; digest text;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'F2B1_EXECUTOR_NOT_REVIEWED'; END IF;
 FOR item IN SELECT * FROM (VALUES ('platform_private.b2b_commercial_context()','02158d4204dea67308558f649113ba6d','',true),('platform_private.b2b_actor_scope(uuid)','c85cb35201682c3c86b9a327d24c8482','public, pg_temp',false),('platform_private.b2b_phase1_partner_visible(uuid,boolean)','35cfda5d5988fb6ad57944bd11a51c3c','public, pg_temp',true),('platform_private.b2b_commercial_partner_projection()','67fb596323c4222f9b1357eb42d93eca','',true)) v(sig,digest,path,client_execute) LOOP
  SELECT * INTO fn FROM pg_proc WHERE oid=to_regprocedure(item.sig);
  IF NOT FOUND OR md5(pg_get_functiondef(fn.oid))<>item.digest OR NOT fn.prosecdef OR fn.proowner<>'postgres'::regrole OR fn.provolatile<>'s'
  THEN RAISE EXCEPTION 'F2B1_BASELINE_DRIFT: %',item.sig; END IF;
  IF fn.proconfig IS DISTINCT FROM ARRAY[CASE WHEN item.path='' THEN 'search_path=""' ELSE 'search_path='||item.path END]::text[]
  OR (SELECT array_agg(x::text ORDER BY x::text) FROM unnest(fn.proacl) x) IS DISTINCT FROM
     (CASE WHEN item.client_execute THEN ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres'] ELSE ARRAY['postgres=X/postgres','service_role=X/postgres'] END)::text[]
  THEN RAISE EXCEPTION 'F2B1_DEPENDENCY_METADATA_DRIFT: %',item.sig; END IF;
  IF (SELECT count(*) FROM pg_proc sibling WHERE sibling.pronamespace=fn.pronamespace AND sibling.proname=fn.proname)<>1
  THEN RAISE EXCEPTION 'F2B1_OVERLOAD_DRIFT: %',item.sig; END IF;
 END LOOP;
 IF (SELECT array_agg(x::text ORDER BY x::text) FROM pg_proc f,unnest(f.proacl) x WHERE f.oid='platform_private.b2b_commercial_context()'::regprocedure)
 IS DISTINCT FROM ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]
 THEN RAISE EXCEPTION 'F2B1_CONTEXT_ACL_DRIFT'; END IF;
 IF (SELECT proconfig FROM pg_proc WHERE oid='platform_private.b2b_commercial_context()'::regprocedure) IS DISTINCT FROM ARRAY['search_path=""']::text[]
 THEN RAISE EXCEPTION 'F2B1_CONTEXT_SEARCH_PATH_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_users'::regclass AND conname='partner_users_user_id_key' AND pg_get_constraintdef(oid)='UNIQUE (user_id)')
 THEN RAISE EXCEPTION 'F2B1_UNIQUE_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_users pu LEFT JOIN public.partner_accounts pa ON pa.id=pu.partner_id WHERE pu.revoked_at IS NULL AND (pu.tenant_id IS NULL OR pu.tenant_id IS DISTINCT FROM pa.commercial_owner_organization_id OR pu.valid_from IS NULL OR pu.valid_from>now()))
 THEN RAISE EXCEPTION 'F2B1_CURRENT_LINK_REVIEW_REQUIRED'; END IF;
 SELECT md5(string_agg(schemaname||'.'||tablename||':'||policyname||':'||roles::text||':'||cmd||':'||permissive||':'||coalesce(qual,'')||':'||coalesce(with_check,''),E'\n' ORDER BY schemaname,tablename,policyname)) INTO digest FROM pg_policies
 WHERE coalesce(qual,'')||' '||coalesce(with_check,'') ~ '(get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user)';
 IF digest IS DISTINCT FROM '5a621e86afa1861398ab70784eaae6e4' THEN RAISE EXCEPTION 'F2B1_POLICY_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_user_clients WHERE active) OR EXISTS(SELECT 1 FROM public.partner_technician_clients WHERE active)
 THEN RAISE EXCEPTION 'F2B1_ASSIGNMENT_IMPACT_REVIEW_REQUIRED'; END IF;
 -- Deliberate hard stop: no flag/GUC can release an unproven contract.
 RAISE EXCEPTION 'F2B1_HOSTED_RLS_AND_LEGACY_PROOF_REQUIRED';
END $preflight$;
-- BEGIN B1B CANDIDATE
CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); org uuid; role_name text; link record; owner uuid; legacy uuid; mode text;
BEGIN
 IF u IS NULL OR NOT platform_private.platform_actor_access_ready(u) THEN RETURN NULL; END IF;
 org:=public.h15_actor_organization();
 IF org IS NULL OR (SELECT count(*) FROM public.user_roles r WHERE r.user_id=u)<>1 THEN RETURN NULL; END IF;
 SELECT r.role::text INTO role_name FROM public.user_roles r WHERE r.user_id=u;
 IF role_name NOT IN ('parceiro_b2b','parceiro_b2b_tecnico') THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM public.partner_users pu WHERE pu.user_id=u AND pu.revoked_at IS NULL)<>1 THEN RETURN NULL; END IF;
 SELECT pu.partner_id,pu.papel,pu.tenant_id,pu.valid_from INTO link FROM public.partner_users pu WHERE pu.user_id=u AND pu.revoked_at IS NULL;
 IF link.valid_from IS NULL OR link.valid_from>now() THEN RETURN NULL; END IF;
 IF link.papel IS DISTINCT FROM (CASE WHEN role_name='parceiro_b2b_tecnico' THEN 'tecnico' ELSE 'gestor' END) THEN RETURN NULL; END IF;
 SELECT pa.commercial_owner_organization_id INTO owner FROM public.partner_accounts pa
 WHERE pa.id=link.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
 IF owner IS NULL OR link.tenant_id IS DISTINCT FROM owner THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='catalogo_precos') THEN RETURN NULL; END IF;
 SELECT o.partner_account_id INTO legacy FROM public.organizations o WHERE o.id=org AND o.ativo IS TRUE AND o.status='ativa';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF owner=org THEN
   IF legacy IS NOT NULL AND legacy IS DISTINCT FROM link.partner_id THEN RETURN NULL; END IF;
   mode:='commercial_owner';
 ELSIF legacy=link.partner_id AND COALESCE(platform_private.b2b_phase1_partner_visible(link.partner_id,true),false) THEN
   mode:='legacy_partner_tenant';
 ELSE RETURN NULL;
 END IF;
 RETURN jsonb_build_object('partner_id',link.partner_id,'organization_id',org,
   'commercial_owner_organization_id',owner,'role',role_name,'papel',link.papel,'mode',mode);
END $function$;
-- END B1B CANDIDATE
COMMIT;
