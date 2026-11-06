CREATE OR REPLACE FUNCTION platform_private.solid_mass_packaging_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'SOLID_MASS_PACKAGING_HISTORY' USING ERRCODE='42501'; END IF;
  
  IF (NEW.product_id, NEW.owner_organization_id, NEW.codigo, NEW.peso_liquido_kg, NEW.version, NEW.valid_from)
     IS DISTINCT FROM (OLD.product_id, OLD.owner_organization_id, OLD.codigo, OLD.peso_liquido_kg, OLD.version, OLD.valid_from)
     OR (OLD.ativo IS FALSE AND NEW.ativo IS TRUE AND NOT EXISTS (SELECT 1 FROM platform_private.solid_pack_presentation_tx t
                                                                   WHERE t.txid = pg_catalog.txid_current())) THEN
    
    RAISE EXCEPTION 'SOLID_MASS_PACKAGING_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $function$
