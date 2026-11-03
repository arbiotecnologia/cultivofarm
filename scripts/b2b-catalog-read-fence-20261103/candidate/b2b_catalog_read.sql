-- CANDIDATO (não aplicar pelo agente). Leitura do catálogo B2B por comprador legítimo sem ampliar
-- can_view_catalog_internal nem tenant_catalog_fence. Inserido por test-local.py entre PRE e POST.
CREATE FUNCTION platform_private.b2b_partner_catalog_reader(p_partner_id uuid) RETURNS uuid
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_uid uuid := auth.uid(); s record; v_seller uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF public.is_platform_superadmin(v_uid) THEN RAISE EXCEPTION 'b2b_catalog_platform_actor_denied' USING ERRCODE='42501'; END IF;
  SELECT pa.commercial_owner_organization_id INTO v_seller FROM public.partner_accounts pa
   WHERE pa.id = p_partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
  IF v_seller IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = v_seller AND o.ativo IS TRUE AND o.status = 'ativa') THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE='42501'; END IF;
  IF public.has_role(v_uid,'parceiro_b2b_tecnico'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden_financial_terms' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM platform_private.b2b_actor_scope(v_uid);
  IF (NOT coalesce(s.profile_ok,false) OR s.org_partner IS DISTINCT FROM p_partner_id OR NOT coalesce(s.partner_valid,false))
     AND NOT (platform_private.b2b_internal_commercial_actor()
              AND platform_private.c2_internal_order_target_reason(v_uid, p_partner_id) IS NULL) THEN
    RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
  IF public.has_role(v_uid,'parceiro_b2b'::public.app_role) THEN
    IF s.user_partner_count IS DISTINCT FROM 1 OR s.user_partner IS DISTINCT FROM p_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
  ELSIF NOT (public.has_role(v_uid,'administrador'::public.app_role) OR public.has_role(v_uid,'gestor_comercial'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE='42501';
  END IF;
  IF NOT coalesce(s.has_catalog,false) THEN RAISE EXCEPTION 'feature_not_entitled' USING ERRCODE='42501'; END IF;
  RETURN v_seller;
END $f$;
REVOKE ALL ON FUNCTION platform_private.b2b_partner_catalog_reader(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION platform_private.b2b_partner_catalog_item_price(p_partner_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric, p_ref_date date)
  RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_seller uuid;
BEGIN
  v_seller := platform_private.b2b_partner_catalog_reader(p_partner_id);
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 OR p_volume_ml IS NOT NULL OR p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose') THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'ITEM_INVALID'); END IF;
  IF p_product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id = p_product_id
       AND z.owner_organization_id = v_seller AND z.ativo IS TRUE AND z.b2b_enabled IS TRUE
       AND NOT EXISTS (SELECT 1 FROM public.catalog_tenant_visibility cv WHERE cv.organization_id = ANY(platform_private.c1b_catalog_visibility_scope(p_partner_id))
                       AND cv.entity_type = 'produto' AND cv.hidden IS TRUE AND cv.produto_id = z.id)) THEN
    RAISE EXCEPTION 'b2b_catalog_item_denied' USING ERRCODE='42501'; END IF;
  IF p_microrganismo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.microrganismos z WHERE z.id = p_microrganismo_id
       AND z.owner_organization_id = v_seller AND z.ativo IS TRUE AND z.b2b_enabled IS TRUE
       AND NOT EXISTS (SELECT 1 FROM public.catalog_tenant_visibility cv WHERE cv.organization_id = ANY(platform_private.c1b_catalog_visibility_scope(p_partner_id))
                       AND cv.entity_type = 'microrganismo' AND cv.hidden IS TRUE AND cv.microrganismo_id = z.id)) THEN
    RAISE EXCEPTION 'b2b_catalog_item_denied' USING ERRCODE='42501'; END IF;
  RETURN platform_private.fn_b2b_resolve_base_unit_price__tenant_core(p_partner_id, p_product_id, p_microrganismo_id, p_unit_type, NULL, p_ref_date);
END $f$;
REVOKE ALL ON FUNCTION platform_private.b2b_partner_catalog_item_price(uuid,uuid,uuid,text,numeric,date) FROM PUBLIC, anon, authenticated, service_role;
