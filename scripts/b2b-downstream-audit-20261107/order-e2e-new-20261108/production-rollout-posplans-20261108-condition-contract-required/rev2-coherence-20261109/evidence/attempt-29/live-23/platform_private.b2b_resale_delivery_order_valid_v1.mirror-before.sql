CREATE OR REPLACE FUNCTION platform_private.b2b_resale_delivery_order_valid_v1(e entregas)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT (EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)
  AND e.id IS NOT NULL AND e.organization_id IS NOT NULL AND e.partner_order_id IS NOT NULL
  AND e.receivable_id IS NULL AND e.ordem_servico_id IS NOT NULL AND e.ordem_servico_onfarm_id IS NULL
  AND e.cliente_id IS NULL AND EXISTS(
   SELECT 1 FROM public.ordens_servico os
   JOIN public.partner_orders po ON po.id=os.partner_order_id AND po.id=e.partner_order_id
   JOIN public.partner_accounts pa ON pa.id=po.partner_id AND pa.commercial_owner_organization_id=os.organization_id
    AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
   WHERE os.id=e.ordem_servico_id AND os.organization_id=e.organization_id AND os.origem='b2b'
    AND os.partner_order_item_id IS NOT NULL AND os.produto_id=e.produto_id AND os.microrganismo_id IS NULL
    AND po.status::text IN ('aprovado','aguardando_entrega','em_separacao','enviado','entregue','faturado')
    AND po.ready_for_production IS FALSE AND po.receivable_generated IS FALSE
    AND po.payment_condition_status='defined' AND po.financial_approval_status NOT IN ('pending','rejected')
    AND platform_private.c2_external_origin_contract_valid(po.c2_external_origin_snapshot) IS TRUE
    AND po.internal_economic_snapshot IS NOT NULL AND po.internal_origin_snapshot IS NULL
  )) IS TRUE;
$function$
