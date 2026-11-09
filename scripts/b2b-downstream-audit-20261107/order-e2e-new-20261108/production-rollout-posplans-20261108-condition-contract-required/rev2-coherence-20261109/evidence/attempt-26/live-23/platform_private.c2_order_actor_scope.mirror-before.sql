CREATE OR REPLACE FUNCTION platform_private.c2_order_actor_scope(p_uid uuid, p_partner uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_uid AND p.ativo) THEN RAISE EXCEPTION 'C2_SCOPE_INACTIVE' USING ERRCODE='42501'; END IF;
  IF public.has_role(p_uid,'administrador') OR public.has_role(p_uid,'gestor_comercial') THEN
    IF platform_private.c2_internal_order_target_reason(p_uid, p_partner) IS NOT NULL THEN RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
  END IF;
END $function$
