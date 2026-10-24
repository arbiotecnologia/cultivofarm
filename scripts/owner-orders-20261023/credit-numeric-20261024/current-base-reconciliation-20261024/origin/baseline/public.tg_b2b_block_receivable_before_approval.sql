CREATE OR REPLACE FUNCTION public.tg_b2b_block_receivable_before_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status partner_order_status;
BEGIN
  IF NEW.partner_order_id IS NULL THEN RETURN NEW; END IF;
  SELECT status INTO v_status FROM public.partner_orders WHERE id = NEW.partner_order_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF NOT public.fn_b2b_status_is_approved_or_later(v_status) THEN
    RAISE EXCEPTION 'receivable_requires_approved_order: status=%', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$function$
