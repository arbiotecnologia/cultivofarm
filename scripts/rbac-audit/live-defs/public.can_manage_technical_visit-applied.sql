CREATE OR REPLACE FUNCTION public.can_manage_technical_visit(p_user_id uuid, p_registro_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT public.technical_actor_ready(p_user_id) AND EXISTS (
 SELECT 1 FROM public.registros_consultor r
 WHERE r.id=p_registro_id AND public.technical_refs_in_actor_tenant(r.cliente_id,r.fazenda_id,r.talhao_id)
 AND (public.has_role(p_user_id,'administrador') OR public.has_role(p_user_id,'gestor')
 OR ((public.has_role(p_user_id,'consultor_tecnico') OR public.has_role(p_user_id,'tecnico_agronomo'))
 AND public.technical_client_link(p_user_id,r.cliente_id,ARRAY['execute','manage'])
 AND public.is_visit_responsible(p_user_id,r.id))));
$function$;
