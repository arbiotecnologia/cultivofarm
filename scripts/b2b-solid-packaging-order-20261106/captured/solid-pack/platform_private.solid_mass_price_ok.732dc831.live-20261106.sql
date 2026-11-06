CREATE OR REPLACE FUNCTION platform_private.solid_mass_price_ok(p numeric)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT p IS NOT NULL AND p::text NOT IN ('NaN','Infinity','-Infinity') AND p >= 0 $function$
