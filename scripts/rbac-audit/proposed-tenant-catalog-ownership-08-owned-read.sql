-- CANDIDATO 08: leitura própria para as abas existentes. NÃO APLICADO / NÃO PUBLICAR.
-- Aplicar somente após 01–06 revisados; gate continua OFF. Sem DML/grants de tabelas.
-- Leitura permanece disponível após rollback operacional; escrita depende do gate independente.
BEGIN;
DO $$ BEGIN
  IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership08_gate_must_remain_off'; END IF;
END $$;

CREATE OR REPLACE FUNCTION platform_private.catalog_owned_list_core(
  p_entity_type text,p_search text,p_limit integer,p_offset integer,p_include_archived boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_table text; v_items jsonb; v_n integer; v_q text;
BEGIN
  IF (p_entity_type IN ('produto','microrganismo','cultura')) IS NOT TRUE
    OR (p_limit BETWEEN 1 AND 50) IS NOT TRUE OR (p_offset BETWEEN 0 AND 100000) IS NOT TRUE
    OR p_include_archived IS NULL OR char_length(COALESCE(p_search,''))>120 THEN
    RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
  v_org:=platform_private.catalog_tenant_actor('read_catalog');
  v_q:=COALESCE(platform_private.catalog_norm_name(p_search),'');
  v_table:=CASE p_entity_type WHEN 'produto' THEN 'produtos' WHEN 'microrganismo' THEN 'microrganismos' ELSE 'culturas' END;
  -- Root inteira somente da empresa derivada: mesmas colunas já permitidas na leitura de gestão.
  -- O filtro está no DEFINER, não depende de RLS nem de tenant enviado pelo cliente.
  EXECUTE format('SELECT COALESCE(jsonb_agg(row_data ORDER BY nome,id),''[]''::jsonb),count(*)
    FROM (SELECT id,nome,to_jsonb(t.*)||jsonb_build_object(''origin'',''proprio'') AS row_data
      FROM public.%I t WHERE owner_organization_id=$1 AND ($2 OR archived_at IS NULL)
        AND ($3='''' OR strpos(platform_private.catalog_norm_name(nome),$3)>0)
      ORDER BY nome,id LIMIT $4+1 OFFSET $5) s',v_table)
    INTO v_items,v_n USING v_org,p_include_archived,v_q,p_limit,p_offset;
  RETURN jsonb_build_object('items',CASE WHEN v_n>p_limit THEN v_items-p_limit ELSE v_items END,'has_more',v_n>p_limit);
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_owned_list_core(text,text,integer,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.catalog_owned_list_core(text,text,integer,integer,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.tenant_catalog_owned_list(text,text,integer,integer,boolean) FROM PUBLIC,anon,service_role;

CREATE OR REPLACE FUNCTION platform_private.catalog_owned_detail_core(
  p_entity_type text,p_entity_id uuid,p_limit integer,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_table text; v_item jsonb; v_composition jsonb; v_declarations jsonb:='[]'; v_presentations jsonb:='[]';
BEGIN
  IF (p_entity_type IN ('produto','microrganismo','cultura')) IS NOT TRUE OR p_entity_id IS NULL
    OR (p_limit BETWEEN 1 AND 50) IS NOT TRUE OR (p_offset BETWEEN 0 AND 100000) IS NOT TRUE THEN
    RAISE EXCEPTION 'catalog_owned_invalid_payload' USING ERRCODE='22023'; END IF;
  v_org:=platform_private.catalog_tenant_actor('read_catalog');
  v_table:=CASE p_entity_type WHEN 'produto' THEN 'produtos' WHEN 'microrganismo' THEN 'microrganismos' ELSE 'culturas' END;
  EXECUTE format('SELECT to_jsonb(t.*)||jsonb_build_object(''origin'',''proprio'') FROM public.%I t
    WHERE id=$1 AND owner_organization_id=$2',v_table) INTO v_item USING p_entity_id,v_org;
  IF v_item IS NULL THEN RAISE EXCEPTION 'catalog_owned_not_found' USING ERRCODE='P0002'; END IF;
  IF p_entity_type='produto' THEN
    SELECT jsonb_build_object('status',c.status) INTO v_composition FROM public.produto_composicao_conjuntos c
      JOIN public.produtos p ON p.id=c.produto_id WHERE c.produto_id=p_entity_id AND p.owner_organization_id=v_org;
    SELECT COALESCE(jsonb_agg(to_jsonb(d.*) ORDER BY d.ordem,d.id),'[]') INTO v_declarations
      FROM public.produto_composicao_declaracoes d JOIN public.produtos p ON p.id=d.produto_id
      WHERE d.produto_id=p_entity_id AND p.owner_organization_id=v_org;
    -- Declarações limitadas a 50 pelo contrato de composição. Não converter/inferir formulacoes.
    v_item:=v_item||jsonb_build_object('composition_status',v_composition->>'status','declarations',v_declarations);
  END IF;
  IF p_entity_type IN ('produto','microrganismo') THEN
    SELECT COALESCE(jsonb_agg(row_data ORDER BY ordem,volume_ml,id),'[]') INTO v_presentations
      FROM (SELECT v.id,v.ordem,v.volume_ml,to_jsonb(v.*) AS row_data FROM public.catalogo_volumes v
        WHERE v.owner_organization_id=v_org
          AND ((p_entity_type='produto' AND v.produto_id=p_entity_id)
            OR (p_entity_type='microrganismo' AND v.microrganismo_id=p_entity_id))
        ORDER BY v.ordem,v.volume_ml,v.id LIMIT p_limit+1 OFFSET p_offset) s;
  END IF;
  RETURN jsonb_build_object('item',v_item,'presentations',
    CASE WHEN jsonb_array_length(v_presentations)>p_limit THEN v_presentations-p_limit ELSE v_presentations END,
    'has_more',jsonb_array_length(v_presentations)>p_limit);
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_owned_detail_core(text,uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.catalog_owned_detail_core(text,uuid,integer,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.tenant_catalog_owned_detail(
  p_entity_type text,p_entity_id uuid,p_limit integer,p_offset integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT platform_private.catalog_owned_detail_core(p_entity_type,p_entity_id,p_limit,p_offset) $$;
REVOKE ALL ON FUNCTION public.tenant_catalog_owned_detail(text,uuid,integer,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_owned_detail(text,uuid,integer,integer) TO authenticated;
DO $$ BEGIN
  IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership08_gate_must_remain_off'; END IF;
END $$;
COMMIT;