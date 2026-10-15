-- SNAPSHOT READ-ONLY; JÁ EXISTENTES. NÃO REAPLICAR.
CREATE OR REPLACE FUNCTION public._assert_visita_editavel(p_registro_id uuid)
 RETURNS registros_consultor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002'; END IF;

  v_ok := COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false)
       OR COALESCE(v_reg.created_by = v_uid, false)
       OR COALESCE(v_reg.consultor_responsavel = v_uid, false)
       OR COALESCE(public.is_active_visit_participant(v_uid, p_registro_id), false);

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;

  RETURN v_reg;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_view_technical_visit(p_user_id uuid, p_registro_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT public.technical_actor_ready(p_user_id) AND EXISTS (
 SELECT 1 FROM public.registros_consultor r
 WHERE r.id=p_registro_id AND public.technical_refs_in_actor_tenant(r.cliente_id,r.fazenda_id,r.talhao_id)
 AND (public.has_role(p_user_id,'administrador') OR public.has_role(p_user_id,'gestor')
 OR ((public.has_role(p_user_id,'consultor_tecnico') OR public.has_role(p_user_id,'tecnico_agronomo'))
 AND public.technical_client_link(p_user_id,r.cliente_id,ARRAY['read','execute','manage'])
 AND (public.is_visit_responsible(p_user_id,r.id) OR public.is_active_visit_participant(p_user_id,r.id)))));
$function$;

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

CREATE OR REPLACE FUNCTION public.enforce_technical_content_editable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_old uuid; v_new uuid; v_id uuid; v_status text;
BEGIN
 IF TG_OP <> 'INSERT' THEN v_old := (to_jsonb(OLD)->>TG_ARGV[0])::uuid; END IF;
 IF TG_OP <> 'DELETE' THEN v_new := (to_jsonb(NEW)->>TG_ARGV[0])::uuid; END IF;
 FOR v_id IN SELECT DISTINCT x FROM unnest(ARRAY[v_old,v_new]) x WHERE x IS NOT NULL ORDER BY x LOOP
  SELECT r.status::text INTO v_status FROM public.registros_consultor r WHERE r.id=v_id FOR SHARE;
  IF NOT FOUND OR v_status NOT IN ('rascunho','em_andamento') THEN
   RAISE EXCEPTION 'technical_content_locked: reabra a visita pelo fluxo autorizado antes de alterar seu conteúdo' USING ERRCODE='23514';
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $function$
;
