-- F2-B1 2026-10-18 | SOMENTE REVISÃO. Nada executado hosted.
-- Ref obrigatório swzpzcwiasxmjutrmvkm; confirmar externamente, não por GUC/database.
-- Restaura lacuna de revogação; somente com decisão explícita/contenção.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $rollback$
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'F2B1_EXECUTOR_NOT_REVIEWED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc f WHERE f.oid='platform_private.b2b_commercial_context()'::regprocedure AND f.proowner='postgres'::regrole AND f.prosecdef AND f.provolatile='s' AND f.proconfig=ARRAY['search_path=""']::text[])
 OR (SELECT array_agg(x::text ORDER BY x::text) FROM pg_proc f,unnest(f.proacl) x WHERE f.oid='platform_private.b2b_commercial_context()'::regprocedure) IS DISTINCT FROM ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[]
 THEN RAISE EXCEPTION 'F2B1_ROLLBACK_METADATA_DRIFT'; END IF;
 IF (SELECT prosrc FROM pg_proc WHERE oid='platform_private.b2b_commercial_context()'::regprocedure)
 IS DISTINCT FROM $expected$
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
END $expected$ THEN RAISE EXCEPTION 'F2B1_ROLLBACK_BODY_DRIFT'; END IF;
END $rollback$;
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
 IF (SELECT count(*) FROM public.partner_users pu WHERE pu.user_id=u)<>1 THEN RETURN NULL; END IF;
 SELECT pu.partner_id,pu.papel INTO link FROM public.partner_users pu WHERE pu.user_id=u;
 IF link.papel IS DISTINCT FROM (CASE WHEN role_name='parceiro_b2b_tecnico' THEN 'tecnico' ELSE 'gestor' END) THEN RETURN NULL; END IF;
 SELECT pa.commercial_owner_organization_id INTO owner FROM public.partner_accounts pa
 WHERE pa.id=link.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
 IF owner IS NULL THEN RETURN NULL; END IF;
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
COMMIT;
