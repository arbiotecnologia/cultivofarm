CREATE OR REPLACE FUNCTION platform_private.catalog_tenant_actor(p_mode text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_claims jsonb := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  v_org uuid;
BEGIN
  IF v_uid IS NULL OR v_claims IS NULL OR v_claims->>'role' IS DISTINCT FROM 'authenticated'
     OR (v_claims->>'sub') IS DISTINCT FROM v_uid::text
     OR NULLIF(v_claims->>'exp','') IS NULL OR (v_claims->>'exp') !~ '^[0-9]{1,12}$'
     OR to_timestamp((v_claims->>'exp')::bigint) <= now()
     OR (NULLIF(v_claims->>'iat','') IS NOT NULL AND ((v_claims->>'iat') !~ '^[0-9]{1,12}$'
         OR to_timestamp((v_claims->>'iat')::bigint) > now() + interval '60 seconds')) THEN
    RAISE EXCEPTION 'catalog_visibility_auth_required' USING ERRCODE='42501';
  END IF;
  IF public.is_platform_superadmin(v_uid) THEN
    RAISE EXCEPTION 'catalog_visibility_platform_actor_denied' USING ERRCODE='42501';
  END IF;
  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.ativo IS TRUE AND o.status='ativa') THEN
    RAISE EXCEPTION 'catalog_visibility_tenant_unavailable' USING ERRCODE='42501';
  END IF;
  IF p_mode IN ('mutate','read_catalog','read_management') AND NOT public._saas_user_has_feature(v_uid, 'catalogo_precos') THEN
    RAISE EXCEPTION 'catalog_visibility_feature_unavailable' USING ERRCODE='42501';
  END IF;
  IF p_mode='mutate' THEN
    IF NOT (platform_private.has_role(v_uid,'administrador'::public.app_role) OR platform_private.has_role(v_uid,'gestor'::public.app_role)) THEN
      RAISE EXCEPTION 'catalog_visibility_role_denied' USING ERRCODE='42501'; END IF;
  ELSIF p_mode='read_catalog' THEN
    IF NOT public.can_view_catalog_internal(v_uid) THEN
      RAISE EXCEPTION 'catalog_visibility_role_denied' USING ERRCODE='42501'; END IF;
  ELSIF p_mode NOT IN ('read_management','read_selection_cultura','read_prefs') OR p_mode IS NULL THEN
    RAISE EXCEPTION 'catalog_visibility_mode_invalid' USING ERRCODE='22023';
  END IF;
  RETURN v_org;
END; $function$;
