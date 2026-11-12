CREATE OR REPLACE FUNCTION public.rpc_b2b_cancel_residual_capability_v1(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE org uuid;po public.partner_orders;f platform_private.b2b_financial_forecasts;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton AND enabled) THEN RETURN jsonb_build_object('available',false); END IF;
 org:=platform_private.c2p1_internal_actor(ARRAY['administrador','gestor_comercial']::public.app_role[]);
 IF org IS NULL OR public._saas_user_has_feature(auth.uid(),'pedidos_b2b') IS NOT TRUE OR public._saas_user_has_feature(auth.uid(),'contas_receber') IS NOT TRUE THEN RETURN jsonb_build_object('available',false); END IF;
 SELECT * INTO po FROM public.partner_orders WHERE id=p_order AND EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=partner_id AND pa.commercial_owner_organization_id=org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL);
 IF NOT FOUND OR po.approved_by IS NULL OR po.approved_at IS NULL OR po.status::text NOT IN ('aprovado','entregue') OR platform_private.c2p1_settings_allowed(po.partner_id,true) IS NOT TRUE OR platform_private.b2b_forecast_lifecycle_scope_v1('forecast_cancel',auth.uid(),org,po.partner_id,po.id) IS NOT TRUE THEN RETURN jsonb_build_object('available',false); END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=po.id AND organization_id=org AND partner_id=po.partner_id;
 IF NOT FOUND OR f.residual_amount IS NULL OR f.residual_amount<=0 OR f.state NOT IN ('aprovado_previsto','faturado_parcial') OR EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN platform_private.fiscal_close_pending cp ON cp.fiscal_invoice_id=i.id WHERE i.partner_order_id=po.id) OR EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN public.fiscal_sefaz_transmissions t ON t.fiscal_invoice_id=i.id WHERE i.partner_order_id=po.id AND t.state IN ('PENDING','SENT')) THEN RETURN jsonb_build_object('available',false); END IF;
 RETURN jsonb_build_object('available',true,'order_id',po.id,'version',f.version,'residual_amount',f.residual_amount);
END $fn$;
