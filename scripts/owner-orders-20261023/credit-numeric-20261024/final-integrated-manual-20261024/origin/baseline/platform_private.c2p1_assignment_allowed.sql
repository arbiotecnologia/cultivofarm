CREATE OR REPLACE FUNCTION platform_private.c2p1_assignment_allowed(p_scope text, p_partner uuid, p_customer uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT COALESCE(CASE
 WHEN p_scope='partner' AND p_partner IS NOT NULL AND p_customer IS NULL THEN EXISTS(
 SELECT 1 FROM public.partner_accounts pa JOIN public.organizations owner ON owner.id=pa.commercial_owner_organization_id
 WHERE pa.id=p_partner AND pa.ativo IS TRUE AND pa.deleted_at IS NULL AND owner.ativo IS TRUE AND owner.status='ativa'
 AND owner.id=platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro','gestor_comercial']::public.app_role[]))
 WHEN p_scope='producer' AND p_partner IS NULL AND p_customer IS NOT NULL THEN EXISTS(
 SELECT 1 FROM public.clientes c JOIN public.organizations o ON o.id=c.organization_id
 WHERE c.id=p_customer AND c.status_cliente='ativo' AND o.ativo IS TRUE AND o.status='ativa'
 AND o.id=platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro','gestor_comercial']::public.app_role[]))
 ELSE false END,false);
$function$
