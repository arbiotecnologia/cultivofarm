-- HOTFIX SQL12 AUTÔNOMO — CANDIDATO NÃO APLICADO. Sem dependência ownership01–13/lab07.
-- Destino exclusivo swzpzcwiasxmjutrmvkm; sem alteração de Auth/dados/RLS/ACL das tabelas.
-- Preflight fail-closed: schema atual, hashes live 2026-10-15 e ausência das novas entradas.
BEGIN;
DO $preflight$
DECLARE v record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm')
 OR EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm') THEN
  RAISE EXCEPTION 'CATALOG12_CANONICAL_REF_REQUIRED'; END IF;
 FOR v IN SELECT * FROM (VALUES
 ('platform_private.catalog_tenant_actor(text)','5e0ce9cc9122f1c21d76e29a13de8b59'),
 ('public.can_view_technical_visit(uuid,uuid)','e15341289ee33e1912adf63d4076b620'),
 ('public._assert_visita_editavel(uuid)','0ba13111bddb095f943233f9a84f25fc'),
 ('public.rpc_upsert_recomendacao_visita(uuid,uuid,jsonb,integer)','42f87a90cb7d1be324b43bb3867b3a28'),
 ('public.enforce_technical_content_editable()','eb4e8d56cde229056c4730f9742a8f4b')
 ) x(signature,hash) LOOP
  IF to_regprocedure(v.signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(v.signature))) IS DISTINCT FROM v.hash THEN
   RAISE EXCEPTION 'CATALOG12_HASH_DRIFT: %',v.signature; END IF;
 END LOOP;
 FOR v IN SELECT * FROM (VALUES
 ('produtos','id','uuid'),('produtos','nome','text'),('produtos','ativo','boolean'),('produtos','familia_catalogo','text'),
 ('microrganismos','id','uuid'),('microrganismos','nome','text'),('microrganismos','ativo','boolean'),
 ('catalog_tenant_visibility','organization_id','uuid'),('catalog_tenant_visibility','entity_type','text'),
 ('catalog_tenant_visibility','produto_id','uuid'),('catalog_tenant_visibility','microrganismo_id','uuid'),('catalog_tenant_visibility','hidden','boolean'),
 ('registros_consultor','id','uuid'),('registros_consultor_recomendacoes','registro_consultor_id','uuid'),
 ('registros_consultor_recomendacoes','produto_biologico_sugerido_id','uuid'),('registros_consultor_recomendacoes','microrganismo_id','uuid')
 ) x(tbl,col,typ) LOOP
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v.tbl AND column_name=v.col AND data_type=v.typ) THEN
   RAISE EXCEPTION 'CATALOG12_SCHEMA_DRIFT: %.%',v.tbl,v.col; END IF;
 END LOOP;
 IF to_regprocedure('public.tenant_catalog_visit_selection_page(uuid,text,text,integer,integer,uuid[])') IS NOT NULL
 OR to_regprocedure('platform_private.catalog_visit_reference_guard_current12()') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.registros_consultor_recomendacoes'::regclass AND tgname='trg_catalog_visit_reference_guard_current12') THEN
  RAISE EXCEPTION 'CATALOG12_ALREADY_PRESENT_REVIEW_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.registros_consultor_recomendacoes'::regclass
  AND tgname='technical_content_editable' AND tgfoid='public.enforce_technical_content_editable()'::regprocedure AND tgenabled='O') THEN
  RAISE EXCEPTION 'CATALOG12_EDIT_FENCE_REQUIRED'; END IF;
 IF has_function_privilege('anon','public.rpc_upsert_recomendacao_visita(uuid,uuid,jsonb,integer)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.rpc_upsert_recomendacao_visita(uuid,uuid,jsonb,integer)','EXECUTE') THEN
  RAISE EXCEPTION 'CATALOG12_UPSERT_ACL_DRIFT'; END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.tenant_catalog_visit_selection_page(
 p_registro_id uuid,p_entity_type text,p_search text,p_limit integer,p_offset integer,p_include_ids uuid[]
) RETURNS TABLE(id uuid,nome text,familia_catalogo text,selectable boolean,in_page boolean,total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_q text:=NULLIF(btrim(p_search),'');
BEGIN
 v_org:=platform_private.catalog_tenant_actor('read_prefs');
 IF NOT COALESCE(public.can_view_technical_visit(auth.uid(),p_registro_id),false) THEN
  RAISE EXCEPTION 'sem_permissao' USING ERRCODE='42501'; END IF;
 IF p_entity_type IS NULL OR p_entity_type NOT IN ('produto','microrganismo')
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000
 OR char_length(v_q)>80 OR cardinality(p_include_ids)>50 OR array_position(p_include_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH base AS (
  SELECT p.id,p.nome::text,p.familia_catalogo::text,p.ativo FROM public.produtos p
   WHERE p_entity_type='produto' AND to_jsonb(p)->>'owner_organization_id' IS NULL
  UNION ALL SELECT m.id,m.nome::text,'microrganismo'::text,m.ativo FROM public.microrganismos m
   WHERE p_entity_type='microrganismo' AND to_jsonb(m)->>'owner_organization_id' IS NULL
 ), marked AS (
  SELECT b.*, b.ativo IS TRUE AND NOT EXISTS(SELECT 1 FROM public.catalog_tenant_visibility v
   WHERE v.organization_id=v_org AND v.entity_type=p_entity_type AND v.hidden
    AND COALESCE(v.produto_id,v.microrganismo_id)=b.id) AS eligible FROM base b
 ), page AS (
  SELECT m.*,count(*) OVER() AS total FROM marked m WHERE m.eligible
   AND (v_q IS NULL OR m.nome ILIKE '%'||replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_')||'%')
   ORDER BY m.nome,m.id LIMIT p_limit OFFSET p_offset
 ) SELECT p.id,p.nome,p.familia_catalogo,p.eligible,true,p.total FROM page p
 UNION ALL SELECT m.id,m.nome,m.familia_catalogo,m.eligible,false,NULL::bigint FROM marked m
  WHERE m.id=ANY(p_include_ids) AND NOT EXISTS(SELECT 1 FROM page p WHERE p.id=m.id)
    AND EXISTS(SELECT 1 FROM public.registros_consultor_recomendacoes r WHERE r.registro_consultor_id=p_registro_id
      AND CASE WHEN p_entity_type='produto' THEN r.produto_biologico_sugerido_id ELSE r.microrganismo_id END=m.id);
END $$;
REVOKE ALL ON FUNCTION public.tenant_catalog_visit_selection_page(uuid,text,text,integer,integer,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_visit_selection_page(uuid,text,text,integer,integer,uuid[]) TO authenticated;

-- Defense in depth at write, including direct writers: existing unmodified historical refs survive.
CREATE OR REPLACE FUNCTION platform_private.catalog_visit_reference_guard_current12()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_id uuid; v_col text; v_ok boolean;
BEGIN
 v_org:=platform_private.catalog_tenant_actor('read_prefs');
 IF NOT COALESCE(public.can_view_technical_visit(auth.uid(),NEW.registro_consultor_id),false) THEN
  RAISE EXCEPTION 'sem_permissao' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND OLD.registro_consultor_id IS DISTINCT FROM NEW.registro_consultor_id
  AND NOT COALESCE(public.can_view_technical_visit(auth.uid(),OLD.registro_consultor_id),false) THEN
  RAISE EXCEPTION 'sem_permissao' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.registros_consultor WHERE id=NEW.registro_consultor_id FOR UPDATE;
 IF NOT COALESCE(public.can_view_technical_visit(auth.uid(),NEW.registro_consultor_id),false) THEN
  RAISE EXCEPTION 'sem_permissao' USING ERRCODE='42501'; END IF;
 PERFORM public._assert_visita_editavel(NEW.registro_consultor_id);
 FOR v_col IN SELECT unnest(ARRAY['produto_biologico_sugerido_id','microrganismo_id']) LOOP
  IF TG_OP='UPDATE' AND NEW.registro_consultor_id=OLD.registro_consultor_id
   AND to_jsonb(NEW)->>v_col IS NOT DISTINCT FROM to_jsonb(OLD)->>v_col THEN CONTINUE; END IF;
  v_id:=NULLIF(to_jsonb(NEW)->>v_col,'')::uuid;
  IF v_id IS NULL THEN CONTINUE; END IF;
  IF v_col='microrganismo_id' THEN
   SELECT EXISTS(SELECT 1 FROM public.microrganismos m WHERE m.id=v_id AND m.ativo AND to_jsonb(m)->>'owner_organization_id' IS NULL) INTO v_ok;
  ELSE
   SELECT EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=v_id AND p.ativo AND to_jsonb(p)->>'owner_organization_id' IS NULL) INTO v_ok;
  END IF;
  IF NOT v_ok OR EXISTS(SELECT 1 FROM public.catalog_tenant_visibility v WHERE v.organization_id=v_org
   AND v.entity_type=CASE WHEN v_col='microrganismo_id' THEN 'microrganismo' ELSE 'produto' END
   AND COALESCE(v.produto_id,v.microrganismo_id)=v_id AND v.hidden) THEN
   RAISE EXCEPTION 'catalog_visit_item_unavailable' USING ERRCODE='42501'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_visit_reference_guard_current12() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_catalog_visit_reference_guard_current12 BEFORE INSERT OR UPDATE ON public.registros_consultor_recomendacoes
 FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_visit_reference_guard_current12();

-- Postflight: entradas novas fechadas para anon/PUBLIC; nenhuma ACL existente alterada.
DO $postflight$
BEGIN
 IF has_function_privilege('anon','public.tenant_catalog_visit_selection_page(uuid,text,text,integer,integer,uuid[])','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.tenant_catalog_visit_selection_page(uuid,text,text,integer,integer,uuid[])','EXECUTE')
 OR has_function_privilege('authenticated','platform_private.catalog_visit_reference_guard_current12()','EXECUTE') THEN
  RAISE EXCEPTION 'CATALOG12_POSTFLIGHT_ACL_FAILED'; END IF;
END $postflight$;

COMMIT;
