CREATE OR REPLACE FUNCTION public.fn_h6c_set_canonical_payment_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.partner_orders
     SET payment_terms_id = NEW.id
   WHERE id = NEW.partner_order_id
     AND payment_terms_id IS NULL;
  RETURN NEW;
END
$function$
