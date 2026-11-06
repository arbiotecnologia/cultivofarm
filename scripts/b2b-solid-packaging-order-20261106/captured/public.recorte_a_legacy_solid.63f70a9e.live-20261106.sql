CREATE OR REPLACE FUNCTION public.recorte_a_legacy_solid(p_product uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS (SELECT 1 FROM public.product_sale_units s
 WHERE s.product_id=p_product AND s.unidade_conteudo IN ('kg','g'))
 $function$
