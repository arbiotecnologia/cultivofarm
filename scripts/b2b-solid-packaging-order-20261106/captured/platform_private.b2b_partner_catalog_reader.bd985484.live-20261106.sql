CREATE OR REPLACE FUNCTION platform_private.b2b_partner_catalog_reader(p_partner_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); s record; v_seller uuid; v_buyer boolean; v_internal boolean;
BEGIN
  IF v_uid IS NULL OR p_partner_id IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF public.is_platform_superadmin(v_uid) IS NOT FALSE THEN RAISE EXCEPTION 'b2b_catalog_platform_actor_denied' USING ERRCODE='42501'; END IF;
  SELECT pa.commercial_owner_organization_id INTO v_seller FROM public.partner_accounts pa
   WHERE pa.id = p_partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
  IF v_seller IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = v_seller AND o.ativo IS TRUE AND o.status = 'ativa') THEN
    RAISE EXCEPTION 'partner_not_found' USING ERRCODE='42501'; END IF;
  IF public.has_role(v_uid,'parceiro_b2b_tecnico'::public.app_role) IS NOT FALSE THEN
    RAISE EXCEPTION 'forbidden_financial_terms' USING ERRCODE='42501'; END IF;
  v_buyer := public.has_role(v_uid,'parceiro_b2b'::public.app_role) IS TRUE;
  v_internal := public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'gestor_comercial'::public.app_role) IS TRUE;
  IF v_buyer THEN
    -- Ramo comprador: todos os campos do escopo canônico precisam bater com o parceiro pedido.
    SELECT * INTO s FROM platform_private.b2b_actor_scope(v_uid);
    IF NOT FOUND OR s.profile_ok IS NOT TRUE OR s.partner_valid IS NOT TRUE OR s.user_partner_count IS DISTINCT FROM 1
       OR s.user_partner IS DISTINCT FROM p_partner_id OR s.org_partner IS DISTINCT FROM p_partner_id OR s.has_catalog IS NOT TRUE THEN
      RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
  ELSIF v_internal THEN
    -- Ramo interno: só ator comercial interno do vendedor (carteira); org_partner nunca autoriza.
    IF platform_private.b2b_internal_commercial_actor() IS NOT TRUE
       OR platform_private.c2_internal_order_target_reason(v_uid, p_partner_id) IS NOT NULL THEN
      RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
    IF public._saas_user_has_feature(v_uid, 'catalogo_precos') IS NOT TRUE THEN
      RAISE EXCEPTION 'feature_not_entitled' USING ERRCODE='42501'; END IF;
  ELSE
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE='42501';
  END IF;
  RETURN v_seller;
END $function$
