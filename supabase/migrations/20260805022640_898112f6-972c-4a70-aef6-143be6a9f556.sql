
-- Helper interno de autorização + lock de versão
CREATE OR REPLACE FUNCTION public._visita_lock_and_check(
  p_registro_id uuid,
  p_expected_version integer,
  p_require_approver boolean DEFAULT false
) RETURNS public.registros_consultor
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registro_inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF p_require_approver THEN
    IF NOT (public.has_role(v_uid, 'administrador') OR public.is_visit_org_manager(v_uid, p_registro_id)) THEN
      RAISE EXCEPTION 'forbidden_aprovacao' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.can_manage_technical_visit(v_uid, p_registro_id) THEN
      RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_expected_version IS NOT NULL AND COALESCE(v_reg.version, 1) <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001';
  END IF;

  RETURN v_reg;
END;
$$;
REVOKE ALL ON FUNCTION public._visita_lock_and_check(uuid, integer, boolean) FROM PUBLIC, anon, authenticated;

-- 1) Atualização versionada da identificação
CREATE OR REPLACE FUNCTION public.rpc_atualizar_identificacao_visita(
  p_registro_id uuid,
  p_expected_version integer,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg public.registros_consultor%ROWTYPE;
  v_new_version integer;
BEGIN
  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, false);

  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'status_nao_editavel' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.registros_consultor SET
    cultura_id      = COALESCE((p_payload->>'cultura_id')::uuid, cultura_id),
    data_vistoria   = COALESCE((p_payload->>'data_vistoria')::date, data_vistoria),
    tipo_visita     = COALESCE((p_payload->>'tipo_visita')::tipo_visita, tipo_visita),
    objetivo_visita = COALESCE(NULLIF(p_payload->>'objetivo_visita',''), objetivo_visita),
    safra           = COALESCE(NULLIF(p_payload->>'safra',''), safra),
    fase_fenologica = COALESCE(NULLIF(p_payload->>'fase_fenologica',''), fase_fenologica),
    version         = COALESCE(version, 1) + 1,
    updated_at      = now()
  WHERE id = p_registro_id
  RETURNING version INTO v_new_version;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, auth.uid(), 'identificacao_atualizada', 'Identificação da visita atualizada');

  RETURN jsonb_build_object('ok', true, 'version', v_new_version);
END;
$$;

-- 2) Reprovação
CREATE OR REPLACE FUNCTION public.rpc_reprovar_visita(
  p_registro_id uuid,
  p_expected_version integer,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg public.registros_consultor%ROWTYPE;
  v_new_version integer;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'P0001';
  END IF;
  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, true);

  IF v_reg.status::text <> 'enviado_aprovacao' THEN
    RAISE EXCEPTION 'status_invalido' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.registros_consultor
     SET status = 'reprovado', version = COALESCE(version,1)+1, updated_at = now()
   WHERE id = p_registro_id
   RETURNING version INTO v_new_version;

  INSERT INTO public.aprovacoes_tecnicas (registro_consultor_id, status_aprovacao, comentario_gestor, aprovado_por, data_aprovacao)
  VALUES (p_registro_id, 'reprovado', p_motivo, auth.uid(), now());

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, auth.uid(), 'recomendacao_reprovada', 'Visita reprovada. Motivo: ' || p_motivo);

  RETURN jsonb_build_object('ok', true, 'version', v_new_version, 'status', 'reprovado');
END;
$$;

-- 3) Pedido de ajuste (volta para rascunho)
CREATE OR REPLACE FUNCTION public.rpc_solicitar_ajuste_visita(
  p_registro_id uuid,
  p_expected_version integer,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg public.registros_consultor%ROWTYPE;
  v_new_version integer;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'P0001';
  END IF;
  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, true);

  IF v_reg.status::text <> 'enviado_aprovacao' THEN
    RAISE EXCEPTION 'status_invalido' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.registros_consultor
     SET status = 'rascunho', version = COALESCE(version,1)+1, updated_at = now()
   WHERE id = p_registro_id
   RETURNING version INTO v_new_version;

  INSERT INTO public.aprovacoes_tecnicas (registro_consultor_id, status_aprovacao, comentario_gestor, aprovado_por, data_aprovacao)
  VALUES (p_registro_id, 'ajuste_solicitado', p_motivo, auth.uid(), now());

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, auth.uid(), 'ajuste_solicitado', 'Ajuste solicitado. Motivo: ' || p_motivo);

  RETURN jsonb_build_object('ok', true, 'version', v_new_version, 'status', 'rascunho');
END;
$$;

