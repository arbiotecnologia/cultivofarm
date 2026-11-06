CREATE OR REPLACE FUNCTION public.partner_order_has_production(_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.production_order_link pol
    WHERE pol.partner_order_id = _order_id
  );
$function$
