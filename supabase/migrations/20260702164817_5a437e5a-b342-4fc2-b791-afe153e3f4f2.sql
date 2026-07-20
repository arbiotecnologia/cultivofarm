
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_sim FROM partner_simulations WHERE id = p_simulation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Simulação não encontrada';
  END IF;

  IF v_sim.status <> 'rascunho' THEN
    RAISE EXCEPTION 'Somente simulações em rascunho podem ser enviadas';
  END IF;

  v_partner_id := get_user_partner_id();

  IF has_role(v_uid, 'administrador') OR has_role(v_uid, 'gestor_comercial') THEN
    v_allowed := true;
  ELSIF has_role(v_uid, 'parceiro_b2b_tecnico') AND v_sim.created_by = v_uid THEN
    v_allowed := true;
  ELSIF has_role(v_uid, 'parceiro_b2b') AND (v_sim.created_by = v_uid OR v_sim.partner_id = v_partner_id) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Sem permissão para enviar esta simulação';
  END IF;

  UPDATE partner_simulations
    SET status = 'enviada_gestor', updated_at = now()
    WHERE id = p_simulation_id;

  INSERT INTO partner_audit_logs (partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (
    v_sim.partner_id, v_uid, 'simulation_sent_to_manager',
    jsonb_build_object('simulation_id', p_simulation_id, 'status', v_sim.status),
    jsonb_build_object('simulation_id', p_simulation_id, 'status', 'enviada_gestor')
  );
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_sim FROM partner_simulations WHERE id = p_simulation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Simulação não encontrada';
  END IF;

  IF v_sim.status = 'convertida_pedido' THEN
    RAISE EXCEPTION 'Simulação já convertida em pedido não pode ser arquivada';
  END IF;

  v_partner_id := get_user_partner_id();

  IF has_role(v_uid, 'administrador') OR has_role(v_uid, 'gestor_comercial') THEN
    v_allowed := true;
  ELSIF has_role(v_uid, 'parceiro_b2b_tecnico') AND v_sim.created_by = v_uid THEN
    v_allowed := true;
  ELSIF has_role(v_uid, 'parceiro_b2b') AND v_sim.partner_id = v_partner_id THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Sem permissão para arquivar esta simulação';
  END IF;

  UPDATE partner_simulations
    SET status = 'arquivada', updated_at = now()
    WHERE id = p_simulation_id;

  INSERT INTO partner_audit_logs (partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (
    v_sim.partner_id, v_uid, 'simulation_archived',
    jsonb_build_object('simulation_id', p_simulation_id, 'status', v_sim.status),
    jsonb_build_object('simulation_id', p_simulation_id, 'status', 'arquivada', 'reason', p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_partner_simulation_to_manager_secure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_partner_simulation_secure(uuid, text) TO authenticated;
