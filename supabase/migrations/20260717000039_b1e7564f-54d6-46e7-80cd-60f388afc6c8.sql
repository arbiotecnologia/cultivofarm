-- Helper interno para validar permissão + status editável em uma visita
CREATE OR REPLACE FUNCTION public._assert_visita_editavel(p_registro_id uuid)
RETURNS public.registros_consultor
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_is_admin boolean;
  v_has_scope boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002'; END IF;
  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);
  v_has_scope := v_reg.cliente_id IS NOT NULL
    AND public.has_active_user_cliente_access(v_uid, v_reg.cliente_id, ARRAY['execute','manage']);
  IF NOT (v_is_admin OR v_reg.created_by = v_uid OR v_reg.consultor_responsavel = v_uid OR v_has_scope) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;
  RETURN v_reg;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_visita_editavel(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public._assert_visita_editavel(uuid) TO authenticated, service_role;

-- Fase 5: diagnósticos
CREATE OR REPLACE FUNCTION public.rpc_upsert_diagnostico_visita(
  p_registro_id uuid,
  p_client_uuid uuid,
  p_payload jsonb,
  p_expected_versao integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.visita_diagnosticos;
  v_new public.visita_diagnosticos;
BEGIN
  PERFORM public._assert_visita_editavel(p_registro_id);
  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22004'; END IF;

  SELECT * INTO v_existing FROM public.visita_diagnosticos
    WHERE registro_id = p_registro_id AND client_uuid = p_client_uuid;

  IF v_existing.id IS NOT NULL AND COALESCE(p_expected_versao, -1) < v_existing.versao THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.visita_diagnosticos (
      registro_id, client_uuid, categoria, problema, descricao, severidade,
      incidencia, urgencia, risco, intervencao, localizacao, versao, created_by
    ) VALUES (
      p_registro_id, p_client_uuid,
      NULLIF(p_payload->>'categoria',''),
      NULLIF(p_payload->>'problema',''),
      NULLIF(p_payload->>'descricao',''),
      NULLIF(p_payload->>'severidade',''),
      NULLIF((p_payload->>'incidencia'),'')::numeric,
      NULLIF(p_payload->>'urgencia',''),
      NULLIF(p_payload->>'risco',''),
      NULLIF(p_payload->>'intervencao',''),
      NULLIF(p_payload->>'localizacao',''),
      GREATEST(1, COALESCE(p_expected_versao, 1)),
      v_uid
    ) RETURNING * INTO v_new;
  ELSE
    UPDATE public.visita_diagnosticos SET
      categoria = NULLIF(p_payload->>'categoria',''),
      problema = NULLIF(p_payload->>'problema',''),
      descricao = NULLIF(p_payload->>'descricao',''),
      severidade = NULLIF(p_payload->>'severidade',''),
      incidencia = NULLIF((p_payload->>'incidencia'),'')::numeric,
      urgencia = NULLIF(p_payload->>'urgencia',''),
      risco = NULLIF(p_payload->>'risco',''),
      intervencao = NULLIF(p_payload->>'intervencao',''),
      localizacao = NULLIF(p_payload->>'localizacao',''),
      versao = v_existing.versao + 1,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_new;
  END IF;

  RETURN jsonb_build_object('id', v_new.id, 'versao', v_new.versao, 'client_uuid', v_new.client_uuid);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_upsert_diagnostico_visita(uuid, uuid, jsonb, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_diagnostico_visita(uuid, uuid, jsonb, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_delete_diagnostico_visita(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_diag public.visita_diagnosticos;
BEGIN
  SELECT * INTO v_diag FROM public.visita_diagnosticos WHERE id = p_id;
  IF v_diag.id IS NULL THEN RETURN; END IF;
  PERFORM public._assert_visita_editavel(v_diag.registro_id);
  DELETE FROM public.visita_diagnosticos WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_delete_diagnostico_visita(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_diagnostico_visita(uuid) TO authenticated, service_role;

-- Fase 6: recomendações
CREATE OR REPLACE FUNCTION public.rpc_upsert_recomendacao_visita(
  p_registro_id uuid,
  p_client_uuid uuid,
  p_payload jsonb,
  p_expected_versao integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.registros_consultor_recomendacoes;
  v_new public.registros_consultor_recomendacoes;
BEGIN
  PERFORM public._assert_visita_editavel(p_registro_id);
  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22004'; END IF;

  SELECT * INTO v_existing FROM public.registros_consultor_recomendacoes
    WHERE registro_consultor_id = p_registro_id AND client_uuid = p_client_uuid;

  IF v_existing.id IS NOT NULL AND COALESCE(p_expected_versao, -1) < v_existing.versao THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.registros_consultor_recomendacoes (
      registro_consultor_id, client_uuid, recomendacao_tecnica,
      objetivo_recomendacao, estrategia_manejo,
      microrganismo_id, produto_biologico_sugerido_id,
      dose_recomendada_valor, dose_recomendada_unidade,
      volume_calda, volume_total_recomendado,
      numero_aplicacoes, intervalo_aplicacoes,
      modo_aplicacao, momento_aplicacao,
      cuidados_operacionais, compatibilidade_observacoes,
      observacoes_finais, encaminhar_para_os,
      versao, created_by
    ) VALUES (
      p_registro_id, p_client_uuid,
      NULLIF(p_payload->>'recomendacao_tecnica',''),
      NULLIF(p_payload->>'objetivo_recomendacao','')::objetivo_recomendacao,
      NULLIF(p_payload->>'estrategia_manejo','')::estrategia_manejo,
      NULLIF((p_payload->>'microrganismo_id'),'')::uuid,
      NULLIF((p_payload->>'produto_biologico_sugerido_id'),'')::uuid,
      NULLIF((p_payload->>'dose_recomendada_valor'),'')::numeric,
      NULLIF(p_payload->>'dose_recomendada_unidade',''),
      NULLIF(p_payload->>'volume_calda',''),
      NULLIF((p_payload->>'volume_total_recomendado'),'')::numeric,
      NULLIF((p_payload->>'numero_aplicacoes'),'')::integer,
      NULLIF(p_payload->>'intervalo_aplicacoes',''),
      NULLIF(p_payload->>'modo_aplicacao','')::modo_aplicacao_consultor,
      NULLIF(p_payload->>'momento_aplicacao',''),
      NULLIF(p_payload->>'cuidados_operacionais',''),
      NULLIF(p_payload->>'compatibilidade_observacoes',''),
      NULLIF(p_payload->>'observacoes_finais',''),
      COALESCE((p_payload->>'encaminhar_para_os')::boolean, false),
      GREATEST(1, COALESCE(p_expected_versao, 1)),
      v_uid
    ) RETURNING * INTO v_new;
  ELSE
    UPDATE public.registros_consultor_recomendacoes SET
      recomendacao_tecnica = NULLIF(p_payload->>'recomendacao_tecnica',''),
      objetivo_recomendacao = NULLIF(p_payload->>'objetivo_recomendacao','')::objetivo_recomendacao,
      estrategia_manejo = NULLIF(p_payload->>'estrategia_manejo','')::estrategia_manejo,
      microrganismo_id = NULLIF((p_payload->>'microrganismo_id'),'')::uuid,
      produto_biologico_sugerido_id = NULLIF((p_payload->>'produto_biologico_sugerido_id'),'')::uuid,
      dose_recomendada_valor = NULLIF((p_payload->>'dose_recomendada_valor'),'')::numeric,
      dose_recomendada_unidade = NULLIF(p_payload->>'dose_recomendada_unidade',''),
      volume_calda = NULLIF(p_payload->>'volume_calda',''),
      volume_total_recomendado = NULLIF((p_payload->>'volume_total_recomendado'),'')::numeric,
      numero_aplicacoes = NULLIF((p_payload->>'numero_aplicacoes'),'')::integer,
      intervalo_aplicacoes = NULLIF(p_payload->>'intervalo_aplicacoes',''),
      modo_aplicacao = NULLIF(p_payload->>'modo_aplicacao','')::modo_aplicacao_consultor,
      momento_aplicacao = NULLIF(p_payload->>'momento_aplicacao',''),
      cuidados_operacionais = NULLIF(p_payload->>'cuidados_operacionais',''),
      compatibilidade_observacoes = NULLIF(p_payload->>'compatibilidade_observacoes',''),
      observacoes_finais = NULLIF(p_payload->>'observacoes_finais',''),
      encaminhar_para_os = COALESCE((p_payload->>'encaminhar_para_os')::boolean, encaminhar_para_os),
      versao = v_existing.versao + 1,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_new;
  END IF;

  RETURN jsonb_build_object('id', v_new.id, 'versao', v_new.versao, 'client_uuid', v_new.client_uuid);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_upsert_recomendacao_visita(uuid, uuid, jsonb, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_recomendacao_visita(uuid, uuid, jsonb, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_delete_recomendacao_visita(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.registros_consultor_recomendacoes;
BEGIN
  SELECT * INTO v_rec FROM public.registros_consultor_recomendacoes WHERE id = p_id;
  IF v_rec.id IS NULL THEN RETURN; END IF;
  PERFORM public._assert_visita_editavel(v_rec.registro_consultor_id);
  DELETE FROM public.registros_consultor_recomendacoes WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_delete_recomendacao_visita(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_recomendacao_visita(uuid) TO authenticated, service_role;