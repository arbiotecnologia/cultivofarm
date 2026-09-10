-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É UMA MIGRATION HISTÓRICA
-- Origem: supabase/migrations/20260805182000_visita_workspace_runtime_fix.sql
-- SHA-256 da origem: c1ab4928f6c83acbcea24e4316f3ffde97bee1da8a7decfb29389011fd57fee3
-- Gerado por: restoration/promocao-producao-h9/gerar-promotion-sql.py (determinístico)
-- Transformação aplicada: leitura de marcador -> GUC; literal de ref homologacao -> producao
-- O arquivo de origem NÃO foi alterado.
--
-- Guarda canônica: o runner valida o ref do alvo por canal externo e só então
-- executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela marcadora
-- de homologação é consultada.
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
-- CORRECAO RUNTIME FINAL — VISITA TECNICA
-- Escopo: staging ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk recusada.
--
-- P0-1: rpc_get_visita_workspace falhava com 42703 ao projetar
--       ordens_servico_onfarm.data_prevista (coluna inexistente). A coluna real
--       e data_recomendada. O contrato JSON e preservado por alias
--       ('data_prevista'), sem quebrar consumidores.
--       Auditoria completa de colunas referenciadas pela funcao contra
--       information_schema: nenhuma outra coluna inexistente.
--       Preservados: SECURITY DEFINER, STABLE, search_path=public,
--       can_view_technical_visit, projecoes por audiencia e RLS.
--
-- P0-2: rpc_upsert_recomendacao_visita convertia QUALQUER unique_violation em
--       version_conflict. Agora so converte quando CONSTRAINT_NAME =
--       'uq_rec_registro_client_uuid'; as demais sao relancadas intactas.
--
-- Idempotente: apenas CREATE OR REPLACE + REVOKE/GRANT. Sem DROP, sem DDL
-- destrutivo, sem alteracao de dados.
-- Rollback: restoration/visita-portais-tecnicos/rollback-runtime-final.sql
-- Postcheck: restoration/visita-portais-tecnicos/postcheck-runtime-final.sql
-- ============================================================================

