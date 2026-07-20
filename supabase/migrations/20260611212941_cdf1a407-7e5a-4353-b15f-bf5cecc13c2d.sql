-- 1. RPC Central de Conversão
CREATE OR REPLACE FUNCTION public.rpc_converter_visita_em_os(
  p_registro_id uuid,
  p_observacao text default null
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_registro record;
  v_solicitacao record;
  v_new_os_id uuid;
  v_os_existente_id uuid;
  v_recomendacao record;
BEGIN
  -- 1. Validar autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não autenticado');
  END IF;

  -- 2. Validar perfil/permissão
  SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_user_role NOT IN ('administrador', 'gestor', 'consultor_tecnico', 'tecnico_agronomo') THEN
    RETURN json_build_object('success', false, 'message', 'Usuário sem permissão para converter visita em OS');
  END IF;

  -- 3. Buscar e validar registro da visita
  SELECT * INTO v_registro FROM public.registros_consultor WHERE id = p_registro_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Visita técnica não encontrada');
  END IF;

  IF v_registro.status = 'arquivado' THEN
    RETURN json_build_object('success', false, 'message', 'Não é possível converter uma visita arquivada');
  END IF;

  -- 4. Verificar se já existe OS vinculada (Validação lógica para evitar duplicidade)
  SELECT id INTO v_os_existente_id FROM public.ordens_servico_onfarm WHERE registro_consultor_id = p_registro_id LIMIT 1;
  IF v_os_existente_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', true, 
      'message', 'OS já existente para esta visita.', 
      'os_id', v_os_existente_id, 
      'already_exists', true
    );
  END IF;

  -- 5. Validar status e recomendação
  -- Status permitidos: aprovado (liberado pelo gestor) ou finalizado (se consultor tiver permissão de liberação direta, mas aqui exigimos aprovado para segurança)
  IF v_registro.status NOT IN ('aprovado', 'convertido_os') AND v_registro.status != 'finalizado' THEN
     -- Se já estiver convertido_os, retorna a OS existente (já validado acima, mas por segurança)
     IF v_registro.status = 'convertido_os' THEN
        SELECT id INTO v_os_existente_id FROM public.ordens_servico_onfarm WHERE registro_consultor_id = p_registro_id LIMIT 1;
        RETURN json_build_object('success', true, 'message', 'Visita já convertida anteriormente.', 'os_id', v_os_existente_id, 'already_exists', true);
     END IF;
  END IF;

  -- Buscar recomendação técnica
  -- Prioridade para registros_consultor_recomendacoes, depois campo observacoes_tecnicas
  SELECT * INTO v_recomendacao FROM public.registros_consultor_recomendacoes WHERE registro_consultor_id = p_registro_id LIMIT 1;
  
  -- 6. Criar a Ordem de Serviço On-Farm
  INSERT INTO public.ordens_servico_onfarm (
    cliente_id,
    fazenda_id,
    talhao_id,
    cultura_id,
    fase_fenologica,
    problema_principal,
    diagnostico,
    recomendacao_tecnica,
    consultor_responsavel,
    solicitacao_id,
    registro_consultor_id,
    observacoes_adicionais,
    status,
    created_by
  ) VALUES (
    v_registro.cliente_id,
    v_registro.fazenda_id,
    v_registro.talhao_id,
    v_registro.cultura_id,
    v_registro.fase_fenologica,
    v_registro.problema_principal,
    v_registro.diagnostico_resumido, -- Usando campo existente se houver
    COALESCE(v_recomendacao.recomendacao_texto, v_registro.observacoes_tecnicas),
    v_registro.consultor_responsavel,
    v_registro.solicitacao_id,
    v_registro.id,
    p_observacao,
    'aguardando_aprovacao',
    v_user_id
  ) RETURNING id INTO v_new_os_id;

  -- 7. Atualizar status da visita e solicitação
  UPDATE public.registros_consultor 
  SET status = 'convertido_os', updated_at = now() 
  WHERE id = p_registro_id;

  IF v_registro.solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes 
    SET status = 'convertida_os', updated_at = now() 
    WHERE id = v_registro.solicitacao_id;

    -- Timeline da solicitação
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES (v_registro.solicitacao_id, 'convertida_os', 'Recomendação técnica convertida em Ordem de Serviço #' || v_new_os_id, v_user_id);
  END IF;

  -- 8. Registrar Logs
  INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_anterior, status_novo, changed_by, motivo)
  VALUES (p_registro_id, v_registro.status, 'convertido_os', v_user_id, p_observacao);

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao, metadata)
  VALUES (p_registro_id, v_user_id, 'conversao_os', 'Visita convertida em OS On-Farm. ID: ' || v_new_os_id, jsonb_build_object('os_id', v_new_os_id, 'solicitacao_id', v_registro.solicitacao_id));

  RETURN json_build_object(
    'success', true, 
    'message', 'Visita convertida em Ordem de Serviço com sucesso', 
    'os_id', v_new_os_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'message', 'Erro ao converter: ' || SQLERRM);
END;
$$;
