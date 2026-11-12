CREATE OR REPLACE FUNCTION public.rpc_b2b_forecast_cancel_residual_v1(p_order uuid, p_expected_version integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE po public.partner_orders;f platform_private.b2b_financial_forecasts;org uuid;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'B2B_FORECAST_READ_COMMITTED_REQUIRED' USING ERRCODE='42501';END IF;
 org:=platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro']::public.app_role[]);
 IF org IS NULL THEN RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 IF public._saas_user_has_feature(auth.uid(),'pedidos_b2b') IS NOT TRUE
  OR public._saas_user_has_feature(auth.uid(),'contas_receber') IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_FEATURE_DENIED' USING ERRCODE='42501';END IF;
 IF p_order IS NULL OR p_expected_version IS NULL OR nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
  RAISE EXCEPTION 'B2B_FORECAST_CANCEL_REASON_REQUIRED' USING ERRCODE='22023';END IF;
 -- Canonical order: order row first, then forecast (same as approval and the bridge).
 SELECT * INTO po FROM public.partner_orders WHERE id=p_order
  AND EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=partner_orders.partner_id
   AND pa.commercial_owner_organization_id=org)
  AND platform_private.c2p1_settings_allowed(partner_id,true)
  AND platform_private.b2b_forecast_lifecycle_scope_v1('forecast_cancel',auth.uid(),org,
   partner_id,id) IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=p_order AND organization_id=org FOR UPDATE;
 IF NOT FOUND OR f.partner_id IS DISTINCT FROM po.partner_id THEN
  RAISE EXCEPTION 'B2B_FORECAST_CAS_CONFLICT' USING ERRCODE='PT409';END IF;
 IF platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro']::public.app_role[]) IS DISTINCT FROM f.organization_id
  OR NOT platform_private.c2p1_settings_allowed(f.partner_id,true) THEN
  RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 IF platform_private.b2b_forecast_lifecycle_allowed_v1('forecast_cancel',auth.uid(),org,
   po.partner_id,po.id) IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_PILOT_DENIED' USING ERRCODE='42501';END IF;
 IF public._saas_user_has_feature(auth.uid(),'pedidos_b2b') IS NOT TRUE
  OR public._saas_user_has_feature(auth.uid(),'contas_receber') IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_FEATURE_DENIED' USING ERRCODE='42501';END IF;
 IF platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro']::public.app_role[]) IS DISTINCT FROM org
  OR platform_private.c2p1_settings_allowed(po.partner_id,true) IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 -- An emission/consultation still open or an authorized return awaiting close must settle first.
 IF EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN public.fiscal_sefaz_transmissions t ON t.fiscal_invoice_id=i.id
   WHERE i.partner_order_id=p_order AND t.state IN ('PENDING','SENT')) THEN
  RAISE EXCEPTION 'B2B_FORECAST_FISCAL_IN_FLIGHT' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN platform_private.fiscal_close_pending cp ON cp.fiscal_invoice_id=i.id
   WHERE i.partner_order_id=p_order) THEN
  RAISE EXCEPTION 'B2B_FORECAST_FISCAL_RECONCILIATION_PENDING' USING ERRCODE='PT409';END IF;
 RETURN platform_private.b2b_financial_forecast_cancel_residual_v1(f.id,p_expected_version,p_reason)
  ||jsonb_build_object('actor',auth.uid(),'order_id',p_order);
END
$function$