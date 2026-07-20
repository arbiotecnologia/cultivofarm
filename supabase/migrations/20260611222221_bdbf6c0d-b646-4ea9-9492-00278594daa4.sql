-- 1. Garantir colunas em ordens_servico_onfarm
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS solicitacao_id uuid REFERENCES public.portal_solicitacoes(id);
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS consultor_responsavel uuid REFERENCES auth.users(id);
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS cultura_id uuid; -- Ajustar referência se existir tabela de culturas
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS fase_fenologica text;
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS problema_principal text;
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS diagnostico text;
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS recomendacao_tecnica text;
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS observacoes_adicionais text;
ALTER TABLE public.ordens_servico_onfarm ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 2. Índice único parcial para evitar duplicidade
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_os_onfarm_registro_consultor
ON public.ordens_servico_onfarm(registro_consultor_id)
WHERE registro_consultor_id IS NOT NULL;

-- 3. Atualizar rpc_liberar_recomendacao_produtor
CREATE OR REPLACE FUNCTION public.rpc_liberar_recomendacao_produtor(p_registro_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_registro record;
  v_status_anterior text;
  v_has_rec boolean;
  v_solicitacao_id uuid;
BEGIN
  -- Identificação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não autenticado');
  END IF;

  -- Papel oficial
  SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  
  -- Carregar visita
  SELECT * INTO v_registro FROM public.registros_consultor WHERE id = p_registro_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Visita técnica não encontrada');
  END IF;

  v_status_anterior := v_registro.status;
  v_solicitacao_id := v_registro.solicitacao_id;

  -- Permissão: administrador, gestor ou consultor responsável (se a regra permitir)
  -- Nota: No sistema AR Bio, o consultor responsável pode liberar se o status permitir envio
  IF v_user_role NOT IN ('administrador', 'gestor', 'consultor_tecnico', 'tecnico_agronomo') THEN
      RETURN json_build_object('success', false, 'message', 'Usuário sem permissão para liberar recomendação');
  END IF;

  -- Validar Status impeditivos
  IF v_status_anterior IN ('arquivado', 'convertido_os', 'reprovado', 'cancelada') THEN
    RETURN json_build_object('success', false, 'message', 'Não é possível liberar uma visita com status: ' || v_status_anterior);
  END IF;

  -- Validar se existe recomendação
  SELECT EXISTS (
    SELECT 1 FROM public.registros_consultor_recomendacoes 
    WHERE registro_consultor_id = p_registro_id
  ) OR (v_registro.observacoes_tecnicas IS NOT NULL AND v_registro.observacoes_tecnicas <> '')
  INTO v_has_rec;

  IF NOT v_has_rec THEN
    RETURN json_build_object('success', false, 'message', 'A visita não possui uma recomendação técnica válida preenchida');
  END IF;

  -- Atualizar Visita
  UPDATE public.registros_consultor 
  SET status = 'aprovado', updated_at = now() 
  WHERE id = p_registro_id;

  -- Atualizar Solicitação
  IF v_solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes 
    SET status = 'aguardando_decisao_produtor', updated_at = now() 
    WHERE id = v_solicitacao_id;

    -- Timeline
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, status, observacao, criado_por)
    VALUES (v_solicitacao_id, 'aguardando_decisao_produtor', 'Recomendação técnica liberada ao produtor.', v_user_id);
  END IF;

  -- Log Status
  INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_anterior, status_novo, changed_by, motivo)
  VALUES (p_registro_id, v_status_anterior, 'aprovado', v_user_id, 'Recomendação liberada para decisão do produtor');

  -- Log Visita
  INSERT INTO public.visitas_logs (registro_consultor_id, acao, descricao, usuario_id)
  VALUES (p_registro_id, 'liberacao_recomendacao', 'Recomendação liberada ao produtor por ' || v_user_role, v_user_id);

  RETURN json_build_object(
    'success', true, 
    'message', 'Recomendação liberada com sucesso',
    'registro_id', p_registro_id,
    'solicitacao_id', v_solicitacao_id,
    'status_anterior', v_status_anterior,
    'status_novo', 'aprovado'
  );
END;
$function$;

