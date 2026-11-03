CREATE OR REPLACE FUNCTION public.platform_set_global_product_status(p_id uuid, p_expected_updated_at timestamp with time zone, p_ativo boolean, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT platform_private.set_global_product_status_core(p_id,p_expected_updated_at,p_ativo,p_reason,p_idempotency_key);
$function$
