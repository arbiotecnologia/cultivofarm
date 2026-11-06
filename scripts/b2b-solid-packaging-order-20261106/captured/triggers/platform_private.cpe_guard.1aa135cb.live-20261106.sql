CREATE OR REPLACE FUNCTION platform_private.cpe_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'PACK_PRICE_HISTORY' USING ERRCODE='42501'; END IF;
  IF TG_OP = 'UPDATE' AND ((NEW.produto_id, NEW.owner_organization_id, NEW.packaging_id, NEW.preco_brl, NEW.valid_from)
       IS DISTINCT FROM (OLD.produto_id, OLD.owner_organization_id, OLD.packaging_id, OLD.preco_brl, OLD.valid_from)
       OR (OLD.ativo IS FALSE AND NEW.ativo IS TRUE)) THEN RAISE EXCEPTION 'PACK_PRICE_IMMUTABLE' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id = NEW.produto_id AND z.owner_organization_id = NEW.owner_organization_id)
     OR NOT EXISTS (SELECT 1 FROM public.product_packagings k WHERE k.id = NEW.packaging_id
          AND k.product_id = NEW.produto_id AND k.owner_organization_id = NEW.owner_organization_id) THEN
    RAISE EXCEPTION 'PACK_PRICE_TENANT' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $function$
