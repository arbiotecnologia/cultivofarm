CREATE OR REPLACE FUNCTION platform_private.catalog_composition_row_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_fam text;
BEGIN
  SELECT p.familia_catalogo INTO v_fam FROM public.produtos p WHERE p.id = NEW.produto_id;
  IF NOT platform_private.catalog_composition_type_allowed(v_fam, NEW.tipo_componente) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='catalog_composition_family_conflict'; END IF;
  RETURN NEW;
END;
$function$
