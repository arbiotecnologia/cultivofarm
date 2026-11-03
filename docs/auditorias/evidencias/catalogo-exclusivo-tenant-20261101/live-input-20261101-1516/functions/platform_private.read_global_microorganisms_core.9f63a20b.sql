CREATE OR REPLACE FUNCTION platform_private.read_global_microorganisms_core(p_search text, p_limit integer, p_offset integer, p_only_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_search text; v_items jsonb; v_count int;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000
    OR p_only_active IS NULL OR pg_catalog.char_length(COALESCE(p_search,'')) > 120 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_micro_invalid';
  END IF;
  v_search:=pg_catalog.btrim(COALESCE(p_search,''));
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',m.id,'codigo',m.codigo,'nome',m.nome,'ativo',m.ativo)
    ORDER BY m.nome, m.id),'[]'::jsonb), count(*)
  INTO v_items, v_count FROM (
    SELECT id,codigo,nome,ativo FROM public.microrganismos
    WHERE (NOT p_only_active OR ativo IS TRUE)
      AND (v_search='' OR pg_catalog.strpos(pg_catalog.lower(nome),pg_catalog.lower(v_search))>0
        OR pg_catalog.strpos(pg_catalog.lower(COALESCE(codigo,'')),pg_catalog.lower(v_search))>0)
    ORDER BY nome, id LIMIT p_limit+1 OFFSET p_offset) m;
  -- has_more por sentinela (limit+1), itens cortados ao limite.
  RETURN pg_catalog.jsonb_build_object('items',
    CASE WHEN v_count>p_limit THEN v_items - p_limit ELSE v_items END,'has_more',v_count>p_limit);
END;
$function$
