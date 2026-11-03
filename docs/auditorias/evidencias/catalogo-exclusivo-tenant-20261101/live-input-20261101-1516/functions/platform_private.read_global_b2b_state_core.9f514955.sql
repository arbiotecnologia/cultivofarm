CREATE OR REPLACE FUNCTION platform_private.read_global_b2b_state_core(p_item_tipo text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_out jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_item_tipo IS NULL OR p_item_tipo NOT IN ('produto','microrganismo') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_b2b_invalid'; END IF;
  IF p_item_tipo='produto' THEN
    SELECT pg_catalog.jsonb_build_object('item_tipo','produto','id',p.id,'nome',p.nome,'codigo',p.codigo,
      'ativo',COALESCE(p.ativo,false),'b2b_enabled',p.b2b_enabled,'updated_at',p.updated_at)
      INTO v_out FROM public.produtos p WHERE p.id=p_id;
  ELSE
    SELECT pg_catalog.jsonb_build_object('item_tipo','microrganismo','id',m.id,'nome',m.nome,'codigo',m.codigo,
      'ativo',m.ativo,'b2b_enabled',m.b2b_enabled,'updated_at',m.updated_at)
      INTO v_out FROM public.microrganismos m WHERE m.id=p_id;
  END IF;
  IF v_out IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_b2b_unavailable'; END IF;
  RETURN v_out;
END;
$function$
