CREATE OR REPLACE FUNCTION platform_private.monitoring_refs_in_actor_tenant(p_fazenda uuid, p_talhao uuid, p_origem uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT public.technical_actor_ready(auth.uid()) AND EXISTS(
 SELECT 1 FROM public.fazendas f WHERE f.id=p_fazenda
 AND public.technical_refs_in_actor_tenant(f.cliente_id,f.id,p_talhao)
 AND (p_origem IS NULL OR EXISTS(SELECT 1 FROM public.registros_consultor r
 WHERE r.id=p_origem AND r.cliente_id=f.cliente_id AND r.fazenda_id=f.id
 AND (p_talhao IS NULL OR r.talhao_id IS NOT DISTINCT FROM p_talhao)
 AND public.technical_refs_in_actor_tenant(r.cliente_id,r.fazenda_id,r.talhao_id))));
$function$
