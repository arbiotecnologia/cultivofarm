-- ROLLBACK do forward 20261026000000 (restaura definicao anterior)
CREATE OR REPLACE FUNCTION public.rpc_programar_retorno_visita(p_registro_id uuid, p_expected_version integer, p_data_prevista date, p_descricao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor%ROWTYPE;
  v_sol_id uuid;
  v_new_id uuid;
  v_target_user uuid;
  v_profile uuid;
  v_new_version integer;
BEGIN
  IF p_data_prevista IS NULL THEN
    RAISE EXCEPTION 'data_prevista_obrigatoria' USING ERRCODE = 'P0001';
  END IF;

  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, false);

  -- Idempotência canônica: mesma origem + mesma data prevista + rascunho
  SELECT id INTO v_new_id FROM public.registros_consultor
   WHERE registro_origem_id = p_registro_id
     AND status::text = 'rascunho'
     AND data_vistoria = p_data_prevista
   LIMIT 1;

  IF v_new_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'registro_id', v_new_id, 'version', v_reg.version, 'idempotent', true);
  END IF;

  v_target_user := v_uid;
  IF v_reg.solicitacao_id IS NOT NULL THEN
    SELECT user_id INTO v_target_user FROM public.portal_solicitacoes WHERE id = v_reg.solicitacao_id;
    v_target_user := COALESCE(v_target_user, v_uid);
  END IF;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  INSERT INTO public.portal_solicitacoes (
    cliente_id, fazenda_id, talhao_id, tipo_demanda, descricao, status,
    consultor_atribuido, data_prevista_atendimento, registro_origem_id,
    origem_solicitacao, user_id, urgencia, duracao_estimada
  ) VALUES (
    v_reg.cliente_id, v_reg.fazenda_id, v_reg.talhao_id, 'retorno_tecnico',
    COALESCE(NULLIF(btrim(p_descricao),''), 'Retorno técnico programado'),
    'agendada', COALESCE(v_reg.consultor_responsavel, v_uid), p_data_prevista,
    p_registro_id, 'interna', v_target_user, 'media', 120
  ) RETURNING id INTO v_sol_id;

  INSERT INTO public.registros_consultor (
    solicitacao_id, registro_origem_id, cliente_id, fazenda_id, talhao_id, cultura_id,
    consultor_responsavel, created_by, consultor_profile_id, status, tipo_visita,
    tipo_demanda, problema_principal, data_vistoria
  ) VALUES (
    v_sol_id, p_registro_id, v_reg.cliente_id, v_reg.fazenda_id, v_reg.talhao_id, v_reg.cultura_id,
    COALESCE(v_reg.consultor_responsavel, v_uid), v_uid, v_profile, 'rascunho', 'retorno',
    'retorno_tecnico', 'Acompanhamento de visita anterior', p_data_prevista
  ) RETURNING id INTO v_new_id;

  UPDATE public.registros_consultor
     SET data_proxima_visita = p_data_prevista,
         version = COALESCE(version,1)+1,
         updated_at = now()
   WHERE id = p_registro_id
   RETURNING version INTO v_new_version;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao, metadata)
  VALUES
    (p_registro_id, v_uid, 'retorno_programado', 'Retorno técnico programado para ' || p_data_prevista::text,
     jsonb_build_object('data_prevista', p_data_prevista, 'registro_retorno_id', v_new_id, 'version', v_new_version)),
    (v_new_id, v_uid, 'visita_criada', 'Visita de retorno criada a partir da visita ' || p_registro_id::text,
     jsonb_build_object('registro_origem_id', p_registro_id));

  RETURN jsonb_build_object('ok', true, 'registro_id', v_new_id, 'solicitacao_id', v_sol_id, 'version', v_new_version);
END;
$function$;
