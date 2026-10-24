CREATE OR REPLACE FUNCTION platform_private.c2_producer_links(p_user uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT platform_private.platform_actor_access_ready(p_user)
 AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id
 JOIN public.user_clientes uc ON uc.user_id=p.user_id JOIN public.clientes c ON c.id=uc.cliente_id
 JOIN public.fazendas f ON f.cliente_id=c.id
 WHERE p.user_id=p_user AND p.organization_id=p_org AND p.ativo AND o.ativo AND o.status='ativa'
 AND uc.is_active AND uc.revoked_at IS NULL AND uc.valid_from<=now()
 AND (uc.valid_until IS NULL OR uc.valid_until>=now())
 AND c.organization_id=p_org AND c.status_cliente='ativo' AND f.organization_id=p_org AND f.ativo);
$function$
