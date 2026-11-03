CREATE OR REPLACE FUNCTION platform_private.catalog_visit_reference_guard_current12()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$
