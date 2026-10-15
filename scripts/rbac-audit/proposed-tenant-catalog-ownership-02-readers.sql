-- =====================================================================================
-- CANDIDATO 02/02 — NÃO APLICAR sem revisão independente. Requer 01 aplicado. Gate continua OFF.
-- Fecha explicitamente: leitores SA/plataforma, visibilidade (seleção), views privadas h7n e preço canônico.
-- "Antes" = definição real lida no canônico em 15/10/2026 (md5 de pg_get_functiondef fixado no preflight;
-- divergência aborta). "Depois" = corpo completo abaixo; diferença única e explícita marcada com
-- `-- [OWNER]`. Sem replace textual de corpos.
-- Fora deste recorte (próxima rodada): B2B, fiscal, produção/entrega, visita, regulatório, códigos, SA writers
-- (estes já são barrados estruturalmente para linhas privadas pelo trigger raiz/descendente do 01).
-- =====================================================================================

DO $$
DECLARE r record;
BEGIN
  IF to_regprocedure('platform_private.catalog_reader_org()') IS NULL THEN RAISE EXCEPTION 'readers_preflight_01_missing'; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('platform_private.platform_read_global_product_catalog_core(text,integer,integer)','473a099696d4ff02eaf59dda58e1b233'),
    ('platform_private.read_global_product_metadata_core(uuid)','5d5fc5eaa31508277cc646729fe82ac1'),
    ('platform_private.read_global_microorganisms_core(text,integer,integer,boolean)','9f63a20b604e8f023de51eaa6ff039d8'),
    ('platform_private.read_global_microorganism_detail_core(uuid)','6178944c94c9e9e1225e6c59224554ec'),
    ('platform_private.read_global_cultures_core(text,integer,integer)','3db0904a47ad8d829b4f1d49f284456c'),
    ('platform_private.read_global_culture_detail_core(uuid)','b0902a002109c6aacf797d7f32526acf'),
    ('platform_private.read_global_item_volumes_core(text,uuid,integer,integer)','6e2f7bfcd5020bc07ed35e781b6bfcfd'),
    ('platform_private.read_global_volume_detail_core(uuid)','382661e5fa912bb766f335b046a3d157'),
    ('platform_private.read_global_b2b_state_core(text,uuid)','9f514955bd5fa65a433547590e3c8536'),
    ('platform_private.read_global_product_catalog_by_family_core(text,text,text,integer,integer)','799a965509da4ec11ee3a85a8fea06c1'),
    ('platform_private.read_global_product_composition_core(uuid,integer,integer)','25422d890db3b5b205b0a11788e92279'),
    ('platform_private.catalog_tenant_selection_core(text,text,integer,integer,uuid[])','4bde839029b5c38d8cacadef823f7d4f'),
    ('private.h7n_catalogo_ficha_produtos()','8c335e3ce23229248d4f6a19f8eb61bd'),
    ('private.h7n_catalogo_ficha_microrganismos()','959d28c69af16dbeca4dbe4851c9ef38'),
    ('public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)','fa5e890dc647392efc238460ac16d6a2'),
    ('public.fn_catalogo_litro_canonico(uuid,uuid)','96242cdebadd271f0b60d60c444c3fb5')) v(fn, h) LOOP
    IF to_regprocedure(r.fn) IS NULL OR md5(pg_get_functiondef(to_regprocedure(r.fn))) <> r.h THEN
      RAISE EXCEPTION 'readers_preflight_definition_drift: %', r.fn; END IF;
  END LOOP;
END $$;

