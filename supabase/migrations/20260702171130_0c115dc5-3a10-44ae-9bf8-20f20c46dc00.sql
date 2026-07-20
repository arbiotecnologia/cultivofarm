
-- 1) Internal helper (not callable from PostgREST — no EXECUTE to authenticated)
CREATE OR REPLACE FUNCTION public.insert_partner_catalog_access_log_internal(
  p_action text,
  p_partner_id uuid,
  p_user_id uuid,
  p_cliente_id uuid DEFAULT NULL,
  p_simulation_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_id uuid;
  v_allowed text[] := ARRAY[
    'b2b_user_client_assigned','b2b_user_client_unassigned','producer_view',
    'catalog_view','item_view','ficha_view','ficha_download',
    'simulation_created','simulation_sent_to_manager','simulation_archived',
    'simulation_converted_to_order'
  ];
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id obrigatório'; END IF;
  IF NOT (p_action = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'action inválida: %', p_action;
  END IF;
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = p_user_id LIMIT 1;
  INSERT INTO public.partner_catalog_access_logs
    (user_id, role, action, partner_id, cliente_id, simulation_id, order_id, target_user_id, details)
  VALUES
    (p_user_id, v_role, p_action, p_partner_id, p_cliente_id, p_simulation_id, p_order_id, p_target_user_id, COALESCE(p_details,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_partner_catalog_access_log_internal(text, uuid, uuid, uuid, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- 2) Add SELECT policy for técnico B2B viewing own logs
DROP POLICY IF EXISTS pcal_select_tecnico_own ON public.partner_catalog_access_logs;
CREATE POLICY pcal_select_tecnico_own ON public.partner_catalog_access_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'parceiro_b2b_tecnico'::app_role) AND user_id = auth.uid());

-- 3) send/archive/convert also record in partner_catalog_access_logs
CREATE OR REPLACE FUNCTION public.send_partner_simulation_to_manager_secure(p_simulation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sim partner_simulations%ROWTYPE;
  v_partner_id uuid;
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_sim FROM partner_simulations WHERE id = p_simulation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Simulação não encontrada'; END IF;
  IF v_sim.status <> 'rascunho' THEN RAISE EXCEPTION 'Somente simulações em rascunho podem ser enviadas'; END IF;

  v_partner_id := get_user_partner_id();

  IF has_role(v_uid, 'administrador') OR has_role(v_uid, 'gestor_comercial') THEN v_allowed := true;
  ELSIF has_role(v_uid, 'parceiro_b2b_tecnico') AND v_sim.created_by = v_uid THEN v_allowed := true;
  ELSIF has_role(v_uid, 'parceiro_b2b') AND (v_sim.created_by = v_uid OR v_sim.partner_id = v_partner_id) THEN v_allowed := true;
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Sem permissão para enviar esta simulação'; END IF;

  UPDATE partner_simulations SET status = 'enviada_gestor', updated_at = now() WHERE id = p_simulation_id;

  INSERT INTO partner_audit_logs (partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (v_sim.partner_id, v_uid, 'simulation_sent_to_manager',
    jsonb_build_object('simulation_id', p_simulation_id, 'status', v_sim.status),
    jsonb_build_object('simulation_id', p_simulation_id, 'status', 'enviada_gestor'));

  PERFORM public.insert_partner_catalog_access_log_internal(
    'simulation_sent_to_manager', v_sim.partner_id, v_uid,
    v_sim.cliente_id, p_simulation_id, NULL, NULL, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_partner_simulation_secure(p_simulation_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sim partner_simulations%ROWTYPE;
  v_partner_id uuid;
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_sim FROM partner_simulations WHERE id = p_simulation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Simulação não encontrada'; END IF;
  IF v_sim.status = 'convertida_pedido' THEN RAISE EXCEPTION 'Simulação já convertida em pedido não pode ser arquivada'; END IF;

  v_partner_id := get_user_partner_id();

  IF has_role(v_uid, 'administrador') OR has_role(v_uid, 'gestor_comercial') THEN v_allowed := true;
  ELSIF has_role(v_uid, 'parceiro_b2b_tecnico') AND v_sim.created_by = v_uid THEN v_allowed := true;
  ELSIF has_role(v_uid, 'parceiro_b2b') AND v_sim.partner_id = v_partner_id THEN v_allowed := true;
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Sem permissão para arquivar esta simulação'; END IF;

  UPDATE partner_simulations SET status = 'arquivada', updated_at = now() WHERE id = p_simulation_id;

  INSERT INTO partner_audit_logs (partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (v_sim.partner_id, v_uid, 'simulation_archived',
    jsonb_build_object('simulation_id', p_simulation_id, 'status', v_sim.status),
    jsonb_build_object('simulation_id', p_simulation_id, 'status', 'arquivada', 'reason', p_reason));

  PERFORM public.insert_partner_catalog_access_log_internal(
    'simulation_archived', v_sim.partner_id, v_uid,
    v_sim.cliente_id, p_simulation_id, NULL, NULL,
    jsonb_build_object('reason', p_reason));
END;
$$;
