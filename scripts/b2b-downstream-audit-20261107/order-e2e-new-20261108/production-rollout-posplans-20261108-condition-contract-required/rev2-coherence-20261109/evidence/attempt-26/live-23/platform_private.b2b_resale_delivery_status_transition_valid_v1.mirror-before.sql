CREATE OR REPLACE FUNCTION platform_private.b2b_resale_delivery_status_transition_valid_v1(o partner_orders, n partner_orders)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 RETURN (
  EXISTS(SELECT 1 FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton AND enabled IS TRUE)
  AND platform_private.b2b_internal_commercial_actor() IS TRUE
  AND o.id=n.id AND o.status::text='aprovado' AND n.status::text='entregue'
  AND o.ready_for_production IS FALSE AND n.ready_for_production IS FALSE
  AND n.receivable_generated IS FALSE
  AND (to_jsonb(n)-ARRAY['status','updated_at']) IS NOT DISTINCT FROM (to_jsonb(o)-ARRAY['status','updated_at'])
  AND EXISTS(
   SELECT 1 FROM platform_private.delivery_context_20261030 dc
   JOIN public.entregas e ON e.id=dc.target AND e.partner_order_id=n.id
   JOIN public.ordens_servico os ON os.id=e.ordem_servico_id AND os.partner_order_id=n.id
   JOIN public.partner_accounts pa ON pa.id=n.partner_id
    AND pa.commercial_owner_organization_id=dc.organization_id AND pa.commercial_owner_organization_id=os.organization_id
   WHERE dc.txid=txid_current() AND dc.actor=auth.uid() AND dc.action='confirm' AND dc.mutation='done'
    AND e.organization_id=dc.organization_id AND e.status::text='entregue' AND e.receivable_id IS NULL
    AND platform_private.b2b_resale_delivery_order_valid_v1(e) IS TRUE
  )
  AND NOT EXISTS(
   SELECT 1 FROM public.entregas e JOIN public.ordens_servico os ON os.id=e.ordem_servico_id
   WHERE os.partner_order_id=n.id AND e.status::text NOT IN ('entregue','cancelada')
  )
  -- TODOS os itens precisam ter exatamente sua quantidade confirmada. Uma OS ou
  -- entrega de outro item nunca completa este item; canceladas não somam, e
  -- excesso também impede a transição. O snapshot econômico permanece o mesmo.
  AND NOT EXISTS(
   SELECT 1 FROM public.partner_order_items i
   LEFT JOIN public.ordens_servico os ON os.partner_order_item_id=i.id
    AND os.partner_order_id=n.id AND os.origem='b2b'
   LEFT JOIN public.entregas e ON e.ordem_servico_id=os.id AND e.partner_order_id=n.id
    AND e.status::text='entregue' AND e.receivable_id IS NULL
   WHERE i.order_id=n.id
   GROUP BY i.id,i.quantidade
   HAVING coalesce(sum(e.quantidade_entregue),0) IS DISTINCT FROM i.quantidade
  )
  -- Nenhuma entrega confirmada pode ficar fora dos itens imutáveis do pedido.
  AND NOT EXISTS(
   SELECT 1 FROM public.entregas e
   JOIN public.ordens_servico os ON os.id=e.ordem_servico_id AND os.partner_order_id=n.id
   LEFT JOIN public.partner_order_items i ON i.id=os.partner_order_item_id AND i.order_id=n.id
   WHERE e.partner_order_id=n.id AND e.status::text='entregue' AND i.id IS NULL
  )
  ) IS TRUE;
END;
$function$
