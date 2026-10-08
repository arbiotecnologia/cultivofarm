CREATE OR REPLACE FUNCTION platform_private.storage1_delivery_allowed(p_name text,p_action text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_id uuid; v_e public.entregas%ROWTYPE; v_client_org uuid; v_staff boolean;
BEGIN
 IF auth.uid() IS NULL OR p_action IS NULL OR NOT public.storage1_path_strict(p_name) OR p_action NOT IN ('select','insert','update','delete') THEN RETURN false; END IF;
 v_org:=public.h15_actor_organization(); IF v_org IS NULL THEN RETURN false; END IF;
 IF p_name !~ '^entregas/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/([A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+$' THEN RETURN false; END IF;
 v_id:=split_part(p_name,'/',2)::uuid;
 SELECT * INTO v_e FROM public.entregas WHERE id=v_id;
 IF NOT FOUND OR v_e.organization_id IS DISTINCT FROM v_org OR v_e.cliente_id IS NULL THEN RETURN false; END IF;
 SELECT organization_id INTO v_client_org FROM public.clientes WHERE id=v_e.cliente_id;
 IF v_client_org IS DISTINCT FROM v_org THEN RETURN false; END IF;
 v_staff:=public.is_delivery_staff(auth.uid()) AND (NOT public.has_role(auth.uid(),'aplicador') OR public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'administrativo') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'operador_onfarm') OR v_e.cliente_id=ANY(public.get_cliente_ids_for_user(auth.uid())));
 IF p_action='select' THEN RETURN v_staff OR public.is_financial_staff(auth.uid()) OR (public.has_role(auth.uid(),'cliente_produtor') AND v_e.cliente_id=ANY(public.get_cliente_ids_for_user(auth.uid()))); END IF;
 RETURN v_staff AND v_e.status::text IN ('separado','em_rota');
END; $$;
CREATE OR REPLACE FUNCTION platform_private.storage1_application_allowed(p_name text,p_action text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_client uuid; v_app uuid; v_a public.aplicacoes%ROWTYPE; v_os_client uuid; v_os_org uuid; v_staff boolean;
BEGIN
 IF auth.uid() IS NULL OR p_action IS NULL OR NOT public.storage1_path_strict(p_name) OR p_action NOT IN ('select','insert','update','delete') THEN RETURN false; END IF;
 v_org:=public.h15_actor_organization(); IF v_org IS NULL THEN RETURN false; END IF;
 IF p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_.-]+$' THEN RETURN false; END IF;
 BEGIN v_client:=split_part(p_name,'/',1)::uuid; v_app:=split_part(p_name,'/',2)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 SELECT * INTO v_a FROM public.aplicacoes WHERE id=v_app;
 IF NOT FOUND OR v_a.organization_id IS DISTINCT FROM v_org OR (v_a.ordem_servico_id IS NULL)=(v_a.ordem_servico_onfarm_id IS NULL) THEN RETURN false; END IF;
 IF v_a.ordem_servico_id IS NOT NULL THEN SELECT os.cliente_id,os.organization_id INTO v_os_client,v_os_org FROM public.ordens_servico os WHERE os.id=v_a.ordem_servico_id;
 ELSE SELECT os.cliente_id,c.organization_id INTO v_os_client,v_os_org FROM public.ordens_servico_onfarm os JOIN public.clientes c ON c.id=os.cliente_id WHERE os.id=v_a.ordem_servico_onfarm_id; END IF;
 IF v_os_client IS DISTINCT FROM v_client OR v_os_org IS DISTINCT FROM v_org OR NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=v_client AND c.organization_id=v_org) THEN RETURN false; END IF;
 v_staff:=NOT public.has_role(auth.uid(),'aplicador') OR public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'administrativo') OR public.has_role(auth.uid(),'consultor_tecnico') OR v_a.responsavel_id=auth.uid() OR v_client=ANY(public.get_cliente_ids_for_user(auth.uid()));
 IF p_action='select' THEN RETURN v_staff AND public.can_user_access_aplicacao(v_app); END IF;
 RETURN v_staff AND v_a.is_latest IS TRUE AND public.can_user_manage_aplicacao(v_app);
END; $$;
-- Null actions cannot acquire a mutation branch in the consultant core.
CREATE OR REPLACE FUNCTION public.storage1_consultor_allowed(p_name text,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT p_action IS NOT NULL AND platform_private.storage1_consultor_allowed(p_name,p_action); $$;
-- Existing policies call the private core, so add an action guard there too.
ALTER FUNCTION platform_private.storage1_consultor_allowed(text,text) RENAME TO storage1_consultor_core;
CREATE FUNCTION platform_private.storage1_consultor_allowed(p_name text,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT p_action IS NOT NULL AND platform_private.storage1_consultor_core(p_name,p_action); $$;
REVOKE ALL ON FUNCTION platform_private.storage1_consultor_allowed(text,text),platform_private.storage1_consultor_core(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.storage1_consultor_allowed(text,text),platform_private.storage1_consultor_core(text,text) TO authenticated,service_role;
-- Policy actions are fixed non-null literals; dependencies retain core OID. No permissive policies added.
