CREATE OR REPLACE FUNCTION platform_private.solid_pack_weight_label(p_kg numeric, p_unit text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN p_unit = 'g' THEN platform_private.solid_pack_decimal_text(p_kg * 1000) || ' g'
             ELSE platform_private.solid_pack_decimal_text(p_kg) || ' kg' END $function$
