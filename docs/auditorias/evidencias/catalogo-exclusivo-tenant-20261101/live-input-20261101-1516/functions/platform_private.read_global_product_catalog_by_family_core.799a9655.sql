CREATE OR REPLACE FUNCTION platform_private.read_global_product_catalog_by_family_core(p_familia text, p_revisao text, p_search text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_search text; v_result jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_revisao IS NULL OR p_revisao NOT IN ('familia','todos','pendentes')
     OR (p_revisao = 'familia' AND (p_familia IS NULL OR p_familia NOT IN ('biologico','quimico','fertilizante_adubo')))
     OR (p_revisao <> 'familia' AND p_familia IS NOT NULL)
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 1000000
     OR p_search IS NULL OR pg_catalog.char_length(p_search) > 120 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='platform_catalog_invalid_query';
  END IF;
  v_search := pg_catalog.lower(pg_catalog.btrim(p_search));
  WITH bounded AS MATERIALIZED (
    SELECT p.id, p.codigo, p.nome, p.tipo, COALESCE(p.ativo,false) AS ativo, p.b2b_enabled, p.updated_at,
           p.familia_catalogo, p.classe_catalogo
    FROM public.produtos p
    WHERE ((p_revisao = 'familia' AND p.familia_catalogo IS NOT NULL AND p.familia_catalogo = p_familia)
        OR p_revisao = 'todos'
        OR (p_revisao = 'pendentes' AND p.familia_catalogo IS NULL))
      AND (v_search = ''
       OR pg_catalog.strpos(pg_catalog.lower(p.nome), v_search) > 0
       OR pg_catalog.strpos(pg_catalog.lower(COALESCE(p.codigo, '')), v_search) > 0)
    ORDER BY (p.familia_catalogo IS NULL) DESC, pg_catalog.lower(p.nome) COLLATE "C", p.id
    LIMIT (p_limit + 1) OFFSET p_offset
  ), page AS (
    SELECT * FROM bounded b ORDER BY (b.familia_catalogo IS NULL) DESC, pg_catalog.lower(b.nome) COLLATE "C", b.id LIMIT p_limit
  )
  SELECT pg_catalog.jsonb_build_object(
    'items', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)
      ORDER BY (r.familia_catalogo IS NULL) DESC, pg_catalog.lower(r.nome) COLLATE "C", r.id) FROM page r), '[]'::jsonb),
    'has_more', (SELECT pg_catalog.count(*) > p_limit FROM bounded)
  ) INTO v_result;
  RETURN v_result;
END;
$function$
