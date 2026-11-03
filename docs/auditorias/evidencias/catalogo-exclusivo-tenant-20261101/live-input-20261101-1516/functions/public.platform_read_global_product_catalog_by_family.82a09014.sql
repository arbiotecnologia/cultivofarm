CREATE OR REPLACE FUNCTION public.platform_read_global_product_catalog_by_family(p_familia text, p_revisao text DEFAULT 'familia'::text, p_search text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.read_global_product_catalog_by_family_core(p_familia,p_revisao,p_search,p_limit,p_offset) $function$
