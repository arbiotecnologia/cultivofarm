-- CANDIDATO 12 — NÃO APLICAR. Após 01–06/08–11; independente de 07.
-- Recomendação comercial != fabricação. Sem filtro de família ou alteração dos IDs históricos.
BEGIN;
DO $$ BEGIN
 IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership12_gate_must_remain_off'; END IF;
 IF md5(pg_get_functiondef('public.rpc_upsert_recomendacao_visita(uuid,uuid,jsonb,integer)'::regprocedure)) <> '42f87a90cb7d1be324b43bb3867b3a28' THEN
  RAISE EXCEPTION 'ownership12_upsert_drift'; END IF;
END $$;

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
   WHERE p_entity_type='produto' AND p.owner_organization_id IS NULL
  UNION ALL SELECT m.id,m.nome::text,'microrganismo'::text,m.ativo FROM public.microrganismos m
   WHERE p_entity_type='microrganismo' AND m.owner_organization_id IS NULL
 ), marked AS (
  SELECT b.*, b.ativo IS TRUE AND NOT EXISTS(SELECT 1 FROM public.catalog_tenant_visibility v
   WHERE v.organization_id=v_org AND v.entity_type=p_entity_type AND v.hidden
    AND COALESCE(v.produto_id,v.microrganismo_id)=b.id) AS eligible FROM base b
 ), page AS (
  SELECT m.*,count(*) OVER() AS total FROM marked m WHERE m.eligible
   AND (v_q IS NULL OR m.nome ILIKE '%'||replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_')||'%')
   ORDER BY m.nome,m.id LIMIT p_limit OFFSET p_offset
 ) SELECT p.id,p.nome,p.familia_catalogo,p.eligible,true,p.total FROM page p
 UNION ALL SELECT m.id,m.nome,m.familia_catalogo,false,false,NULL::bigint FROM marked m
  WHERE m.id=ANY(p_include_ids) AND NOT EXISTS(SELECT 1 FROM page p WHERE p.id=m.id);
END $$;
REVOKE ALL ON FUNCTION public.tenant_catalog_visit_selection_page(uuid,text,text,integer,integer,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_visit_selection_page(uuid,text,text,integer,integer,uuid[]) TO authenticated;

-- Defense in depth at write, including direct writers: existing unmodified historical refs survive.
CREATE OR REPLACE FUNCTION platform_private.catalog_visit_recommendation_reference_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_id uuid; v_col text; v_ok boolean;
BEGIN
 v_org:=platform_private.catalog_tenant_actor('read_prefs');
 PERFORM public._assert_visita_editavel(NEW.registro_consultor_id);
 FOR v_col IN SELECT unnest(ARRAY['produto_biologico_sugerido_id','microrganismo_id']) LOOP
  IF TG_OP='UPDATE' AND NEW.registro_consultor_id=OLD.registro_consultor_id
   AND to_jsonb(NEW)->>v_col IS NOT DISTINCT FROM to_jsonb(OLD)->>v_col THEN CONTINUE; END IF;
  v_id:=NULLIF(to_jsonb(NEW)->>v_col,'')::uuid;
  IF v_id IS NULL THEN CONTINUE; END IF;
  IF v_col='microrganismo_id' THEN
   SELECT EXISTS(SELECT 1 FROM public.microrganismos m WHERE m.id=v_id AND m.ativo AND m.owner_organization_id IS NULL) INTO v_ok;
  ELSE
   SELECT EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=v_id AND p.ativo AND p.owner_organization_id IS NULL) INTO v_ok;
  END IF;
  IF NOT v_ok OR EXISTS(SELECT 1 FROM public.catalog_tenant_visibility v WHERE v.organization_id=v_org
   AND v.entity_type=CASE WHEN v_col='microrganismo_id' THEN 'microrganismo' ELSE 'produto' END
   AND COALESCE(v.produto_id,v.microrganismo_id)=v_id AND v.hidden) THEN
   RAISE EXCEPTION 'catalog_visit_item_unavailable' USING ERRCODE='42501'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_visit_recommendation_reference_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_catalog_visit_reference_guard ON public.registros_consultor_recomendacoes;
CREATE TRIGGER trg_catalog_visit_reference_guard BEFORE INSERT OR UPDATE ON public.registros_consultor_recomendacoes
 FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_visit_recommendation_reference_guard();
COMMIT;