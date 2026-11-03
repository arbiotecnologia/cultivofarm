CREATE OR REPLACE FUNCTION platform_private.lab_item_is_manufacturable(p_product_id uuid, p_microorganism_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    -- Duas referências na mesma linha são ambíguas e falham fechadas. Isso impede que
    -- um microrganismo válido transforme produto químico/fertilizante em fabricável.
    WHEN p_product_id IS NOT NULL AND p_microorganism_id IS NOT NULL THEN false
    WHEN p_product_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=p_product_id AND p.familia_catalogo='biologico')
    WHEN p_microorganism_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.microrganismos m WHERE m.id=p_microorganism_id)
    ELSE false END
$function$