-- Escopo de item para preço/leitura não-SA: global, ou privado da empresa do ator.
CREATE FUNCTION platform_private.catalog_item_in_reader_scope(p_produto uuid, p_micro uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE
    WHEN p_produto IS NOT NULL THEN EXISTS (SELECT 1 FROM public.produtos p WHERE p.id=p_produto
           AND (p.owner_organization_id IS NULL OR p.owner_organization_id = platform_private.catalog_reader_org()))
    WHEN p_micro IS NOT NULL THEN EXISTS (SELECT 1 FROM public.microrganismos m WHERE m.id=p_micro
           AND (m.owner_organization_id IS NULL OR m.owner_organization_id = platform_private.catalog_reader_org()))
    ELSE false END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_item_in_reader_scope(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================ SA / plataforma: SOMENTE globais
CREATE OR REPLACE FUNCTION platform_private.platform_read_global_product_catalog_core(p_search text, p_limit integer, p_offset integer)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_search text;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'platform_catalog_forbidden';
  END IF;
  IF pg_catalog.jsonb_typeof(auth.jwt()->'iat') IS DISTINCT FROM 'number'
     OR COALESCE(auth.jwt()->>'iat', '') !~ '^[0-9]{1,12}$' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'platform_catalog_forbidden';
  END IF;
  IF (auth.jwt()->>'iat')::bigint <= 0
     OR NOT COALESCE(platform_private.platform_actor_access_ready(v_actor), false)
     OR NOT COALESCE(public.has_role(v_actor, 'superadmin'::public.app_role), false)
     OR NOT COALESCE(public.is_platform_superadmin(v_actor), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'platform_catalog_forbidden';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 1000000
     OR p_search IS NULL OR pg_catalog.char_length(p_search) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'platform_catalog_invalid_query';
  END IF;
  v_search := pg_catalog.lower(pg_catalog.btrim(p_search));
  WITH bounded AS MATERIALIZED (
    SELECT p.id, p.codigo, p.nome, p.tipo, p.ativo, p.b2b_enabled, p.updated_at
    FROM public.produtos p
    WHERE p.owner_organization_id IS NULL -- [OWNER]
      AND (v_search = ''
       OR pg_catalog.strpos(pg_catalog.lower(p.nome), v_search) > 0
       OR pg_catalog.strpos(pg_catalog.lower(COALESCE(p.codigo, '')), v_search) > 0)
    ORDER BY pg_catalog.lower(p.nome) COLLATE "C", p.id
    LIMIT (p_limit + 1) OFFSET p_offset
  ), page AS (
    SELECT b.id, b.codigo, b.nome, b.tipo, b.ativo, b.b2b_enabled, b.updated_at
    FROM bounded b
    ORDER BY pg_catalog.lower(b.nome) COLLATE "C", b.id LIMIT p_limit
  )
  SELECT pg_catalog.jsonb_build_object(
    'items', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)
      ORDER BY pg_catalog.lower(r.nome) COLLATE "C", r.id) FROM page r), '[]'::jsonb),
    'has_more', (SELECT pg_catalog.count(*) > p_limit FROM bounded)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION platform_private.read_global_product_metadata_core(p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  SELECT pg_catalog.jsonb_build_object('id',p.id,'updated_at',p.updated_at,'nome',p.nome,
    'descricao',p.descricao,'modo_acao',p.modo_acao,'funcao_completa',p.funcao_completa,'modo_aplicacao',p.modo_aplicacao)
  INTO v_result FROM public.produtos p WHERE p.id=p_id AND p.owner_organization_id IS NULL; -- [OWNER]
  IF v_result IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_metadata_unavailable'; END IF;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION platform_private.read_global_microorganisms_core(p_search text, p_limit integer, p_offset integer, p_only_active boolean)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
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
    WHERE owner_organization_id IS NULL -- [OWNER]
      AND (NOT p_only_active OR ativo IS TRUE)
      AND (v_search='' OR pg_catalog.strpos(pg_catalog.lower(nome),pg_catalog.lower(v_search))>0
        OR pg_catalog.strpos(pg_catalog.lower(COALESCE(codigo,'')),pg_catalog.lower(v_search))>0)
    ORDER BY nome, id LIMIT p_limit+1 OFFSET p_offset) m;
  RETURN pg_catalog.jsonb_build_object('items',
    CASE WHEN v_count>p_limit THEN v_items - p_limit ELSE v_items END,'has_more',v_count>p_limit);
END;
$function$;

