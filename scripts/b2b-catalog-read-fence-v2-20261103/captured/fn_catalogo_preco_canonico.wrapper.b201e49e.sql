CREATE OR REPLACE FUNCTION public.fn_catalogo_preco_canonico(p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$BEGIN PERFORM platform_private.tenant_catalog_fence('read_catalog', array_remove(ARRAY[CASE WHEN p_product_id IS NULL THEN NULL ELSE coalesce((SELECT z.owner_organization_id FROM public.produtos z WHERE z.id = p_product_id), '00000000-0000-0000-0000-000000000000'::uuid) END, CASE WHEN p_microrganismo_id IS NULL THEN NULL ELSE coalesce((SELECT z.owner_organization_id FROM public.microrganismos z WHERE z.id = p_microrganismo_id), '00000000-0000-0000-0000-000000000000'::uuid) END]::uuid[], NULL)); RETURN platform_private.fn_catalogo_preco_canonico__tenant_core(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml); END$function$
