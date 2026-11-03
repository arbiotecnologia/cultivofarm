CREATE OR REPLACE FUNCTION public.platform_create_global_product(p_payload jsonb, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT platform_private.create_global_product_core(p_payload,p_reason,p_idempotency_key);
$function$
