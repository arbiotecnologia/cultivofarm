-- JÁ APLICADA externamente no Supabase canônico swzpzcwiasxmjutrmvkm.
-- Migration 20261015152726_h_catalog_visit_conversion_tenant_scope.
-- ARQUIVO DE REGISTRO do corpo atual lido em 2026-10-15; NÃO REAPLICAR nem sobrescrever.
-- Não é cópia do envelope/preflight original: somente snapshot pg_get_functiondef vigente.
-- Hash-before: 9c4cfd4e1d197f376c5ec15674b6bb31.
-- Hash-after confirmado read-only: e152db390d27e7d21934451cf10bcad7.
-- ACL preservada: authenticated EXECUTE=true; anon=false. Não contém GRANT/REVOKE.
CREATE OR REPLACE FUNCTION public.rpc_converter_visita_em_os(p_registro_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_registro RECORD;
  v_rec RECORD;
  v_rec_count int;
  v_existing_os RECORD;
  v_new_os_id uuid;
  v_new_numero text;
  v_status_anterior text;
  v_solic_id uuid;
  v_is_consultor_resp boolean;
  v_has_admin boolean;
  v_has_gestor boolean;
  v_has_consultor boolean;
  v_has_tecnico boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- H9-D-L4: gate de capacidade ANTES de qualquer leitura do registro.
  -- Fecha o oráculo de existência (não-encontrado vs sem-permissão) para
  -- identidades sem papel de domínio de visita técnica.
  IF NOT (
    public.has_role(v_user_id, 'administrador'::app_role)
    OR public.has_role(v_user_id, 'gestor'::app_role)
    OR public.has_role(v_user_id, 'consultor_tecnico'::app_role)
    OR public.has_role(v_user_id, 'tecnico_agronomo'::app_role)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para converter esta visita.');
  END IF;

  -- Scope before lookup, status or replay; global role alone is not tenant access.
  IF NOT COALESCE(public.can_view_technical_visit(v_user_id, p_registro_id), false) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para converter esta visita.');
  END IF;

  -- H9-D-L4-R2: resolução ESCOPADA ao chamador em UMA única consulta.
  -- Inexistente e alheio produzem a MESMA resposta genérica, sem revelar existência.
  v_has_admin    := public.has_role(v_user_id, 'administrador'::app_role);
  v_has_gestor   := public.has_role(v_user_id, 'gestor'::app_role);
  v_has_consultor:= public.has_role(v_user_id, 'consultor_tecnico'::app_role);
  v_has_tecnico  := public.has_role(v_user_id, 'tecnico_agronomo'::app_role);

  SELECT * INTO v_registro
    FROM public.registros_consultor rc
   WHERE rc.id = p_registro_id
     AND (
       v_has_admin
       OR v_has_gestor
       OR ((v_has_consultor OR v_has_tecnico) AND rc.consultor_responsavel = v_user_id)
     );

  IF v_registro IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para converter esta visita.');
  END IF;

  v_is_consultor_resp := (v_registro.consultor_responsavel = v_user_id);

  -- OS já existente → retorno idempotente
  SELECT id, numero_os INTO v_existing_os
    FROM public.ordens_servico_onfarm
   WHERE registro_consultor_id = p_registro_id
   LIMIT 1;

  IF v_existing_os.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_exists', true,
      'os_id', v_existing_os.id,
      'numero_os', v_existing_os.numero_os,
      'registro_id', p_registro_id,
      'message', 'OS já existente para esta visita.'
    );
  END IF;

  -- Validações de status
  IF v_registro.status::text = 'arquivado' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Visita arquivada não pode gerar OS.');
  END IF;
  IF v_registro.status::text = 'convertido_os' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Visita já foi convertida em OS.');
  END IF;
  IF v_registro.status::text <> 'aprovado' THEN
    RETURN jsonb_build_object('success', false,
      'message', 'Apenas visitas com recomendação aprovada podem ser convertidas em OS.');
  END IF;

  -- Campos obrigatórios
  IF v_registro.cliente_id IS NULL
     OR v_registro.fazenda_id IS NULL
     OR v_registro.talhao_id  IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'message', 'Visita sem cliente, fazenda ou talhão definidos.');
  END IF;

  -- Recomendação real
  SELECT * INTO v_rec
    FROM public.registros_consultor_recomendacoes
   WHERE registro_consultor_id = p_registro_id
     AND (
       coalesce(btrim(recomendacao_tecnica), '') <> ''
       OR coalesce(btrim(observacoes_finais), '') <> ''
       OR coalesce(btrim(estrategia_manejo), '') <> ''
     )
   ORDER BY created_at DESC NULLS LAST
   LIMIT 1;

  IF v_rec IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'message', 'Não existe recomendação técnica preenchida para esta visita.');
  END IF;

  v_status_anterior := v_registro.status::text;
  v_solic_id := v_registro.solicitacao_id;

  -- Inserir OS On-Farm (status inicial: aberta)
  INSERT INTO public.ordens_servico_onfarm (
    cliente_id, fazenda_id, talhao_id, produto_id,
    area_hectares, modo_aplicacao,
    prioridade, status,
    registro_consultor_id, solicitacao_id, consultor_responsavel, cultura_id,
    fase_fenologica, problema_principal, diagnostico, recomendacao_tecnica,
    observacoes_adicionais, created_by
  ) VALUES (
    v_registro.cliente_id, v_registro.fazenda_id, v_registro.talhao_id,
    v_rec.produto_biologico_sugerido_id,
    v_registro.area_hectares,
    v_rec.modo_aplicacao,
    'media', 'aberta',
    p_registro_id, v_solic_id, v_registro.consultor_responsavel, v_registro.cultura_id,
    v_registro.fase_fenologica, v_registro.problema_principal, NULL,
    coalesce(v_rec.recomendacao_tecnica, v_rec.observacoes_finais, v_rec.estrategia_manejo),
    p_observacao, v_user_id
  )
  RETURNING id, numero_os INTO v_new_os_id, v_new_numero;

  -- Atualizar status visita
  UPDATE public.registros_consultor
     SET status = 'convertido_os', updated_at = now()
   WHERE id = p_registro_id;

  -- Atualizar solicitação
  IF v_solic_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
       SET status = 'convertida_os', updated_at = now()
     WHERE id = v_solic_id;

    INSERT INTO public.solicitacoes_timeline
      (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES
      (v_solic_id, 'convertida_os',
       'Visita técnica convertida em OS On-Farm ' || coalesce(v_new_numero, v_new_os_id::text),
       v_user_id);
  END IF;

  -- Logs
  INSERT INTO public.registros_consultor_status_log
    (registro_consultor_id, status_anterior, status_novo, motivo, changed_by, changed_at)
  VALUES
    (p_registro_id, v_status_anterior, 'convertido_os',
     'Conversão da visita em OS On-Farm', v_user_id, now());

  INSERT INTO public.visitas_logs
    (registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES
    (p_registro_id, v_solic_id, 'os_gerada',
     'Visita convertida em OS On-Farm ' || coalesce(v_new_numero, v_new_os_id::text),
     v_user_id,
     jsonb_build_object('os_id', v_new_os_id, 'numero_os', v_new_numero));

  RETURN jsonb_build_object(
    'success', true,
    'already_exists', false,
    'message', 'OS On-Farm gerada com sucesso.',
    'os_id', v_new_os_id,
    'numero_os', v_new_numero,
    'registro_id', p_registro_id,
    'solicitacao_id', v_solic_id,
    'status_anterior', v_status_anterior,
    'status_novo', 'convertido_os'
  );
EXCEPTION WHEN unique_violation THEN
  -- Caso outra requisição tenha criado a OS simultaneamente
  SELECT id, numero_os INTO v_existing_os
    FROM public.ordens_servico_onfarm
   WHERE registro_consultor_id = p_registro_id
   LIMIT 1;
  RETURN jsonb_build_object(
    'success', true,
    'already_exists', true,
    'os_id', v_existing_os.id,
    'numero_os', v_existing_os.numero_os,
    'message', 'OS já existente para esta visita.'
  );
WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message',
    'Erro ao converter visita em OS: ' || SQLERRM);
END;
$function$;
