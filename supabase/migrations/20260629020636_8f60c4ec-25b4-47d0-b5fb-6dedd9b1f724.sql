CREATE OR REPLACE FUNCTION public.tg_partner_orders_require_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NEW.status = 'aprovado' AND (OLD.status IS DISTINCT FROM 'aprovado') THEN
    SELECT count(*) INTO v_count
      FROM public.partner_order_items
     WHERE order_id = NEW.id;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'no_items: pedido sem itens — não pode ser aprovado';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;