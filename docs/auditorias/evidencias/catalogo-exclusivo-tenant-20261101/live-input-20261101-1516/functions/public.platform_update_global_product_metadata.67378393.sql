CREATE OR REPLACE FUNCTION public.platform_update_global_product_metadata(p_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT platform_private.update_global_product_metadata_core(p_id,p_expected_updated_at,p_patch,p_reason,p_idempotency_key);
$function$
