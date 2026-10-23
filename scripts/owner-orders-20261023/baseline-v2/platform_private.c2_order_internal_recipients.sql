CREATE OR REPLACE FUNCTION platform_private.c2_order_internal_recipients(_partner uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT DISTINCT ur.user_id
    FROM public.partner_accounts pa
    JOIN public.organizations o ON o.id = pa.commercial_owner_organization_id AND o.ativo IS TRUE AND o.status = 'ativa'
    JOIN public.profiles p ON p.organization_id = o.id AND p.ativo IS TRUE
    JOIN public.user_roles ur ON ur.user_id = p.user_id
   WHERE pa.id = _partner AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
     AND ur.role IN ('administrador'::public.app_role,'gestor_comercial'::public.app_role);
$function$
