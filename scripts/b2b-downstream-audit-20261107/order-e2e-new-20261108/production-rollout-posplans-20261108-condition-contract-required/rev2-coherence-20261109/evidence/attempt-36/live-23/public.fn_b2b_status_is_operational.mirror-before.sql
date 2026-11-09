CREATE OR REPLACE FUNCTION public.fn_b2b_status_is_operational(p_status partner_order_status)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_status IN (
    'em_producao','produzido','aguardando_entrega','confirmado',
    'em_separacao','enviado','entregue','faturado'
  )::boolean
$function$
