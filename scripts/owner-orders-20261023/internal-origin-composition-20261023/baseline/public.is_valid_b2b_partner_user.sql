CREATE OR REPLACE FUNCTION public.is_valid_b2b_partner_user(p_user_id uuid, p_partner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT platform_private.platform_actor_access_ready(p_user_id)
 AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id
 JOIN public.partner_users pu ON pu.user_id=p.user_id
 JOIN public.partner_accounts pa ON pa.id=pu.partner_id
 JOIN public.organizations owner ON owner.id=pa.commercial_owner_organization_id
 WHERE p.user_id=p_user_id AND pa.id=p_partner_id AND p.ativo AND o.ativo AND o.status='ativa'
 AND owner.ativo AND owner.status='ativa' AND pa.ativo AND pa.deleted_at IS NULL
 AND p.organization_id=pu.tenant_id AND pu.tenant_id=owner.id
 AND (o.partner_account_id IS NULL OR o.partner_account_id=pa.id)
 AND pu.revoked_at IS NULL AND pu.valid_from<=now())
 AND (SELECT count(*) FROM public.partner_users WHERE user_id=p_user_id)=1
 AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user_id AND role IN ('parceiro_b2b','parceiro_b2b_tecnico'))
 AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_user_id AND role NOT IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor'));
$function$
