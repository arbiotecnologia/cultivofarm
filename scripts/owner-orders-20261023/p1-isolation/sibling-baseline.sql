CREATE OR REPLACE FUNCTION public.rpc_cc_publish_item_prices(p_ids uuid[], p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; v_rule uuid; v_count int := 0;
BEGIN
  IF NOT public.fn_cc_can_publish(auth.uid()) THEN RAISE EXCEPTION 'not_authorized_publish'; END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RAISE EXCEPTION 'no_items'; END IF;

  FOR r IN SELECT * FROM public.commercial_condition_item_prices
            WHERE id = ANY(p_ids) AND status IN ('draft','pending_approval') FOR UPDATE
  LOOP
    IF r.buyer_scope = 'default' THEN RAISE EXCEPTION 'default_scope_not_publishable'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.commercial_payment_plan_assignments a
                    WHERE a.status='published' AND a.plan_id=r.plan_id
                      AND a.buyer_scope=r.buyer_scope
                      AND a.partner_id IS NOT DISTINCT FROM r.partner_id
                      AND a.customer_id IS NOT DISTINCT FROM r.customer_id) THEN
      RAISE EXCEPTION 'assignment_not_published';
    END IF;

    UPDATE public.commercial_price_rules
       SET active=false, updated_by=auth.uid(), updated_at=now()
     WHERE active
       AND plan_id = r.plan_id AND buyer_scope = r.buyer_scope
       AND partner_id IS NOT DISTINCT FROM r.partner_id
       AND customer_id IS NOT DISTINCT FROM r.customer_id
       AND product_id IS NOT DISTINCT FROM r.product_id
       AND microrganismo_id IS NOT DISTINCT FROM r.microrganismo_id
       AND unit_type = r.unit_type
       AND volume_ml IS NOT DISTINCT FROM r.volume_ml;

    INSERT INTO public.commercial_price_rules
      (buyer_scope,partner_id,customer_id,plan_id,product_id,microrganismo_id,unit_type,volume_ml,
       pricing_mode,condition_price,discount_percent,min_quantity,currency,valid_from,valid_until,active,motivo,
       created_by,updated_by)
    VALUES (r.buyer_scope,r.partner_id,r.customer_id,r.plan_id,r.product_id,r.microrganismo_id,
       r.unit_type,r.volume_ml,r.pricing_mode,
       CASE WHEN r.pricing_mode='fixed_item_price' THEN r.condition_price ELSE NULL END,
       CASE WHEN r.pricing_mode='discount_from_base' THEN r.discount_percent ELSE NULL END,
       COALESCE(r.min_quantity,0),
       COALESCE(r.currency,'BRL'),r.valid_from,r.valid_until,true,
       COALESCE(p_motivo, r.motivo), auth.uid(), auth.uid())
    RETURNING id INTO v_rule;

    UPDATE public.commercial_condition_item_prices
       SET status='published', published_by=auth.uid(), published_at=now(),
           published_rule_id=v_rule, updated_by=auth.uid()
     WHERE id = r.id;

    PERFORM public.fn_cc_audit('item_price', r.id, 'publish', to_jsonb(r),
      jsonb_build_object('price_rule_id', v_rule), p_motivo);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('published', v_count);
END $function$;
