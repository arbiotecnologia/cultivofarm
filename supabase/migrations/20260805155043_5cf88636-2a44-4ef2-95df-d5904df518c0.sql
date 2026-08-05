DO $guard$
DECLARE
  c_expected constant text := 'ikaauvsflpmamgxmkhoq';
  c_prod     constant text := 'navfzbwgwzruipouyfnk';
  v_rows integer; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: tabela public._fiscal_staging_marker inexistente';
  END IF;
  SELECT count(*) INTO v_rows FROM public._fiscal_staging_marker WHERE marker = 'STAGING';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'GUARD_ABORT: esperada exatamente 1 linha marker=STAGING, encontradas %', v_rows;
  END IF;
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING';
  IF v_ref IS NULL THEN RAISE EXCEPTION 'GUARD_ABORT: project_ref nulo'; END IF;
  IF v_ref = c_prod THEN RAISE EXCEPTION 'GUARD_ABORT: producao recusada'; END IF;
  IF v_ref IS DISTINCT FROM c_expected THEN RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', v_ref; END IF;
END
$guard$;

-- Garantia de unicidade (idempotente) da chave logica da recomendacao.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rec_registro_client_uuid
  ON public.registros_consultor_recomendacoes (registro_consultor_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

CREATE OR REPLACE FUNCTION public.rpc_upsert_recomendacao_visita(p_registro_id uuid, p_client_uuid uuid, p_payload jsonb, p_expected_versao integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.registros_consultor_recomendacoes;
  v_new public.registros_consultor_recomendacoes;
  v_ok boolean;
  v_lock uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  v_ok := COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false)
       OR COALESCE(public.is_active_visit_participant(v_uid, p_registro_id), false);
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;

  PERFORM public._assert_visita_editavel(p_registro_id);

  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22004'; END IF;

  -- Serializa gravacoes concorrentes: FOR UPDATE na recomendacao nao bloqueia
  -- a ausencia de linha, entao bloqueamos a visita pai (apos autorizacao).
  SELECT id INTO v_lock
    FROM public.registros_consultor
   WHERE id = p_registro_id
   FOR UPDATE;
  IF v_lock IS NULL THEN
    RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
    FROM public.registros_consultor_recomendacoes
   WHERE registro_consultor_id = p_registro_id
     AND client_uuid = p_client_uuid
   FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF p_expected_versao IS NULL OR p_expected_versao <> v_existing.versao THEN
      RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF COALESCE(p_expected_versao, 1) <> 1 THEN
      RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_existing.id IS NULL THEN
    BEGIN
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
        NULLIF(btrim(p_payload->>'estrategia_manejo'),'')::estrategia_manejo,
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
        1,
        v_uid
      ) RETURNING * INTO v_new;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0001';
    END;
  ELSE
    UPDATE public.registros_consultor_recomendacoes SET
      recomendacao_tecnica = NULLIF(p_payload->>'recomendacao_tecnica',''),
      objetivo_recomendacao = NULLIF(p_payload->>'objetivo_recomendacao','')::objetivo_recomendacao,
      estrategia_manejo = NULLIF(btrim(p_payload->>'estrategia_manejo'),'')::estrategia_manejo,
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
$function$;

REVOKE ALL ON FUNCTION public.rpc_upsert_recomendacao_visita(uuid, uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_recomendacao_visita(uuid, uuid, jsonb, integer) TO authenticated, service_role;