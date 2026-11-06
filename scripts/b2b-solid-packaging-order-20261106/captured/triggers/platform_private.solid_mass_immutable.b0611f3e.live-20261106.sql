CREATE OR REPLACE FUNCTION platform_private.solid_mass_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN RAISE EXCEPTION 'SOLID_MASS_IMMUTABLE' USING ERRCODE='42501'; END $function$
