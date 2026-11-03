CREATE OR REPLACE FUNCTION public.platform_read_global_product_catalog(p_search text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.platform_read_global_product_catalog_core(p_search, p_limit, p_offset); $function$
