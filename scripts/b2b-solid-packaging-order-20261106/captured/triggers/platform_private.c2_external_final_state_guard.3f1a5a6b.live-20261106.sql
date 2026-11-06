CREATE OR REPLACE FUNCTION platform_private.c2_external_final_state_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.c2_external_origin_snapshot IS NOT NULL AND OLD.internal_economic_snapshot IS NULL AND NEW.internal_economic_snapshot IS NOT NULL AND NEW.status IS DISTINCT FROM 'aprovado' THEN
  RAISE EXCEPTION 'C2_EXTERNAL_UNFINALIZED_APPROVAL' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $function$
