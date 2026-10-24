CREATE OR REPLACE FUNCTION public.fn_b2b_guard_order_items_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid := COALESCE(NEW.order_id, OLD.order_id);
  v_status public.partner_order_status;
BEGIN
  SELECT status INTO v_status FROM public.partner_orders WHERE id = v_order_id;
  IF v_status IS NOT NULL AND public.fn_b2b_status_is_approved_or_later(v_status) THEN
    RAISE EXCEPTION 'order_items_immutable_after_approval: pedido em status %', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$
