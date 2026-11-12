CREATE OR REPLACE FUNCTION platform_private.c2p1_internal_actor(p_roles app_role[])
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT public.h15_actor_organization() WHERE auth.uid() IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id
 WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND o.ativo IS TRUE AND o.status='ativa'
 AND platform_private.platform_actor_access_ready(p.user_id))
 AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role=ANY(p_roles))
 AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid()
 AND role IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor'));
$function$