-- 4) Reabertura (aprovado -> enviado_aprovacao) — apenas administrador
CREATE OR REPLACE FUNCTION public.rpc_reabrir_visita(
  p_registro_id uuid,
  p_expected_version integer,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg public.registros_consultor%ROWTYPE;
  v_new_version integer;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.has_role(auth.uid(), 'administrador') THEN
    RAISE EXCEPTION 'forbidden_reabertura' USING ERRCODE = '42501';
  END IF;
  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, true);

  IF v_reg.status::text <> 'aprovado' THEN
    RAISE EXCEPTION 'status_invalido' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.registros_consultor
     SET status = 'enviado_aprovacao', version = COALESCE(version,1)+1, updated_at = now()
   WHERE id = p_registro_id
   RETURNING version INTO v_new_version;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, auth.uid(), 'visita_reaberta', 'Visita reaberta. Motivo: ' || p_motivo);

  RETURN jsonb_build_object('ok', true, 'version', v_new_version, 'status', 'enviado_aprovacao');
END;
$$;

-- 5) Arquivamento
CREATE OR REPLACE FUNCTION public.rpc_arquivar_visita(
  p_registro_id uuid,
  p_expected_version integer,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg public.registros_consultor%ROWTYPE;
  v_new_version integer;
BEGIN
  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, false);

  IF v_reg.status::text = 'arquivado' THEN
    RETURN jsonb_build_object('ok', true, 'version', v_reg.version, 'status', 'arquivado', 'idempotent', true);
  END IF;

  UPDATE public.registros_consultor
     SET status = 'arquivado', version = COALESCE(version,1)+1, updated_at = now()
   WHERE id = p_registro_id
   RETURNING version INTO v_new_version;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, auth.uid(), 'visita_arquivada', COALESCE('Visita arquivada. Motivo: ' || NULLIF(btrim(p_motivo),''), 'Visita arquivada'));

  RETURN jsonb_build_object('ok', true, 'version', v_new_version, 'status', 'arquivado');
END;
$$;

-- 6) Programação de retorno (solicitação + rascunho vinculado, transacional e idempotente)
CREATE OR REPLACE FUNCTION public.rpc_programar_retorno_visita(
  p_registro_id uuid,
  p_data_prevista date,
  p_descricao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor%ROWTYPE;
  v_sol_id uuid;
  v_new_id uuid;
  v_target_user uuid;
  v_profile uuid;
BEGIN
  IF p_data_prevista IS NULL THEN
    RAISE EXCEPTION 'data_prevista_obrigatoria' USING ERRCODE = 'P0001';
  END IF;
  v_reg := public._visita_lock_and_check(p_registro_id, NULL, false);

  SELECT id INTO v_new_id FROM public.registros_consultor
   WHERE registro_origem_id = p_registro_id AND status::text = 'rascunho' LIMIT 1;
  IF v_new_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'registro_id', v_new_id, 'idempotent', true);
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
    origem_solicitacao, user_id, urgencia
  ) VALUES (
    v_reg.cliente_id, v_reg.fazenda_id, v_reg.talhao_id, 'retorno_tecnico',
    COALESCE(NULLIF(btrim(p_descricao),''), 'Retorno técnico programado'),
    'agendada', COALESCE(v_reg.consultor_responsavel, v_uid), p_data_prevista,
    p_registro_id, 'interna', v_target_user, 'media'
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
     SET data_proxima_visita = p_data_prevista, updated_at = now()
   WHERE id = p_registro_id;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES
    (p_registro_id, v_uid, 'retorno_programado', 'Retorno técnico programado para ' || p_data_prevista::text),
    (v_new_id, v_uid, 'visita_criada', 'Visita de retorno criada a partir da visita ' || p_registro_id::text);

  RETURN jsonb_build_object('ok', true, 'registro_id', v_new_id, 'solicitacao_id', v_sol_id);
END;
$$;

-- 7) Plano de monitoramento
CREATE OR REPLACE FUNCTION public.rpc_ativar_monitoramento_visita(
  p_registro_id uuid,
  p_tipo text,
  p_data_referencia date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public._visita_lock_and_check(p_registro_id, NULL, false);
  IF p_tipo IS NULL OR btrim(p_tipo) = '' THEN
    RAISE EXCEPTION 'tipo_obrigatorio' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_id FROM public.monitoramento_avisos
   WHERE registro_consultor_id = p_registro_id AND tipo = p_tipo
     AND data_referencia IS NOT DISTINCT FROM p_data_referencia
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'idempotent', true);
  END IF;

  INSERT INTO public.monitoramento_avisos (registro_consultor_id, tipo, data_referencia)
  VALUES (p_registro_id, p_tipo, p_data_referencia)
  RETURNING id INTO v_id;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, auth.uid(), 'monitoramento_ativado', 'Plano de monitoramento: ' || p_tipo);

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_atualizar_identificacao_visita(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_reprovar_visita(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_solicitar_ajuste_visita(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_reabrir_visita(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_arquivar_visita(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_programar_retorno_visita(uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_ativar_monitoramento_visita(uuid, text, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_atualizar_identificacao_visita(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reprovar_visita(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_solicitar_ajuste_visita(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reabrir_visita(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_arquivar_visita(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_programar_retorno_visita(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativar_monitoramento_visita(uuid, text, date) TO authenticated;
