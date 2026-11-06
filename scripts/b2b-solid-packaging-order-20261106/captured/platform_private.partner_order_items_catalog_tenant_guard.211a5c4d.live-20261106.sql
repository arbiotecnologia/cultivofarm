CREATE OR REPLACE FUNCTION platform_private.partner_order_items_catalog_tenant_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_t uuid;
BEGIN
  IF NOT (NEW.product_id IS NOT NULL OR NEW.microrganismo_id IS NOT NULL) THEN RETURN NEW; END IF;
  IF true THEN
    v_t := (SELECT pa.commercial_owner_organization_id FROM public.partner_accounts pa WHERE pa.id = (SELECT po.partner_id FROM public.partner_orders po WHERE po.id = NEW.order_id));
    IF NEW.product_id IS NOT NULL AND (v_t IS NULL OR NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id = NEW.product_id AND z.owner_organization_id = v_t)) THEN
      RAISE EXCEPTION 'tenant_catalog_cross_tenant_reference' USING ERRCODE = '42501', DETAIL = 'partner_order_items.product_id'; END IF;
    IF NEW.microrganismo_id IS NOT NULL AND (v_t IS NULL OR NOT EXISTS (SELECT 1 FROM public.microrganismos z WHERE z.id = NEW.microrganismo_id AND z.owner_organization_id = v_t)) THEN
      RAISE EXCEPTION 'tenant_catalog_cross_tenant_reference' USING ERRCODE = '42501', DETAIL = 'partner_order_items.microrganismo_id'; END IF;
  END IF;
  RETURN NEW;
END $function$
