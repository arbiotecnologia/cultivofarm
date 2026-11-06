CREATE OR REPLACE FUNCTION platform_private.catalogo_volumes_owner_consistent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.owner_organization_id IS DISTINCT FROM OLD.owner_organization_id THEN
    RAISE EXCEPTION 'tenant_catalog_owner_immutable' USING ERRCODE = '42501'; END IF;
  IF NEW.produto_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = NEW.produto_id AND p.owner_organization_id = NEW.owner_organization_id)
     OR NEW.microrganismo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.microrganismos m WHERE m.id = NEW.microrganismo_id AND m.owner_organization_id = NEW.owner_organization_id)
  THEN RAISE EXCEPTION 'tenant_catalog_cross_tenant_reference' USING ERRCODE = '42501', DETAIL = 'catalogo_volumes'; END IF;
  RETURN NEW;
END $function$
