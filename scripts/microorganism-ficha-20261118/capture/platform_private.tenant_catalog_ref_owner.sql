CREATE OR REPLACE FUNCTION platform_private.tenant_catalog_ref_owner(p_tbl text, p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v uuid;
BEGIN
  IF p_tbl NOT IN ('produtos','microrganismos','culturas') THEN RAISE EXCEPTION 'tenant_catalog_ref_table' USING ERRCODE='22023'; END IF;
  EXECUTE format('SELECT owner_organization_id FROM public.%I WHERE id = $1 FOR SHARE', p_tbl) INTO v USING p_id;
  RETURN v;
END $function$;
