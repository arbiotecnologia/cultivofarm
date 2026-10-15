-- RESTRICTIVE ROLLBACK ONLY. Do NOT restore broad Producer access.
-- Preserves internal baseline, all policies and all objects/data.
BEGIN;
CREATE OR REPLACE FUNCTION platform_private.storage1_consultor_core(p_name text, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid; v_id uuid; v_client uuid; v_status text;
BEGIN
 IF auth.uid() IS NULL OR p_action IS NULL OR NOT public.storage1_path_strict(p_name) OR p_action NOT IN ('select','insert','update','delete') THEN RETURN false; END IF;
 v_org:=public.h15_actor_organization(); IF v_org IS NULL THEN RETURN false; END IF;
 IF p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(foto|audio|documento)/[A-Za-z0-9_.-]+$' OR split_part(p_name,'/',1)<>v_org::text THEN RETURN false; END IF;
 BEGIN v_id:=split_part(p_name,'/',2)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 SELECT r.cliente_id,r.status::text INTO v_client,v_status FROM public.registros_consultor r JOIN public.clientes c ON c.id=r.cliente_id AND c.organization_id=v_org WHERE r.id=v_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF public.has_role(auth.uid(),'cliente_produtor') THEN RETURN false; END IF;
 IF p_action='select' THEN RETURN public.technical_child_read_scope(v_id) AND ((public.has_role(auth.uid(),'cliente_produtor') AND v_client=ANY(public.get_cliente_ids_for_user(auth.uid()))) OR ((public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'consultor_tecnico') OR public.has_role(auth.uid(),'tecnico_agronomo') OR public.has_role(auth.uid(),'aplicador')) AND public.can_view_technical_visit(auth.uid(),v_id))); END IF;
 RETURN v_status IN ('rascunho','em_andamento') AND (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'consultor_tecnico') OR public.has_role(auth.uid(),'tecnico_agronomo') OR public.has_role(auth.uid(),'aplicador')) AND public.can_manage_technical_visit(auth.uid(),v_id);
END; $function$;
COMMIT;
