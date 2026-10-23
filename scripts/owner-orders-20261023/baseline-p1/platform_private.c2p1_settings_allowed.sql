CREATE OR REPLACE FUNCTION platform_private.c2p1_settings_allowed(p_partner uuid, p_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.partner_accounts pa JOIN public.organizations o
 ON o.id=platform_private.c2p1_internal_actor(CASE WHEN p_write THEN
 ARRAY['administrador','financeiro','gestor','gestor_comercial']::public.app_role[] ELSE
 ARRAY['administrador','financeiro','gestor','gestor_comercial','administrativo']::public.app_role[] END)
 WHERE pa.id=p_partner AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
 AND o.ativo IS TRUE AND o.status='ativa' AND
 (o.partner_account_id=pa.id OR EXISTS(SELECT 1 FROM public.organizations owner
 WHERE owner.id=pa.commercial_owner_organization_id AND owner.id=o.id AND owner.ativo IS TRUE AND owner.status='ativa')));
$function$

