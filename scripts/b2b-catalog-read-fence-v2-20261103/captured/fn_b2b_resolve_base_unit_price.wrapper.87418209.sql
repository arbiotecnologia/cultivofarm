CREATE OR REPLACE FUNCTION public.fn_b2b_resolve_base_unit_price(p_partner_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric DEFAULT NULL::numeric, p_ref_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$BEGIN PERFORM platform_private.tenant_catalog_fence('read_catalog', array_remove(ARRAY[CASE WHEN p_partner_id IS NULL THEN NULL ELSE coalesce((SELECT x.commercial_owner_organization_id FROM public.partner_accounts x WHERE x.id = p_partner_id), '00000000-0000-0000-0000-000000000000'::uuid) END, CASE WHEN p_product_id IS NULL THEN NULL ELSE coalesce((SELECT z.owner_organization_id FROM public.produtos z WHERE z.id = p_product_id), '00000000-0000-0000-0000-000000000000'::uuid) END, CASE WHEN p_microrganismo_id IS NULL THEN NULL ELSE coalesce((SELECT z.owner_organization_id FROM public.microrganismos z WHERE z.id = p_microrganismo_id), '00000000-0000-0000-0000-000000000000'::uuid) END]::uuid[], NULL)); RETURN platform_private.fn_b2b_resolve_base_unit_price__tenant_core(p_partner_id, p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml, p_ref_date); END$function$
