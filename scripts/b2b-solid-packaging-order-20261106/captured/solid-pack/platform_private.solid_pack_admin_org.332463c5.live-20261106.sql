CREATE OR REPLACE FUNCTION platform_private.solid_pack_admin_org(p_product uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid; v_uid uuid := auth.uid();
BEGIN
  v_org := platform_private.recorte_a_actor_fresh('mutate');
  IF v_org IS NULL THEN RAISE EXCEPTION 'catalog_visibility_tenant_unavailable' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = v_uid AND r.role::text IN ('parceiro_b2b','parceiro_b2b_tecnico')) THEN
    RAISE EXCEPTION 'PACK_ADMIN_EXTERNAL_ROLE' USING ERRCODE='42501'; END IF;
  IF p_product IS NULL OR NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id = p_product AND z.owner_organization_id = v_org) THEN
    RAISE EXCEPTION 'PACK_ADMIN_PRODUCT_OUTSIDE_TENANT' USING ERRCODE='42501'; END IF;
  RETURN v_org;
END $function$
