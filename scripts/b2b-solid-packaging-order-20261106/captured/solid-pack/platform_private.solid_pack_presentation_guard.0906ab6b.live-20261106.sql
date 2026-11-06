CREATE OR REPLACE FUNCTION platform_private.solid_pack_presentation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_forma text; v_ticket boolean;
BEGIN
  v_ticket := EXISTS (SELECT 1 FROM platform_private.solid_pack_presentation_tx t WHERE t.txid = pg_catalog.txid_current());
  IF TG_OP = 'DELETE' THEN
    IF OLD.medida = 'embalagem' THEN RAISE EXCEPTION 'PRESENTATION_HISTORY' USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.medida IS DISTINCT FROM OLD.medida THEN
    RAISE EXCEPTION 'PRESENTATION_MEDIDA_IMMUTABLE' USING ERRCODE='42501'; END IF;
  IF NEW.medida = 'embalagem' THEN
    IF v_ticket IS NOT TRUE THEN RAISE EXCEPTION 'PRESENTATION_PACK_WRITER_ONLY' USING ERRCODE='42501'; END IF;
    IF TG_OP = 'UPDATE' AND (NEW.produto_id, NEW.owner_organization_id, NEW.rotulo, NEW.item_tipo)
         IS DISTINCT FROM (OLD.produto_id, OLD.owner_organization_id, OLD.rotulo, OLD.item_tipo) THEN
      RAISE EXCEPTION 'PRESENTATION_PACK_IMMUTABLE' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.produto_id IS NOT NULL AND NEW.ativo IS TRUE THEN
    
    
    
    
    
    
    
    
    PERFORM 1 FROM public.produtos z WHERE z.id = NEW.produto_id FOR NO KEY UPDATE;
    SELECT s.forma_fisica INTO v_forma FROM public.product_sale_units s WHERE s.product_id = NEW.produto_id;
    IF (NEW.medida = 'volume' AND v_forma = 'solido') OR (NEW.medida = 'embalagem' AND v_forma IS DISTINCT FROM 'solido') THEN
      RAISE EXCEPTION 'PRESENTATION_MEDIDA_MISMATCH' USING ERRCODE='PT409'; END IF;
  END IF;
  RETURN NEW;
END $function$
