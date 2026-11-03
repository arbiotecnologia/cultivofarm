CREATE OR REPLACE FUNCTION platform_private.catalog_volume_parent(p_tipo text, p_id uuid, p_lock boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb;
BEGIN
  IF p_id IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('produto','microrganismo') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  IF p_tipo='produto' THEN
    IF p_lock THEN SELECT pg_catalog.to_jsonb(x) INTO v FROM public.produtos x WHERE x.id=p_id FOR UPDATE;
    ELSE SELECT pg_catalog.to_jsonb(x) INTO v FROM public.produtos x WHERE x.id=p_id; END IF;
  ELSE
    IF p_lock THEN SELECT pg_catalog.to_jsonb(x) INTO v FROM public.microrganismos x WHERE x.id=p_id FOR UPDATE;
    ELSE SELECT pg_catalog.to_jsonb(x) INTO v FROM public.microrganismos x WHERE x.id=p_id; END IF;
  END IF;
  IF v IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_volume_unavailable'; END IF;
  RETURN v;
END;
$function$
