CREATE OR REPLACE FUNCTION public.rpc_cc_simulate_price(p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_plan_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric DEFAULT NULL::numeric, p_ref_date date DEFAULT CURRENT_DATE, p_quantity numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
 v_org := public.h15_actor_organization();
 IF v_org IS NULL THEN RAISE EXCEPTION 'ACTIVE_TENANT_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.fn_cc_can_prepare(v_uid) OR NOT public._saas_user_has_feature(v_uid,'catalogo_precos') THEN
  RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
 END IF;
 IF COALESCE(p_buyer_scope,'partner') <> 'partner' OR p_customer_id IS NOT NULL THEN
  RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
 END IF;
 -- Only commercial ownership proves internal A. CNPJ, tenant P and user links never authorize here.
 IF p_partner_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.partner_accounts pa
  WHERE pa.id=p_partner_id AND pa.commercial_owner_organization_id=v_org
   AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
   AND (pa.client_id IS NULL OR EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id=pa.client_id AND c.organization_id=v_org
   ))
 ) THEN RAISE EXCEPTION 'COMMERCIAL_PARTNER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_quantity IS NOT NULL AND (p_quantity <= 0 OR p_quantity::text IN ('NaN','Infinity','-Infinity')) THEN
  RAISE EXCEPTION 'QUANTITY_INVALID' USING ERRCODE='22023';
 END IF;
 IF p_volume_ml IS NOT NULL AND (p_volume_ml <= 0 OR p_volume_ml::text IN ('NaN','Infinity','-Infinity')) THEN
  RAISE EXCEPTION 'VOLUME_INVALID' USING ERRCODE='22023';
 END IF;
 IF NOT platform_private.c2p1_assignment_allowed('partner',p_partner_id,NULL) THEN RAISE EXCEPTION 'C2P1_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Read-only canonical resolver; no order, credit, receivable, snapshot or fiscal writes.
 RETURN public.fn_resolve_commercial_price('partner',p_partner_id,NULL,p_plan_id,
  p_product_id,p_microrganismo_id,p_unit_type,p_volume_ml,p_ref_date,p_quantity);
END $function$
