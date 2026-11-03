CREATE OR REPLACE FUNCTION public.tenant_catalog_visit_selection_page(p_registro_id uuid, p_entity_type text, p_search text, p_limit integer, p_offset integer, p_include_ids uuid[])
 RETURNS TABLE(id uuid, nome text, familia_catalogo text, selectable boolean, in_page boolean, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$
