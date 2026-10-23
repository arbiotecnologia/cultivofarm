CREATE OR REPLACE FUNCTION public.fn_b2b_order_priceable(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(po.status::text <> 'aguardando_cotacao'
              AND COALESCE(po.payment_condition_status,'') <> 'quote_required'
              AND COALESCE(po.final_amount_with_interest, po.total, 0) > 0
              AND EXISTS (SELECT 1 FROM public.partner_order_payment_terms t
                          WHERE t.partner_order_id = po.id AND t.final_amount > 0)
              AND NOT EXISTS (SELECT 1 FROM public.partner_order_items i
                              WHERE i.order_id = po.id
                                AND COALESCE(i.pricing_mode_snapshot,'') = 'quote_only'), false)
  FROM public.partner_orders po WHERE po.id = p_order_id
$function$

