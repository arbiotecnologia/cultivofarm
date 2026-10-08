CREATE OR REPLACE FUNCTION public.storage1_path_strict(p_name text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT p_name IS NOT NULL AND length(p_name) BETWEEN 1 AND 1024 AND p_name !~ '(^/|/$|//|\\|%|[[:cntrl:]])' AND p_name !~ '(^|/)\.{1,2}(/|$)'; $$;
REVOKE ALL ON FUNCTION public.storage1_path_strict(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.storage1_path_strict(text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.storage1_delivery_allowed(p_name text,p_action text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_id uuid; v_e public.entregas%ROWTYPE; v_client_org uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.storage1_path_strict(p_name) OR p_action NOT IN ('select','insert','update','delete') THEN RETURN false; END IF;
 v_org:=public.h15_actor_organization(); IF v_org IS NULL THEN RETURN false; END IF;
 IF p_name !~ '^entregas/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/([A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+$' THEN RETURN false; END IF;
 v_id:=split_part(p_name,'/',2)::uuid;
 SELECT * INTO v_e FROM public.entregas WHERE id=v_id;
 IF NOT FOUND OR v_e.organization_id IS DISTINCT FROM v_org OR v_e.cliente_id IS NULL THEN RETURN false; END IF;
 SELECT organization_id INTO v_client_org FROM public.clientes WHERE id=v_e.cliente_id;
 IF v_client_org IS DISTINCT FROM v_org THEN RETURN false; END IF;
 IF p_action='select' THEN RETURN public.is_delivery_staff(auth.uid()) OR public.is_financial_staff(auth.uid()) OR (public.has_role(auth.uid(),'cliente_produtor') AND v_e.cliente_id=ANY(public.get_cliente_ids_for_user(auth.uid()))); END IF;
 RETURN public.is_delivery_staff(auth.uid()) AND v_e.status::text IN ('separado','em_rota');
END; $$;
REVOKE ALL ON FUNCTION public.storage1_delivery_allowed(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.storage1_delivery_allowed(text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.storage1_application_allowed(p_name text,p_action text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_client uuid; v_app uuid; v_a public.aplicacoes%ROWTYPE; v_os_client uuid; v_os_org uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.storage1_path_strict(p_name) OR p_action NOT IN ('select','insert','update','delete') THEN RETURN false; END IF;
 v_org:=public.h15_actor_organization(); IF v_org IS NULL THEN RETURN false; END IF;
 IF p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_.-]+$' THEN RETURN false; END IF;
 BEGIN v_client:=split_part(p_name,'/',1)::uuid; v_app:=split_part(p_name,'/',2)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 SELECT * INTO v_a FROM public.aplicacoes WHERE id=v_app;
 IF NOT FOUND OR v_a.organization_id IS DISTINCT FROM v_org OR (v_a.ordem_servico_id IS NULL)=(v_a.ordem_servico_onfarm_id IS NULL) THEN RETURN false; END IF;
 IF v_a.ordem_servico_id IS NOT NULL THEN SELECT os.cliente_id,os.organization_id INTO v_os_client,v_os_org FROM public.ordens_servico os WHERE os.id=v_a.ordem_servico_id;
 ELSE SELECT os.cliente_id,c.organization_id INTO v_os_client,v_os_org FROM public.ordens_servico_onfarm os JOIN public.clientes c ON c.id=os.cliente_id WHERE os.id=v_a.ordem_servico_onfarm_id; END IF;
 IF v_os_client IS DISTINCT FROM v_client OR v_os_org IS DISTINCT FROM v_org OR NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=v_client AND c.organization_id=v_org) THEN RETURN false; END IF;
 IF p_action='select' THEN RETURN public.can_user_access_aplicacao(v_app); END IF;
 RETURN v_a.is_latest IS TRUE AND public.can_user_manage_aplicacao(v_app);
END; $$;
REVOKE ALL ON FUNCTION public.storage1_application_allowed(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.storage1_application_allowed(text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.storage1_consultor_allowed(p_name text,p_action text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_id uuid; v_client uuid; v_status text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.storage1_path_strict(p_name) OR p_action NOT IN ('select','insert','update','delete') THEN RETURN false; END IF;
 v_org:=public.h15_actor_organization(); IF v_org IS NULL THEN RETURN false; END IF;
 IF p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(foto|audio|documento)/[A-Za-z0-9_.-]+$' OR split_part(p_name,'/',1)<>v_org::text THEN RETURN false; END IF;
 BEGIN v_id:=split_part(p_name,'/',2)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 SELECT r.cliente_id,r.status::text INTO v_client,v_status FROM public.registros_consultor r JOIN public.clientes c ON c.id=r.cliente_id AND c.organization_id=v_org WHERE r.id=v_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_action='select' THEN RETURN (public.has_role(auth.uid(),'cliente_produtor') AND v_client=ANY(public.get_cliente_ids_for_user(auth.uid()))) OR ((public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'consultor_tecnico') OR public.has_role(auth.uid(),'tecnico_agronomo') OR public.has_role(auth.uid(),'aplicador')) AND public.can_view_technical_visit(auth.uid(),v_id)); END IF;
 RETURN v_status IN ('rascunho','em_andamento') AND (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'consultor_tecnico') OR public.has_role(auth.uid(),'tecnico_agronomo') OR public.has_role(auth.uid(),'aplicador')) AND public.can_manage_technical_visit(auth.uid(),v_id);
END; $$;
REVOKE ALL ON FUNCTION public.storage1_consultor_allowed(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.storage1_consultor_allowed(text,text) TO authenticated,service_role;

DROP POLICY IF EXISTS storage1_read ON storage.objects;
CREATE POLICY storage1_read ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING (CASE bucket_id WHEN 'entrega-documentos' THEN public.storage1_delivery_allowed(name,'select') WHEN 'aplicacao-evidencias' THEN public.storage1_application_allowed(name,'select') WHEN 'consultor-arquivos' THEN public.storage1_consultor_allowed(name,'select') ELSE true END);
DROP POLICY IF EXISTS storage1_insert ON storage.objects;
CREATE POLICY storage1_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK (CASE bucket_id WHEN 'entrega-documentos' THEN public.storage1_delivery_allowed(name,'insert') WHEN 'aplicacao-evidencias' THEN public.storage1_application_allowed(name,'insert') WHEN 'consultor-arquivos' THEN public.storage1_consultor_allowed(name,'insert') ELSE true END);
DROP POLICY IF EXISTS storage1_delete ON storage.objects;
CREATE POLICY storage1_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING (CASE bucket_id WHEN 'entrega-documentos' THEN public.storage1_delivery_allowed(name,'delete') WHEN 'aplicacao-evidencias' THEN public.storage1_application_allowed(name,'delete') WHEN 'consultor-arquivos' THEN public.storage1_consultor_allowed(name,'delete') ELSE true END);
DROP POLICY IF EXISTS storage1_update ON storage.objects;
CREATE POLICY storage1_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING (CASE bucket_id WHEN 'entrega-documentos' THEN public.storage1_delivery_allowed(name,'update') WHEN 'aplicacao-evidencias' THEN public.storage1_application_allowed(name,'update') WHEN 'consultor-arquivos' THEN public.storage1_consultor_allowed(name,'update') ELSE true END) WITH CHECK (CASE bucket_id WHEN 'entrega-documentos' THEN public.storage1_delivery_allowed(name,'update') WHEN 'aplicacao-evidencias' THEN public.storage1_application_allowed(name,'update') WHEN 'consultor-arquivos' THEN public.storage1_consultor_allowed(name,'update') ELSE true END);
-- Existing permissive policies retained: restrictions intersect them; no owner-based exception.
