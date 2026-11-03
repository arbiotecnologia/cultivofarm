CREATE OR REPLACE FUNCTION public.platform_read_global_product_metadata(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT platform_private.read_global_product_metadata_core(p_id);
$function$
