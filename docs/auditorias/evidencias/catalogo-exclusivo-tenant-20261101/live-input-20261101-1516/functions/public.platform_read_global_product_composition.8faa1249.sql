CREATE OR REPLACE FUNCTION public.platform_read_global_product_composition(p_produto_id uuid, p_limit integer DEFAULT 50, p_receita_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.read_global_product_composition_core(p_produto_id,p_limit,p_receita_offset) $function$
