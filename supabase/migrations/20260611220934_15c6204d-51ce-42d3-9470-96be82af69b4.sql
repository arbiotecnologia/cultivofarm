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
  v_recomendacao record;
  v_status_anterior_visita text;
  v_diagnostico_consolidado text;
  v_problema_consolidado text;
  v_rec_consolidada text;
BEGIN
  -- 1. Identificação e Autenticação
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

  -- 4. Evitar Duplicidade
  SELECT id INTO v_os_existente_id FROM public.ordens_servico_onfarm WHERE registro_consultor_id = p_registro_id LIMIT 1;
  IF v_os_existente_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', true, 
      'already_exists', true,
      'os_id', v_os_existente_id,
      'message', 'OS já existente para esta visita.'
    );
  END IF;

  -- 5. Consolidar Diagnósticos (Nova Tabela)
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

  -- Fallback para campos legados se não houver registros na nova tabela
  IF v_problema_consolidado IS NULL THEN
    v_problema_consolidado := v_registro.problema_principal;
    v_diagnostico_consolidado := v_registro.problema_principal;
  END IF;

  -- 6. Consolidar Recomendação Técnica
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

  -- Fallback para observações técnicas
  IF v_rec_consolidada IS NULL THEN
    v_rec_consolidada := v_registro.observacoes_tecnicas;
  END IF;

  -- 7. Criar Ordem de Serviço
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

  -- 8. Atualizar Status da Visita
  UPDATE public.registros_consultor SET status = 'convertido_os', updated_at = now() WHERE id = p_registro_id;
  
  -- Log de transição de status
  INSERT INTO public.registros_consultor_status_log (registro_consultor_id, status_anterior, status_novo, changed_by, motivo)
  VALUES (p_registro_id, v_status_anterior_visita, 'convertido_os', v_user_id, 'Conversão em Ordem de Serviço On-Farm');

  -- 9. Atualizar Solicitação Original (se houver)
  IF v_registro.solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes SET status = 'convertida_os', updated_at = now() WHERE id = v_registro.solicitacao_id;
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES (v_registro.solicitacao_id, 'convertida_os', 'Visita convertida em OS On-Farm #' || v_new_os_id, v_user_id);
  END IF;

  -- 10. Log da Visita
  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, v_user_id, 'conversao_os', 'Visita técnica convertida em Ordem de Serviço On-Farm ID: ' || v_new_os_id);

  RETURN json_build_object('success', true, 'os_id', v_new_os_id, 'message', 'Visita convertida em OS com sucesso');
END;
$function$;