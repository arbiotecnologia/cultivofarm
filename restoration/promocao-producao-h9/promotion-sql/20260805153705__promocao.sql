-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260805153705_a30b97c8-b824-4119-8bfe-702faa88a6b1.sql
-- SHA-256 orig: 0b535934e480b0d8084382052d3a7a3966a6cfbe2649f4348d6ae6812fe9c9d5
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-sql.py
-- Transformação: 1 bloco(s) DO de guarda removido(s); guarda canônica de promoção prefixada
--
-- A guarda de homologação foi REMOVIDA e substituída pela guarda canônica de
-- promoção. O runner valida o ref do alvo por canal externo (API/DSN) e só
-- então executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela
-- marcadora de homologação é consultada em produção.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- ============================================================================
-- AUDITORIA CORRETIVA FINAL — VISITA TÉCNICA
-- Migration corretiva posterior a 20260805152009 (release candidate).
-- Corrige: (2) autorizacao da recomendacao e da finalizacao,
--          (3) concorrencia da recomendacao (igualdade exata + FOR UPDATE).
-- Idempotente (CREATE OR REPLACE), sem DROP, sem DDL destrutivo.
-- Assinaturas, SECURITY DEFINER, search_path e grants minimos preservados.
-- Rollback logico: restoration/visita-portais-tecnicos/rollback-consolidacao.sql
-- ============================================================================

-- [guarda de homologação removida pelo gerador de promoção]


-- (2) _assert_visita_editavel — vinculo com o cliente nao basta.
CREATE OR REPLACE FUNCTION public._assert_visita_editavel(p_registro_id uuid)
 RETURNS registros_consultor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002'; END IF;

  -- can_manage_technical_visit = administrador OR responsavel OR gestor da
  -- organizacao/cliente com escopo manage. Vinculo user_clientes generico
  -- (execute/manage) de tecnico/consultor NAO autoriza por si so.
  v_ok := COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false)
       OR COALESCE(v_reg.created_by = v_uid, false)
       OR COALESCE(v_reg.consultor_responsavel = v_uid, false)
       OR COALESCE(public.is_active_visit_participant(v_uid, p_registro_id), false);

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;

  RETURN v_reg;
END;
$function$;

-- (2)+(3) rpc_upsert_recomendacao_visita
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  -- Defesa em profundidade explicita, antes de qualquer leitura/escrita de dados.
  v_ok := COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false)
       OR COALESCE(public.is_active_visit_participant(v_uid, p_registro_id), false);
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;

  PERFORM public._assert_visita_editavel(p_registro_id);

  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22004'; END IF;

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

-- (2) rpc_finalizar_visita_v2 — aceita participante ativo atribuido.
CREATE OR REPLACE FUNCTION public.rpc_finalizar_visita_v2(p_registro_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_ok boolean;
  v_diag_count integer;
  v_checkin_count integer;
  v_new_version integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_reg
    FROM public.registros_consultor
   WHERE id = p_registro_id
   FOR UPDATE;

  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_ok := COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false)
       OR COALESCE(v_reg.created_by = v_uid, false)
       OR COALESCE(v_reg.consultor_responsavel = v_uid, false)
       OR COALESCE(public.is_active_visit_participant(v_uid, p_registro_id), false);

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_expected_version, -1) <> v_reg.version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF v_reg.cultura_id IS NULL THEN
    RAISE EXCEPTION 'cultura_obrigatoria' USING ERRCODE = '23514', DETAIL = 'invalid_request';
  END IF;

  SELECT count(*) INTO v_diag_count
    FROM public.visita_diagnosticos
   WHERE registro_id = p_registro_id;
  IF v_diag_count = 0 THEN
    RAISE EXCEPTION 'diagnostico_obrigatorio' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_checkin_count
    FROM public.visitas_checkin
   WHERE registro_consultor_id = p_registro_id;
  IF v_checkin_count = 0 THEN
    RAISE EXCEPTION 'checkin_obrigatorio' USING ERRCODE = '23514';
  END IF;

  v_new_version := v_reg.version + 1;

  UPDATE public.registros_consultor
     SET status = 'finalizado'::status_registro_consultor,
         finalized_at = now(),
         finalized_by = v_uid,
         version = v_new_version,
         pdf_status = COALESCE(pdf_status, 'pending'),
         updated_at = now()
   WHERE id = p_registro_id;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, v_uid, 'visita_finalizada', 'Visita finalizada via rpc_finalizar_visita_v2');

  RETURN jsonb_build_object(
    'id', p_registro_id,
    'status', 'finalizado',
    'version', v_new_version,
    'finalized_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._assert_visita_editavel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_upsert_recomendacao_visita(uuid, uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_finalizar_visita_v2(uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public._assert_visita_editavel(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_recomendacao_visita(uuid, uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_finalizar_visita_v2(uuid, integer) TO authenticated, service_role;