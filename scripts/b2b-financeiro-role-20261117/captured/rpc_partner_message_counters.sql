CREATE OR REPLACE FUNCTION public.rpc_partner_message_counters(p_partner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_partner uuid := COALESCE(p_partner_id, get_user_partner_id());
BEGIN
  IF NOT (public.has_role(auth.uid(), 'administrador'::public.app_role)
      or public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
      or (public.get_user_partner_id() is not null
          and (p_partner_id is null or p_partner_id = public.get_user_partner_id()))) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'nao_lidas', COUNT(*) FILTER (WHERE m.status = 'nao_lida'),
      'pendentes', COUNT(*) FILTER (WHERE m.status IN ('nao_lida','lida')),
      'respondidas', COUNT(*) FILTER (WHERE m.status = 'respondida'),
      'encerradas', COUNT(*) FILTER (WHERE m.status = 'encerrada')
    )
    FROM public.partner_order_messages m
    JOIN public.partner_orders po ON po.id = m.order_id
    WHERE (v_partner IS NULL OR po.partner_id = v_partner)
  );
END $function$
