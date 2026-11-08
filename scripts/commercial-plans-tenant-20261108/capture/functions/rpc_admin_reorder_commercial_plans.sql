CREATE OR REPLACE FUNCTION public.rpc_admin_reorder_commercial_plans(p_orders jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_item jsonb;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF jsonb_typeof(p_orders) <> 'array' THEN RAISE EXCEPTION 'orders_payload_invalid'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cpp_reorder'));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_orders) LOOP
    IF (v_item->>'sort_order')::integer < 0 THEN RAISE EXCEPTION 'sort_order_invalid'; END IF;
    UPDATE public.commercial_payment_plans
       SET sort_order = (v_item->>'sort_order')::integer, updated_by = auth.uid()
     WHERE id = (v_item->>'id')::uuid;
  END LOOP;

  PERFORM public._cpp_audit('commercial_plan_reordered', NULL, NULL, jsonb_build_object('orders', p_orders), NULL);
END
$function$
