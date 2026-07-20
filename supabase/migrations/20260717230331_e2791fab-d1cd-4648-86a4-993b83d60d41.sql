
-- Helpers de permissão granular por ação
CREATE OR REPLACE FUNCTION public.can_checkin_technical_visit(p_user_id uuid, p_registro_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(p_user_id, 'administrador'::public.app_role)
    OR public.is_active_visit_participant(p_user_id, p_registro_id)
    OR EXISTS (
      SELECT 1 FROM public.registros_consultor r
      WHERE r.id = p_registro_id
        AND (r.consultor_profile_id = p_user_id OR r.created_by = p_user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_checkout_technical_visit(p_user_id uuid, p_registro_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Somente encerra o próprio ciclo se já tem entrada ativa
  SELECT EXISTS (
    SELECT 1 FROM public.visitas_checkin c
    WHERE c.registro_consultor_id = p_registro_id
      AND c.consultor_id = p_user_id
      AND c.tipo_checkin <> 'checkout'::public.tipo_checkin
      AND NOT EXISTS (
        SELECT 1 FROM public.visitas_checkin c2
        WHERE c2.registro_consultor_id = c.registro_consultor_id
          AND c2.consultor_id = c.consultor_id
          AND c2.tipo_checkin = 'checkout'::public.tipo_checkin
          AND c2.data_hora_checkin > c.data_hora_checkin
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_checkin_technical_visit(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_checkout_technical_visit(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_checkin_technical_visit(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_checkout_technical_visit(uuid,uuid) TO authenticated;

-- Hardening da remoção: bloqueia se técnico tem ciclo aberto
CREATE OR REPLACE FUNCTION public.rpc_remove_visit_technician(
  p_registro_id uuid, p_user_id uuid, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_has_open_cycle boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
  IF p_registro_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'parametros_obrigatorios' USING ERRCODE='22023';
  END IF;
  IF NOT public.can_manage_technical_visit(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_gestao_equipe' USING ERRCODE='42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.visitas_checkin c
    WHERE c.registro_consultor_id = p_registro_id
      AND c.consultor_id = p_user_id
      AND c.tipo_checkin <> 'checkout'::public.tipo_checkin
      AND NOT EXISTS (
        SELECT 1 FROM public.visitas_checkin c2
        WHERE c2.registro_consultor_id = c.registro_consultor_id
          AND c2.consultor_id = c.consultor_id
          AND c2.tipo_checkin = 'checkout'::public.tipo_checkin
          AND c2.data_hora_checkin > c.data_hora_checkin
      )
  ) INTO v_has_open_cycle;

  IF v_has_open_cycle THEN
    RAISE EXCEPTION 'remocao_bloqueada_presenca_ativa' USING ERRCODE='22023';
  END IF;

  IF NULLIF(btrim(COALESCE(p_reason,'')), '') IS NULL THEN
    RAISE EXCEPTION 'motivo_remocao_obrigatorio' USING ERRCODE='22023';
  END IF;

  UPDATE public.technical_visit_assignments
     SET is_active = false,
         removed_at = now(),
         removal_reason = btrim(p_reason),
         updated_at = now()
   WHERE registro_consultor_id = p_registro_id
     AND user_id = p_user_id
     AND is_active = true
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN RAISE EXCEPTION 'atribuicao_inexistente' USING ERRCODE='22023'; END IF;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, v_uid, 'tecnico_removido',
          'Técnico ' || p_user_id::text || ' removido — motivo: ' || btrim(p_reason));

  RETURN jsonb_build_object('id', v_id, 'removed', true);
END; $$;

-- Fluxo administrativo: encerrar ciclo de outro técnico com justificativa
CREATE OR REPLACE FUNCTION public.rpc_force_checkout_visita(
  p_registro_id uuid,
  p_target_user_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_open_id uuid;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
  IF NULLIF(btrim(COALESCE(p_reason,'')), '') IS NULL THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE='22023';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador'::public.app_role)
    OR public.can_manage_technical_visit(v_uid, p_registro_id)
  ) THEN
    RAISE EXCEPTION 'forbidden_force_checkout' USING ERRCODE='42501';
  END IF;

  SELECT id INTO v_open_id
    FROM public.visitas_checkin c
   WHERE c.registro_consultor_id = p_registro_id
     AND c.consultor_id = p_target_user_id
     AND c.tipo_checkin <> 'checkout'::public.tipo_checkin
     AND NOT EXISTS (
       SELECT 1 FROM public.visitas_checkin c2
       WHERE c2.registro_consultor_id = c.registro_consultor_id
         AND c2.consultor_id = c.consultor_id
         AND c2.tipo_checkin = 'checkout'::public.tipo_checkin
         AND c2.data_hora_checkin > c.data_hora_checkin
     )
   ORDER BY c.data_hora_checkin DESC
   LIMIT 1;

  IF v_open_id IS NULL THEN
    RAISE EXCEPTION 'sem_ciclo_aberto' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.visitas_checkin (
    registro_consultor_id, cliente_id, fazenda_id, talhao_id,
    consultor_id, tipo_checkin, observacoes, client_uuid,
    data_hora_checkin, status
  )
  SELECT c.registro_consultor_id, c.cliente_id, c.fazenda_id, c.talhao_id,
         c.consultor_id, 'checkout'::public.tipo_checkin,
         '[force_checkout by ' || v_uid::text || '] ' || btrim(p_reason),
         'force-' || gen_random_uuid()::text,
         now(), 'realizado'::public.status_checkin
    FROM public.visitas_checkin c WHERE c.id = v_open_id
  RETURNING id INTO v_new_id;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, v_uid, 'force_checkout',
          'Checkout forçado do técnico ' || p_target_user_id::text || ' — motivo: ' || btrim(p_reason));

  RETURN jsonb_build_object('checkout_id', v_new_id, 'forced', true);
END; $$;

REVOKE ALL ON FUNCTION public.rpc_force_checkout_visita(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_force_checkout_visita(uuid,uuid,text) TO authenticated;
