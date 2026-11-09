CREATE OR REPLACE FUNCTION platform_private.c2_owner_order_create_allowed(uuid, uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$ SELECT EXISTS (SELECT 1 FROM public.partner_users pu JOIN public.profiles p ON p.user_id = pu.user_id AND p.ativo
      JOIN public.user_roles r ON r.user_id = pu.user_id AND r.role = 'parceiro_b2b' WHERE pu.user_id = $1 AND pu.partner_id = $2) $function$
