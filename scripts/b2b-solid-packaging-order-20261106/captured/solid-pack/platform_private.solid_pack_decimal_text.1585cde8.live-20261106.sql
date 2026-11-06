CREATE OR REPLACE FUNCTION platform_private.solid_pack_decimal_text(p numeric)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE t text;
BEGIN
  IF p IS NULL OR p::text IN ('NaN','Infinity','-Infinity') OR p <= 0 THEN RAISE EXCEPTION 'invalid_weight_label' USING ERRCODE='22023'; END IF;
  t := p::text;
  IF pg_catalog.strpos(t, '.') > 0 THEN t := pg_catalog.rtrim(pg_catalog.rtrim(t, '0'), '.'); END IF;
  RETURN pg_catalog.replace(t, '.', ',');
END $function$