-- 4. Atualizar rpc_converter_visita_em_os
CREATE OR REPLACE FUNCTION public.rpc_converter_visita_em_os(p_registro_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_registro record;
  v_new_os_id uuid;
  v_os_existente_id uuid;
  v_status_anterior_visita text;
  v_diagnostico_consolidado text;
  v_problema_consolidado text;
  v_rec_consolidada text;
  v_has_rec boolean;
BEGIN
  -- 1. Identificação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Usuário não autenticado');
  END IF;

  -- 2. Permissão
  SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_user_role NOT IN ('administrador', 'gestor', 'consultor_tecnico', 'tecnico_agronomo') THEN
    RETURN json_build_object('success', false, 'message', 'Usuário sem permissão para converter visita em OS');
  END IF;

  -- 3. Carregar Visita
  SELECT * INTO v_registro FROM public.registros_consultor WHERE id = p_registro_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Visita técnica não encontrada');
  END IF;

  v_status_anterior_visita := v_registro.status;

  -- 4. Validar Status
  IF v_status_anterior_visita NOT IN ('aprovado') THEN
     RETURN json_build_object('success', false, 'message', 'A conversão só é permitida para visitas com status "aprovado" (liberado ao produtor). Status atual: ' || v_status_anterior_visita);
  END IF;

  -- 5. Evitar Duplicidade
  SELECT id INTO v_os_existente_id FROM public.ordens_servico_onfarm WHERE registro_consultor_id = p_registro_id LIMIT 1;
  IF v_os_existente_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', true, 
      'already_exists', true,
      'os_id', v_os_existente_id,
      'message', 'OS já existente para esta visita.'
    );
  END IF;

  -- 6. Validar Recomendação
  SELECT EXISTS (
    SELECT 1 FROM public.registros_consultor_recomendacoes 
    WHERE registro_consultor_id = p_registro_id
  ) OR (v_registro.observacoes_tecnicas IS NOT NULL AND v_registro.observacoes_tecnicas <> '')
  INTO v_has_rec;

  IF NOT v_has_rec THEN
    RETURN json_build_object('success', false, 'message', 'Não é possível converter sem uma recomendação técnica válida');
  END IF;

  -- 7. Consolidar Diagnósticos
  SELECT 
    string_agg(DISTINCT problema, ', ') FILTER (WHERE problema IS NOT NULL),
    string_agg(
      format('- %s (Severidade: %s, Incidência: %s%%)%s', 
        problema, 
        severidade, 
        incidencia, 
        CASE WHEN descricao IS NOT NULL AND descricao != '' THEN E'\n  Nota: ' || descricao ELSE '' END
      ), 
      E'\n'
    )
  INTO v_problema_consolidado, v_diagnostico_consolidado
  FROM public.visita_diagnosticos 
  WHERE registro_id = p_registro_id;

  IF v_problema_consolidado IS NULL THEN
    v_problema_consolidado := v_registro.problema_principal;
    v_diagnostico_consolidado := v_registro.problema_principal;
  END IF;

  -- 8. Consolidar Recomendação Técnica
  SELECT 
    string_agg(
      format('%s: %s (Dose: %s ml/ha, Área: %s ha) - %s', 
        CASE WHEN tipo = 'microrganismo' THEN 'Micro.' ELSE 'Prod.' END,
        COALESCE((SELECT nome FROM produtos WHERE id = r.produto_id), (SELECT nome FROM microrganismos WHERE id = r.microrganismo_id), 'N/A'),
        dose_ml_ha, area_ha, justificativa
      ), 
      E'\n'
    )
  INTO v_rec_consolidada
  FROM public.registros_consultor_recomendacoes r
  WHERE registro_consultor_id = p_registro_id;

  IF v_rec_consolidada IS NULL THEN
    v_rec_consolidada := v_registro.observacoes_tecnicas;
  END IF;

  -- 9. Criar OS
  INSERT INTO public.ordens_servico_onfarm (
    cliente_id, fazenda_id, talhao_id, cultura_id,
    fase_fenologica, problema_principal, diagnostico, 
    recomendacao_tecnica, consultor_responsavel, solicitacao_id,
    registro_consultor_id, observacoes_adicionais, status, created_by
  ) VALUES (
    v_registro.cliente_id, v_registro.fazenda_id, v_registro.talhao_id, v_registro.cultura_id,
    v_registro.fase_fenologica, 
    LEFT(v_problema_consolidado, 255), 
    v_diagnostico_consolidado,
    v_rec_consolidada,
    v_registro.consultor_responsavel, v_registro.solicitacao_id,
    v_registro.id, p_observacao, 'aberta', v_user_id
  ) RETURNING id INTO v_new_os_id;

  -- 10. Atualizar Status
  UPDATE public.registros_consultor SET status = 'convertido_os', updated_at = now() WHERE id = p_registro_id;
  
  IF v_registro.solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes SET status = 'convertida_os', updated_at = now() WHERE id = v_registro.solicitacao_id;
    
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, status, observacao, criado_por)
    VALUES (v_registro.solicitacao_id, 'convertida_os', 'Visita convertida em Ordem de Serviço On-Farm.', v_user_id);
  END IF;

  -- Logs
  INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_anterior, status_novo, changed_by, motivo)
  VALUES (p_registro_id, v_status_anterior_visita, 'convertido_os', v_user_id, 'Conversão em OS On-Farm');

  INSERT INTO public.visitas_logs (registro_consultor_id, acao, descricao, usuario_id)
  VALUES (p_registro_id, 'conversao_os', 'Visita convertida em OS On-Farm: ' || v_new_os_id, v_user_id);

  RETURN json_build_object(
    'success', true, 
    'os_id', v_new_os_id,
    'message', 'Conversão realizada com sucesso',
    'registro_id', p_registro_id,
    'status_anterior', v_status_anterior_visita,
    'status_novo', 'convertido_os'
  );
END;
$function$;