DO $guard$
DECLARE
  c_expected constant text := 'navfzbwgwzruipouyfnk';
  c_prod     constant text := 'navfzbwgwzruipouyfnk';
  v_rows integer;
  v_ref  text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: tabela public._fiscal_staging_marker inexistente';
  END IF;

  SELECT count(*) INTO v_rows
    FROM public._fiscal_staging_marker
   WHERE marker = 'STAGING';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'GUARD_ABORT: esperada exatamente 1 linha marker=STAGING, encontradas %', v_rows;
  END IF;

  SELECT current_setting('promocao.target_ref', true) INTO v_ref;

  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: project_ref nulo no marcador de staging';
  END IF;
  IF v_ref = c_prod THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente de producao recusado';
  END IF;
  IF v_ref IS DISTINCT FROM c_expected THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', v_ref;
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.rpc_get_visita_workspace(p_registro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor%ROWTYPE;
  v_result jsonb;
  v_is_admin boolean;
  v_is_manager boolean;
  v_can_manage boolean;
  v_editable boolean;
  v_is_participant boolean;
  v_internal boolean;          -- audiência interna (admin/gestor/participante/responsável)
  v_released boolean;          -- conteúdo formalmente liberado ao produtor
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registro_inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_view_technical_visit(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;

  v_is_admin       := public.has_role(v_uid, 'administrador');
  v_is_manager     := public.is_visit_org_manager(v_uid, p_registro_id);
  v_can_manage     := public.can_manage_technical_visit(v_uid, p_registro_id);
  v_editable       := public.is_technical_visit_editable_status(v_reg.status::text);
  v_is_participant := public.is_active_visit_participant(v_uid, p_registro_id);

  v_internal := v_is_admin OR v_is_manager OR v_is_participant
                OR public.is_visit_responsible(v_uid, p_registro_id)
                OR v_can_manage;
  v_released := v_reg.status::text IN ('aprovado', 'convertido_os');

  SELECT jsonb_build_object(
    'audience', CASE WHEN v_internal THEN 'interna' ELSE 'produtor' END,
    'registro', jsonb_build_object(
      'id', v_reg.id,
      'codigo_visita', v_reg.codigo_visita,
      'status', v_reg.status,
      'version', v_reg.version,
      'cliente_id', v_reg.cliente_id,
      'fazenda_id', v_reg.fazenda_id,
      'talhao_id', v_reg.talhao_id,
      'cultura_id', v_reg.cultura_id,
      'solicitacao_id', v_reg.solicitacao_id,
      'registro_origem_id', v_reg.registro_origem_id,
      'data_vistoria', v_reg.data_vistoria,
      'tipo_visita', v_reg.tipo_visita,
      'natureza_registro', v_reg.natureza_registro,
      'objetivo_visita', v_reg.objetivo_visita,
      'safra', v_reg.safra,
      'fase_fenologica', v_reg.fase_fenologica,
      'area_hectares', v_reg.area_hectares,
      'tipo_demanda', v_reg.tipo_demanda,
      'problema_principal', v_reg.problema_principal,
      'problema_secundario', v_reg.problema_secundario,
      'categoria_problema', v_reg.categoria_problema,
      'nivel_pressao', v_reg.nivel_pressao,
      'percentual_area_afetada', v_reg.percentual_area_afetada,
      'localizacao_na_area', v_reg.localizacao_na_area,
      'condicoes_climaticas_observadas', v_reg.condicoes_climaticas_observadas,
      'urgencia', v_reg.urgencia,
      'risco_produtivo', v_reg.risco_produtivo,
      'necessidade_intervencao', v_reg.necessidade_intervencao,
      'acao_realizada', v_reg.acao_realizada,
      'proxima_acao_recomendada', v_reg.proxima_acao_recomendada,
      'data_proxima_visita', v_reg.data_proxima_visita,
      'pdf_status', v_reg.pdf_status,
      -- campos internos somente para audiência interna
      'observacoes_tecnicas', CASE WHEN v_internal THEN v_reg.observacoes_tecnicas END,
      'historico_resumido',   CASE WHEN v_internal THEN v_reg.historico_resumido END,
      'hora_inicio',          CASE WHEN v_internal THEN v_reg.hora_inicio END,
      'hora_fim',             CASE WHEN v_internal THEN v_reg.hora_fim END,
      'client_uuid',          CASE WHEN v_internal THEN v_reg.client_uuid END,
      'consultor_responsavel', CASE WHEN v_internal THEN v_reg.consultor_responsavel END,
      'created_by',           CASE WHEN v_internal THEN v_reg.created_by END,
      'finalized_at',         CASE WHEN v_internal THEN v_reg.finalized_at END,
      'finalized_by',         CASE WHEN v_internal THEN v_reg.finalized_by END,
      'created_at',           v_reg.created_at,
      'updated_at',           v_reg.updated_at
    ),
    'version', v_reg.version,
    'status', v_reg.status,
    'permissions', jsonb_build_object(
      'can_view', true,
      'can_manage', v_can_manage,
      'can_edit', v_can_manage AND v_editable,
      'can_checkin', public.can_checkin_technical_visit(v_uid, p_registro_id),
      'can_checkout', public.can_checkout_technical_visit(v_uid, p_registro_id),
      'can_approve', (v_is_admin OR v_is_manager),
      'can_manage_team', (v_is_admin OR v_is_manager OR public.is_visit_responsible(v_uid, p_registro_id)),
      'can_convert_os', (v_is_admin OR v_is_manager),
      'can_view_internal', v_internal,
      'is_editable_status', v_editable,
      'is_admin', v_is_admin,
      'is_manager', v_is_manager,
      'is_participant', v_is_participant
    ),
    'cliente', (SELECT jsonb_build_object('id', c.id, 'nome', c.nome, 'codigo_cliente', c.codigo_cliente)
                  FROM public.clientes c WHERE c.id = v_reg.cliente_id),
    'fazenda', (SELECT jsonb_build_object('id', f.id, 'nome', f.nome, 'municipio', f.municipio, 'estado', f.estado)
                  FROM public.fazendas f WHERE f.id = v_reg.fazenda_id),
    'talhao',  (SELECT jsonb_build_object('id', t.id, 'nome', t.nome, 'area_hectares', t.area_hectares)
                  FROM public.talhoes t WHERE t.id = v_reg.talhao_id),
    'cultura', (SELECT jsonb_build_object('id', cu.id, 'nome', cu.nome)
                  FROM public.culturas cu WHERE cu.id = v_reg.cultura_id),
    'solicitacao', (SELECT jsonb_build_object(
                        'id', s.id, 'numero_solicitacao', s.numero_solicitacao,
                        'status', s.status, 'tipo_demanda', s.tipo_demanda,
                        'urgencia', s.urgencia,
                        'data_prevista_atendimento', s.data_prevista_atendimento,
                        'descricao', CASE WHEN v_internal THEN s.descricao END)
                      FROM public.portal_solicitacoes s WHERE s.id = v_reg.solicitacao_id),

    'equipe', CASE WHEN v_internal THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', a.id, 'user_id', a.user_id, 'role', a.role,
                 'is_active', a.is_active, 'assigned_at', a.assigned_at,
                 'removed_at', a.removed_at)
               ORDER BY a.assigned_at)
          FROM public.technical_visit_assignments a
         WHERE a.registro_consultor_id = p_registro_id), '[]'::jsonb) ELSE '[]'::jsonb END,

    'checkins', CASE WHEN v_internal THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', ck.id, 'tipo_checkin', ck.tipo_checkin, 'status', ck.status,
                 'data_hora_checkin', ck.data_hora_checkin,
                 'latitude', ck.latitude, 'longitude', ck.longitude,
                 'precisao_gps', ck.precisao_gps,
                 'justificativa_sem_gps', ck.justificativa_sem_gps,
                 'observacoes', ck.observacoes,
                 'has_foto', (ck.foto_path IS NOT NULL OR ck.foto_url IS NOT NULL),
                 'client_uuid', ck.client_uuid)
               ORDER BY ck.created_at)
          FROM public.visitas_checkin ck
         WHERE ck.registro_consultor_id = p_registro_id), '[]'::jsonb) ELSE '[]'::jsonb END,

    'campo', (SELECT jsonb_build_object(
                  'id', vc.id, 'area_avaliada_ha', vc.area_avaliada_ha,
                  'fase_fenologica', vc.fase_fenologica,
                  'estande_plantas_ha', vc.estande_plantas_ha,
                  'uniformidade', vc.uniformidade,
                  'observacoes_campo', vc.observacoes_campo,
                  'dados_extras', vc.dados_extras,
                  'versao', vc.versao, 'updated_at', vc.updated_at)
                FROM public.visitas_campo vc WHERE vc.registro_consultor_id = p_registro_id),

    'diagnosticos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', d.id, 'problema', d.problema, 'categoria', d.categoria,
                 'severidade', d.severidade, 'incidencia', d.incidencia,
                 'descricao', d.descricao, 'localizacao', d.localizacao,
                 'urgencia', d.urgencia, 'risco', d.risco, 'intervencao', d.intervencao,
                 'versao', d.versao, 'created_at', d.created_at)
               ORDER BY d.created_at)
          FROM public.visita_diagnosticos d
         WHERE d.registro_id = p_registro_id), '[]'::jsonb),

    'evidencias', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', ar.id, 'tipo_arquivo', ar.tipo_arquivo,
                 'categoria_arquivo', ar.categoria_arquivo,
                 'tipo_midia', ar.tipo_midia, 'legenda', ar.legenda,
                 'foto_principal', ar.foto_principal, 'ponto_area', ar.ponto_area,
                 'nome_arquivo', ar.nome_arquivo,
                 'duracao_segundos', ar.duracao_segundos,
                 'uploaded_at', ar.uploaded_at,
                 'has_arquivo', (ar.arquivo_path IS NOT NULL OR ar.arquivo_url IS NOT NULL))
               ORDER BY ar.uploaded_at)
          FROM public.registros_consultor_arquivos ar
         WHERE ar.registro_consultor_id = p_registro_id), '[]'::jsonb),

    'recomendacoes', CASE WHEN v_internal OR v_released THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', r.id, 'objetivo_recomendacao', r.objetivo_recomendacao,
                 'estrategia_manejo', r.estrategia_manejo,
                 'recomendacao_tecnica', r.recomendacao_tecnica,
                 'produto_biologico_sugerido_id', r.produto_biologico_sugerido_id,
                 'microrganismo_id', r.microrganismo_id,
                 'dose_recomendada_valor', r.dose_recomendada_valor,
                 'dose_recomendada_unidade', r.dose_recomendada_unidade,
                 'volume_calda', r.volume_calda,
                 'volume_total_recomendado', r.volume_total_recomendado,
                 'modo_aplicacao', r.modo_aplicacao,
                 'momento_aplicacao', r.momento_aplicacao,
                 'numero_aplicacoes', r.numero_aplicacoes,
                 'intervalo_aplicacoes', r.intervalo_aplicacoes,
                 'compatibilidade_observacoes', r.compatibilidade_observacoes,
                 'cuidados_operacionais', r.cuidados_operacionais,
                 'observacoes_finais', r.observacoes_finais,
                 'encaminhar_para_os', r.encaminhar_para_os,
                 'versao', r.versao, 'created_at', r.created_at)
               ORDER BY r.created_at)
          FROM public.registros_consultor_recomendacoes r
         WHERE r.registro_consultor_id = p_registro_id), '[]'::jsonb) ELSE '[]'::jsonb END,

    'comentarios', CASE WHEN v_internal THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', cm.id, 'recomendacao_id', cm.recomendacao_id,
                 'autor_tipo', cm.autor_tipo, 'autor_nome', cm.autor_nome,
                 'mensagem', cm.mensagem, 'created_at', cm.created_at)
               ORDER BY cm.created_at)
          FROM public.recomendacao_comentarios cm
          JOIN public.registros_consultor_recomendacoes r2 ON r2.id = cm.recomendacao_id
         WHERE r2.registro_consultor_id = p_registro_id), '[]'::jsonb) ELSE '[]'::jsonb END,

    'aprovacoes', CASE WHEN v_internal THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', ap.id, 'status_aprovacao', ap.status_aprovacao,
                 'comentario_gestor', ap.comentario_gestor,
                 'aprovado_por_role', ap.aprovado_por_role,
                 'data_aprovacao', ap.data_aprovacao,
                 'override', ap.override, 'created_at', ap.created_at)
               ORDER BY ap.created_at)
          FROM public.aprovacoes_tecnicas ap
         WHERE ap.registro_consultor_id = p_registro_id), '[]'::jsonb) ELSE '[]'::jsonb END,

    'timeline', CASE WHEN v_internal THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', l.id, 'acao', l.acao, 'descricao', l.descricao,
                 'data_hora', l.data_hora, 'created_at', l.created_at,
                 'metadata', l.metadata)
               ORDER BY l.created_at)
          FROM public.visitas_logs l
         WHERE l.registro_consultor_id = p_registro_id), '[]'::jsonb) ELSE '[]'::jsonb END,

    'monitoramento', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', m.id, 'tipo', m.tipo,
                 'data_referencia', m.data_referencia, 'enviado_em', m.enviado_em)
               ORDER BY m.enviado_em)
          FROM public.monitoramento_avisos m
         WHERE m.registro_consultor_id = p_registro_id), '[]'::jsonb),

    'ordens_servico', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', os.id, 'numero_os', os.numero_os, 'status', os.status,
                 -- contrato JSON preservado por alias: coluna real e os.data_recomendada
                 'data_prevista', os.data_recomendada, 'created_at', os.created_at)
               ORDER BY os.created_at)
          FROM public.ordens_servico_onfarm os
         WHERE os.registro_consultor_id = p_registro_id), '[]'::jsonb),

    'retornos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', rr.id, 'status', rr.status,
                 'data_vistoria', rr.data_vistoria, 'tipo_visita', rr.tipo_visita))
          FROM public.registros_consultor rr
         WHERE rr.registro_origem_id = p_registro_id), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

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
  v_con text;
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
      -- Somente a corrida no indice de idempotencia vira version_conflict.
      -- Qualquer outra unique_violation e relancada sem mascaramento.
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      IF v_con = 'uq_rec_registro_client_uuid' THEN
        RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0001';
      END IF;
      RAISE;
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

-- ---------------------------------------------------------------------------
-- Grants: fail-closed (sem PUBLIC, sem anon)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_get_visita_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_visita_workspace(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_upsert_recomendacao_visita(uuid, uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_recomendacao_visita(uuid, uuid, jsonb, integer) TO authenticated;
