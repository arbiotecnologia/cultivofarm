CREATE OR REPLACE FUNCTION public.fn_catalogo_litro_canonico(p_produto_id uuid, p_microrganismo_id uuid, OUT litro numeric, OUT tiers integer)
 RETURNS record
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT min(round(cv.preco_litro_brl,2)),
         COALESCE(count(DISTINCT round(cv.preco_litro_brl,2)),0)::int
  FROM public.catalogo_volumes cv
  WHERE cv.ativo = true
    AND cv.preco_litro_brl IS NOT NULL
    AND cv.produto_id IS NOT DISTINCT FROM p_produto_id
    AND cv.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id;
$function$
