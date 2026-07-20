
CREATE OR REPLACE FUNCTION public.assign_b2b_user_client_secure(p_user_id uuid, p_cliente_id uuid, p_assignment_type text DEFAULT 'monitoramento'::text, p_can_create_simulation boolean DEFAULT true, p_can_monitor boolean DEFAULT true, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_partner uuid;
  v_id uuid;
  v_is_gest boolean := has_role(v_uid, 'parceiro_b2b'::app_role);
  v_is_admin boolean := has_role(v_uid, 'administrador'::app_role) OR has_role(v_uid, 'gestor_comercial'::app_role);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF has_role(v_uid,'parceiro_b2b_tecnico'::app_role) THEN RAISE EXCEPTION 'access denied'; END IF;
  IF NOT (v_is_gest OR v_is_admin) THEN RAISE EXCEPTION 'access denied'; END IF;

  IF v_is_gest AND NOT v_is_admin THEN
    v_partner := get_user_partner_id();
  ELSE
    SELECT partner_id INTO v_partner FROM public.partner_users WHERE user_id = p_user_id LIMIT 1;
  END IF;

  IF v_partner IS NULL THEN RAISE EXCEPTION 'partner nao identificado'; END IF;

  IF v_is_admin THEN
    INSERT INTO public.partner_clients (partner_id, cliente_id, assigned_by, active)
    VALUES (v_partner, p_cliente_id, v_uid, true)
    ON CONFLICT (partner_id, cliente_id) DO UPDATE SET active = true, updated_at = now();
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_clients
      WHERE partner_id = v_partner AND cliente_id = p_cliente_id AND active = true
    ) THEN
      RAISE EXCEPTION 'Cliente não está liberado para este parceiro. Solicite ao administrador AR Bio.';
    END IF;
  END IF;

  INSERT INTO public.partner_user_clients
    (partner_id, user_id, cliente_id, assignment_type, can_create_simulation, can_monitor, notes, assigned_by, active)
  VALUES
    (v_partner, p_user_id, p_cliente_id, p_assignment_type, p_can_create_simulation, p_can_monitor, p_notes, v_uid, true)
  ON CONFLICT (partner_id, user_id, cliente_id) DO UPDATE
    SET assignment_type = EXCLUDED.assignment_type,
        can_create_simulation = EXCLUDED.can_create_simulation,
        can_monitor = EXCLUDED.can_monitor,
        notes = EXCLUDED.notes,
        active = true,
        updated_at = now()
  RETURNING id INTO v_id;

  PERFORM public.insert_partner_catalog_access_log_internal(
    'b2b_user_client_assigned',
    v_partner,
    v_uid,
    p_cliente_id,
    NULL,
    NULL,
    p_user_id,
    jsonb_build_object(
      'assignment_type', p_assignment_type,
      'can_create_simulation', p_can_create_simulation,
      'can_monitor', p_can_monitor
    )
  );

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unassign_b2b_user_client_secure(p_user_id uuid, p_cliente_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_partner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF has_role(v_uid,'parceiro_b2b_tecnico'::app_role) THEN RAISE EXCEPTION 'access denied'; END IF;

  IF has_role(v_uid,'parceiro_b2b'::app_role) THEN
    v_partner := get_user_partner_id();
  ELSIF has_role(v_uid,'administrador'::app_role) OR has_role(v_uid,'gestor_comercial'::app_role) THEN
    SELECT partner_id INTO v_partner FROM public.partner_user_clients
      WHERE user_id = p_user_id AND cliente_id = p_cliente_id LIMIT 1;
  ELSE
    RAISE EXCEPTION 'access denied';
  END IF;

  UPDATE public.partner_user_clients
     SET active = false, updated_at = now()
   WHERE user_id = p_user_id AND cliente_id = p_cliente_id
     AND (v_partner IS NULL OR partner_id = v_partner);

  UPDATE public.partner_technician_clients
     SET active = false, updated_at = now()
   WHERE technician_user_id = p_user_id AND cliente_id = p_cliente_id
     AND (v_partner IS NULL OR partner_id = v_partner);

  PERFORM public.insert_partner_catalog_access_log_internal(
    'b2b_user_client_unassigned',
    v_partner,
    v_uid,
    p_cliente_id,
    NULL,
    NULL,
    p_user_id,
    jsonb_build_object('reason', p_reason)
  );

  RETURN true;
END;
$function$;

-- convert_partner_simulation_to_order_secure: append B2B log at the end
CREATE OR REPLACE FUNCTION public.log_simulation_converted_to_order(p_partner uuid, p_uid uuid, p_cliente uuid, p_simulation uuid, p_order uuid, p_details jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.insert_partner_catalog_access_log_internal(
    'simulation_converted_to_order', p_partner, p_uid, p_cliente, p_simulation, p_order, NULL, p_details
  );
  SELECT NULL::void;
$$;
REVOKE ALL ON FUNCTION public.log_simulation_converted_to_order(uuid, uuid, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