CREATE OR REPLACE FUNCTION platform_private.read_global_microorganism_detail_core(p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  SELECT pg_catalog.jsonb_build_object('id',m.id,'codigo',m.codigo,'nome',m.nome,'tipo',m.tipo,'nome_cientifico',m.nome_cientifico,
    'concentracao_ufc_ml',m.concentracao_ufc_ml,'concentracao_label',m.concentracao_label,'fornecedor',m.fornecedor,
    'producao_on_farm',m.producao_on_farm,'meio_cultivo',m.meio_cultivo,'funcao_agronomica',m.funcao_agronomica,
    'observacoes',m.observacoes,'descricao',m.descricao,'ativo',m.ativo,'updated_at',m.updated_at)
  INTO v FROM public.microrganismos m WHERE m.id=p_id AND m.owner_organization_id IS NULL; -- [OWNER]
  IF v IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_entity_unavailable'; END IF;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION platform_private.read_global_cultures_core(p_search text, p_limit integer, p_offset integer)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_search text; v_items jsonb; v_count int;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000
    OR pg_catalog.char_length(COALESCE(p_search,'')) > 120 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  v_search:=pg_catalog.btrim(COALESCE(p_search,''));
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',c.id,'nome',c.nome,'ativo',c.ativo) ORDER BY c.nome,c.id),'[]'::jsonb), count(*)
  INTO v_items, v_count FROM (SELECT id,nome,ativo FROM public.culturas
    WHERE owner_organization_id IS NULL -- [OWNER]
      AND (v_search='' OR pg_catalog.strpos(pg_catalog.lower(nome),pg_catalog.lower(v_search))>0)
    ORDER BY nome,id LIMIT p_limit+1 OFFSET p_offset) c;
  RETURN pg_catalog.jsonb_build_object('items',CASE WHEN v_count>p_limit THEN v_items - p_limit ELSE v_items END,'has_more',v_count>p_limit);
END;
$function$;

CREATE OR REPLACE FUNCTION platform_private.read_global_culture_detail_core(p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  SELECT pg_catalog.jsonb_build_object('id',c.id,'nome',c.nome,'descricao',c.descricao,'ativo',c.ativo,'updated_at',c.updated_at,
    'desativada_em',c.desativada_em)
  INTO v FROM public.culturas c WHERE c.id=p_id AND c.owner_organization_id IS NULL; -- [OWNER]
  IF v IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_entity_unavailable'; END IF;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION platform_private.read_global_item_volumes_core(p_item_tipo text, p_item_id uuid, p_limit integer, p_offset integer)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_parent jsonb; v_items jsonb; v_more boolean;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  -- [OWNER] pai precisa ser global; privado responde como indisponível (sem oráculo).
  IF EXISTS (SELECT 1 FROM public.produtos p WHERE p_item_tipo='produto' AND p.id=p_item_id AND p.owner_organization_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.microrganismos m WHERE p_item_tipo='microrganismo' AND m.id=p_item_id AND m.owner_organization_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_volume_unavailable'; END IF;
  v_parent:=platform_private.catalog_volume_parent(p_item_tipo,p_item_id,false);
  WITH page AS (
    SELECT v.id, row_number() OVER (ORDER BY v.ordem, v.volume_ml, v.id) rn FROM public.catalogo_volumes v
     WHERE v.item_tipo=p_item_tipo AND COALESCE(v.produto_id,v.microrganismo_id)=p_item_id
       AND v.owner_organization_id IS NULL -- [OWNER]
     ORDER BY v.ordem, v.volume_ml, v.id LIMIT p_limit+1 OFFSET p_offset)
  SELECT COALESCE(pg_catalog.jsonb_agg(platform_private.catalog_volume_row(id) ORDER BY rn) FILTER (WHERE rn<=p_offset+p_limit),'[]'::jsonb),
         count(*)>p_limit
    INTO v_items, v_more FROM page;
  RETURN pg_catalog.jsonb_build_object('item',pg_catalog.jsonb_build_object('tipo',p_item_tipo,'id',p_item_id,'nome',v_parent->'nome',
      'codigo',v_parent->'codigo','ativo',v_parent->'ativo','pricing',platform_private.catalog_volume_pricing(v_parent) - 'updated_at'),
    'items',v_items,'has_more',v_more);
END;
$function$;

CREATE OR REPLACE FUNCTION platform_private.read_global_volume_detail_core(p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  IF EXISTS (SELECT 1 FROM public.catalogo_volumes cv WHERE cv.id=p_id AND cv.owner_organization_id IS NOT NULL) THEN -- [OWNER]
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_volume_unavailable'; END IF;
  v:=platform_private.catalog_volume_row(p_id);
  IF v IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_volume_unavailable'; END IF;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION platform_private.read_global_b2b_state_core(p_item_tipo text, p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_out jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_item_tipo IS NULL OR p_item_tipo NOT IN ('produto','microrganismo') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_b2b_invalid'; END IF;
  IF p_item_tipo='produto' THEN
    SELECT pg_catalog.jsonb_build_object('item_tipo','produto','id',p.id,'nome',p.nome,'codigo',p.codigo,
      'ativo',COALESCE(p.ativo,false),'b2b_enabled',p.b2b_enabled,'updated_at',p.updated_at)
      INTO v_out FROM public.produtos p WHERE p.id=p_id AND p.owner_organization_id IS NULL; -- [OWNER]
  ELSE
    SELECT pg_catalog.jsonb_build_object('item_tipo','microrganismo','id',m.id,'nome',m.nome,'codigo',m.codigo,
      'ativo',m.ativo,'b2b_enabled',m.b2b_enabled,'updated_at',m.updated_at)
      INTO v_out FROM public.microrganismos m WHERE m.id=p_id AND m.owner_organization_id IS NULL; -- [OWNER]
  END IF;
  IF v_out IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_b2b_unavailable'; END IF;
  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION platform_private.read_global_product_catalog_by_family_core(p_familia text, p_revisao text, p_search text, p_limit integer, p_offset integer)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
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
    WHERE p.owner_organization_id IS NULL -- [OWNER]
      AND ((p_revisao = 'familia' AND p.familia_catalogo IS NOT NULL AND p.familia_catalogo = p_familia)
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
$function$;

CREATE OR REPLACE FUNCTION platform_private.read_global_product_composition_core(p_produto_id uuid, p_limit integer, p_receita_offset integer)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_p public.produtos%ROWTYPE; v_result jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_produto_id IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50 OR p_receita_offset IS NULL OR p_receita_offset < 0 OR p_receita_offset > 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_invalid_query'; END IF;
  SELECT * INTO v_p FROM public.produtos WHERE id = p_produto_id AND owner_organization_id IS NULL; -- [OWNER]
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_composition_unavailable'; END IF;
  WITH rec AS MATERIALIZED (
    SELECT f.id AS formulacao_id, f.microrganismo_id, m.nome AS micro_nome, m.ativo AS micro_ativo, f.component_insumo_id,
           ip.nome AS insumo_nome, f.volume_ml, f.proporcao, f.concentracao, f.unidade, f.e_volume_fixo
    FROM public.formulacoes f JOIN public.microrganismos m ON m.id = f.microrganismo_id
    LEFT JOIN public.produtos ip ON ip.id = f.component_insumo_id
    WHERE f.produto_id = p_produto_id AND f.owner_organization_id IS NULL -- [OWNER]
    ORDER BY f.created_at, f.id LIMIT p_limit + 1 OFFSET p_receita_offset
  ), dec AS MATERIALIZED (
    SELECT d.id, d.ordem::int AS ordem, d.tipo_componente, d.microrganismo_id, m.nome AS micro_nome, m.ativo AS micro_ativo,
           d.componente_nome, d.quantidade, d.unidade, d.base, d.natureza
    FROM public.produto_composicao_declaracoes d LEFT JOIN public.microrganismos m ON m.id = d.microrganismo_id
    WHERE d.produto_id = p_produto_id ORDER BY d.ordem LIMIT 51
  )
  SELECT pg_catalog.jsonb_build_object(
    'produto', pg_catalog.jsonb_build_object('id',v_p.id,'nome',v_p.nome,'familia_catalogo',v_p.familia_catalogo,'updated_at',v_p.updated_at),
    'conjunto', (SELECT pg_catalog.jsonb_build_object('status',c.status,'updated_at',c.updated_at)
                  FROM public.produto_composicao_conjuntos c WHERE c.produto_id = p_produto_id),
    'receita', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)) FROM (SELECT * FROM rec LIMIT p_limit) r), '[]'::jsonb),
    'receita_offset', p_receita_offset,
    'declaracoes', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.ordem) FROM (SELECT * FROM dec LIMIT 50) x), '[]'::jsonb),
    'receita_has_more', (SELECT pg_catalog.count(*) > p_limit FROM rec),
    'declaracoes_has_more', (SELECT pg_catalog.count(*) > 50 FROM dec)) INTO v_result;
  RETURN v_result;
