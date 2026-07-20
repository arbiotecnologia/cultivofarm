
CREATE OR REPLACE FUNCTION public.log_partner_catalog_access_secure(
  p_action text,
  p_item_tipo text DEFAULT NULL,
  p_item_id uuid DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL,
  p_simulation_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_partner_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner_id uuid;
  v_role text;
  v_log_id uuid;
  v_details jsonb;
  v_allowed_actions text[] := ARRAY[
    'b2b_user_client_assigned','b2b_user_client_unassigned','producer_view',
    'catalog_view','item_view','ficha_view','ficha_download',
    'simulation_created','simulation_sent_to_manager','simulation_archived',
    'simulation_converted_to_order'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (p_action = ANY(v_allowed_actions)) THEN
    RAISE EXCEPTION 'Ação de log inválida: %', p_action;
  END IF;

  IF has_role(v_uid, 'administrador') THEN
    v_role := 'administrador';
    v_partner_id := p_partner_id;
  ELSIF has_role(v_uid, 'gestor_comercial') THEN
    v_role := 'gestor_comercial';
    v_partner_id := p_partner_id;
  ELSIF has_role(v_uid, 'parceiro_b2b') THEN
    v_role := 'parceiro_b2b';
    v_partner_id := get_user_partner_id();
  ELSIF has_role(v_uid, 'parceiro_b2b_tecnico') THEN
    v_role := 'parceiro_b2b_tecnico';
    v_partner_id := get_user_partner_id();
  ELSE
    RAISE EXCEPTION 'Sem permissão para registrar log B2B';
  END IF;

  v_details := COALESCE(p_details, '{}'::jsonb);
  IF p_item_tipo IS NOT NULL THEN
    v_details := v_details || jsonb_build_object('item_tipo', p_item_tipo);
  END IF;
  IF p_item_id IS NOT NULL THEN
    v_details := v_details || jsonb_build_object('item_id', p_item_id);
  END IF;

  INSERT INTO partner_catalog_access_logs (
    user_id, role, action, partner_id, cliente_id,
    simulation_id, order_id, target_user_id, details
  ) VALUES (
    v_uid, v_role, p_action, v_partner_id, p_cliente_id,
    p_simulation_id, p_order_id, p_target_user_id, v_details
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_partner_catalog_access_secure(text, text, uuid, uuid, uuid, uuid, uuid, jsonb, uuid) TO authenticated;

DROP POLICY IF EXISTS pcal_insert ON public.partner_catalog_access_logs;
