CREATE OR REPLACE FUNCTION public.fn_b2b_status_is_approved_or_later(partner_order_status)
 RETURNS boolean
 LANGUAGE sql
AS $function$ SELECT $1 IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') $function$