END;
$function$;

-- ============================================================ Visibilidade: seleção = global + próprios do ator
-- Ocultação só existe para globais (trigger do 01); próprios ativos e não arquivados são selecionáveis.
CREATE OR REPLACE FUNCTION platform_private.catalog_tenant_selection_core(p_entity_type text, p_search text, p_limit integer, p_offset integer, p_include_ids uuid[])
 RETURNS TABLE(id uuid, nome text, ativo boolean, hidden boolean, selectable boolean, in_page boolean, total bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_org uuid; v_q text := NULLIF(btrim(COALESCE(p_search,'')),'');
BEGIN
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('produto','microrganismo','cultura')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000
     OR (v_q IS NOT NULL AND char_length(v_q) > 80)
     OR (p_include_ids IS NOT NULL AND (cardinality(p_include_ids) > 50 OR array_position(p_include_ids, NULL) IS NOT NULL)) THEN
    RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
  v_org := platform_private.catalog_tenant_actor(CASE WHEN p_entity_type='cultura' THEN 'read_selection_cultura' ELSE 'read_catalog' END);
  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.nome::text AS nome, p.ativo FROM public.produtos p WHERE p_entity_type='produto'
      AND (p.owner_organization_id IS NULL OR (p.owner_organization_id = v_org AND p.archived_at IS NULL)) -- [OWNER]
    UNION ALL SELECT m.id, m.nome::text, m.ativo FROM public.microrganismos m WHERE p_entity_type='microrganismo'
      AND (m.owner_organization_id IS NULL OR (m.owner_organization_id = v_org AND m.archived_at IS NULL)) -- [OWNER]
    UNION ALL SELECT c.id, c.nome::text, c.ativo FROM public.culturas c WHERE p_entity_type='cultura'
      AND (c.owner_organization_id IS NULL OR (c.owner_organization_id = v_org AND c.archived_at IS NULL)) -- [OWNER]
  ), marked AS (
    SELECT b.*, COALESCE(v.hidden,false) AS hidden FROM base b
      LEFT JOIN public.catalog_tenant_visibility v ON v.organization_id=v_org AND v.entity_type=p_entity_type
       AND COALESCE(v.produto_id,v.microrganismo_id,v.cultura_id)=b.id
  ), page AS (
    SELECT m.*, count(*) OVER () AS total FROM marked m
     WHERE m.ativo IS TRUE AND m.hidden IS FALSE
       AND (v_q IS NULL OR m.nome ILIKE '%' || replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_') || '%')
     ORDER BY m.nome, m.id LIMIT p_limit OFFSET p_offset
  )
  SELECT pg.id, pg.nome, pg.ativo, pg.hidden, true, true, pg.total FROM page pg
  UNION ALL
  SELECT m.id, m.nome, m.ativo, m.hidden, (m.ativo IS TRUE AND m.hidden IS FALSE), false, NULL::bigint FROM marked m
   WHERE p_include_ids IS NOT NULL AND m.id = ANY(p_include_ids) AND m.id NOT IN (SELECT pg2.id FROM page pg2);
END; $function$;
-- Observação: include_ids de item ARQUIVADO próprio não retorna aqui; históricos continuam lidos por ID nas
-- telas (RLS RESTRICTIVE permite a própria empresa). catalog_tenant_hidden_ids_core/read_visibility_core só
-- leem a tabela de preferências (sem dados do catálogo) — inalterados.

-- ============================================================ Views privadas h7n: global + próprios do ator
CREATE OR REPLACE FUNCTION private.h7n_catalogo_ficha_produtos()
 RETURNS TABLE(id uuid, nome text, codigo text, tipo tipo_produto, descricao text, ativo boolean, valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric, dose_ml_ha numeric, preco_fonte text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select p.id, p.nome, p.codigo, p.tipo, p.descricao, p.ativo,
    coalesce(public.fn_catalogo_preco_canonico(p.id, null::uuid, 'dose'::text, null::numeric), p.valor_dose_brl),
    coalesce(public.fn_catalogo_preco_canonico(p.id, null::uuid, 'litro'::text, null::numeric), p.valor_litro_brl),
    coalesce(public.fn_catalogo_preco_canonico(p.id, null::uuid, 'hectare'::text, null::numeric), p.valor_ha_brl),
    p.dose_ml_ha,
    case when public.fn_catalogo_preco_canonico(p.id, null::uuid, 'litro'::text, null::numeric) is not null
      then 'catalogo_volumes'::text else 'legado_mestre'::text end
  from public.produtos p
  where p.ativo = true
    and (p.owner_organization_id is null or p.owner_organization_id = platform_private.catalog_reader_org()) -- [OWNER]
    and (
      public.can_view_catalog_internal(auth.uid())
      or (
        (
          not exists (select 1 from public.product_technical_profiles tp where tp.produto_id = p.id)
          or exists (
            select 1 from public.product_technical_profiles tp
            where tp.produto_id = p.id and tp.status_validacao = 'aprovado'::text
          )
        )
        and (
          not (
            public.has_role(auth.uid(), 'parceiro_b2b'::public.app_role)
            or public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::public.app_role)
          )
          or coalesce(p.b2b_enabled, false) = true
        )
      )
    );
$function$;

CREATE OR REPLACE FUNCTION private.h7n_catalogo_ficha_microrganismos()
 RETURNS TABLE(id uuid, nome text, nome_cientifico text, funcao_agronomica text, ativo boolean, valor_dose_brl numeric, valor_litro_brl numeric, dose_ml_ha numeric, preco_fonte text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  select m.id, m.nome, m.nome_cientifico, m.funcao_agronomica, m.ativo,
    coalesce(public.fn_catalogo_preco_canonico(null::uuid, m.id, 'dose'::text, null::numeric), m.valor_dose_brl),
    coalesce(public.fn_catalogo_preco_canonico(null::uuid, m.id, 'litro'::text, null::numeric), m.valor_litro_brl),
    m.dose_ml_ha,
    case when public.fn_catalogo_preco_canonico(null::uuid, m.id, 'litro'::text, null::numeric) is not null
      then 'catalogo_volumes'::text else 'legado_mestre'::text end
  from public.microrganismos m
  where m.ativo = true
    and (m.owner_organization_id is null or m.owner_organization_id = platform_private.catalog_reader_org()) -- [OWNER]
    and (
      public.can_view_catalog_internal(auth.uid())
      or (
        (
          not exists (select 1 from public.microorganism_technical_profiles tp where tp.microrganismo_id = m.id)
          or exists (
            select 1 from public.microorganism_technical_profiles tp
            where tp.microrganismo_id = m.id and tp.status_validacao = 'aprovado'::text
          )
        )
        and (
          not (
            public.has_role(auth.uid(), 'parceiro_b2b'::public.app_role)
            or public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::public.app_role)
          )
          or coalesce(m.b2b_enabled, false) = true
        )
      )
    );
$function$;

-- ============================================================ Preço canônico: sem oráculo de preço privado alheio
-- Item fora do escopo do ator (privado de outra empresa; para SA/anon, qualquer privado) => NULL, igual a "sem preço".
-- Limite conhecido: B2B do fornecedor recebe NULL para privados (fail-closed) até a rodada B2B.
CREATE OR REPLACE FUNCTION public.fn_catalogo_preco_canonico(p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric DEFAULT NULL::numeric)
 RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_litro   numeric(18,6);
  v_distint integer;
  v_dose_ha numeric;
  v_unit    numeric(18,6);
BEGIN
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 THEN RETURN NULL; END IF;
  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN RETURN NULL; END IF;
  IF NOT platform_private.catalog_item_in_reader_scope(p_product_id, p_microrganismo_id) THEN RETURN NULL; END IF; -- [OWNER]

  SELECT count(DISTINCT round(cv.preco_litro_brl,2)), min(round(cv.preco_litro_brl,2))
    INTO v_distint, v_litro
  FROM public.catalogo_volumes cv
  WHERE cv.ativo = true
    AND cv.preco_litro_brl IS NOT NULL
    AND cv.produto_id IS NOT DISTINCT FROM p_product_id
    AND cv.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id;

  IF COALESCE(v_distint,0) <> 1 OR COALESCE(v_litro,0) <= 0 THEN
    RETURN NULL;
  END IF;

  IF p_unit_type = 'unidade' THEN
    IF COALESCE(p_volume_ml,0) <= 0 THEN RETURN NULL; END IF;
    SELECT round(cv.preco_brl,2) INTO v_unit
    FROM public.catalogo_volumes cv
    WHERE cv.ativo = true
      AND cv.volume_ml = p_volume_ml
      AND cv.produto_id IS NOT DISTINCT FROM p_product_id
      AND cv.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
    ORDER BY cv.volume_ml
    LIMIT 1;
    RETURN COALESCE(v_unit, round(v_litro * (p_volume_ml / 1000.0), 2));
  END IF;

  IF p_unit_type = 'litro' THEN RETURN v_litro; END IF;
  IF p_unit_type = 'dose'  THEN RETURN round(v_litro / 10.0, 2); END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT pr.dose_ml_ha INTO v_dose_ha FROM public.produtos pr WHERE pr.id = p_product_id;
  ELSE
    SELECT mo.dose_ml_ha INTO v_dose_ha FROM public.microrganismos mo WHERE mo.id = p_microrganismo_id;
  END IF;
  IF COALESCE(v_dose_ha,0) <= 0 THEN RETURN NULL; END IF;
  RETURN round(v_litro * (v_dose_ha / 1000.0), 2);
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_catalogo_litro_canonico(p_produto_id uuid, p_microrganismo_id uuid, OUT litro numeric, OUT tiers integer)
 RETURNS record LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT min(round(cv.preco_litro_brl,2)),
         COALESCE(count(DISTINCT round(cv.preco_litro_brl,2)),0)::int
  FROM public.catalogo_volumes cv
  WHERE cv.ativo = true
    AND cv.preco_litro_brl IS NOT NULL
    AND cv.produto_id IS NOT DISTINCT FROM p_produto_id
    AND cv.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
    AND platform_private.catalog_item_in_reader_scope(p_produto_id, p_microrganismo_id); -- [OWNER]
$function$;

-- ACLs inalteradas por CREATE OR REPLACE (preservadas). Pós: só as 16 funções do manifesto (sem varrer pg_proc).
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'platform_private.platform_read_global_product_catalog_core(text,integer,integer)',
    'platform_private.read_global_product_metadata_core(uuid)',
    'platform_private.read_global_microorganisms_core(text,integer,integer,boolean)',
    'platform_private.read_global_microorganism_detail_core(uuid)',
    'platform_private.read_global_cultures_core(text,integer,integer)',
    'platform_private.read_global_culture_detail_core(uuid)',
    'platform_private.read_global_item_volumes_core(text,uuid,integer,integer)',
    'platform_private.read_global_volume_detail_core(uuid)',
    'platform_private.read_global_b2b_state_core(text,uuid)',
    'platform_private.read_global_product_catalog_by_family_core(text,text,text,integer,integer)',
    'platform_private.read_global_product_composition_core(uuid,integer,integer)',
    'platform_private.catalog_tenant_selection_core(text,text,integer,integer,uuid[])',
    'private.h7n_catalogo_ficha_produtos()',
    'private.h7n_catalogo_ficha_microrganismos()',
    'public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)',
    'public.fn_catalogo_litro_canonico(uuid,uuid)'] LOOP
    IF pg_get_functiondef(to_regprocedure(f)) NOT LIKE '%-- [OWNER]%' THEN
      RAISE EXCEPTION 'readers_post_marker_missing: %', f; END IF;
  END LOOP;
END $$;
