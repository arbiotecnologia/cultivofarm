-- H9-D-L5 forward | staging ikaauvsflpmamgxmkhoq
-- Correcao minima de oraculos de existencia (enumeracao) em 3 RPCs SECURITY DEFINER
-- auditadas no nivel L5. Assinaturas, retornos, callsites e regras de negocio preservados.
-- Idempotente (CREATE OR REPLACE) e reversivel pelo rollback correspondente.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_enviar_visita_aprovacao(p_registro_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_is_admin boolean;
  v_new_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);

  -- H9-D-L5: resolucao e autorizacao em consulta unica escopada.
  -- Registro inexistente e registro alheio produzem o MESMO erro generico,
  -- eliminando o oraculo de existencia (enumeracao de registros_consultor).
  SELECT r.* INTO v_reg
    FROM public.registros_consultor r
   WHERE r.id = p_registro_id
     AND (
       v_is_admin
       OR r.created_by = v_uid
       OR r.consultor_responsavel = v_uid
       OR (r.cliente_id IS NOT NULL
           AND public.has_active_user_cliente_access(v_uid, r.cliente_id, ARRAY['execute','manage']))
     )
   FOR UPDATE;

  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF v_reg.status::text <> 'finalizado' THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_expected_version, -1) <> v_reg.version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001';
  END IF;

  v_new_version := v_reg.version + 1;

  UPDATE public.registros_consultor
     SET status = 'enviado_aprovacao'::status_registro_consultor,
         version = v_new_version,
         updated_at = now()
   WHERE id = p_registro_id;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
    VALUES (p_registro_id, v_uid, 'enviado_aprovacao', 'Visita enviada para aprovação via rpc_enviar_visita_aprovacao');

  RETURN jsonb_build_object(
    'id', p_registro_id,
    'status', 'enviado_aprovacao',
    'version', v_new_version
  );
END;
$function$;

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

  -- H9-D-L5: autorizacao ANTES de qualquer leitura; ausencia e falta de
  -- permissao retornam o MESMO erro generico (sem oraculo de existencia).
  IF NOT public.can_view_technical_visit(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF NOT FOUND THEN
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

CREATE OR REPLACE FUNCTION public.rpc_get_my_visit_by_client_uuid(p_client_uuid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.registros_consultor%ROWTYPE;
  v_is_admin boolean;
  v_is_gestor boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_client_uuid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
  END IF;

  v_is_admin  := public.has_role(v_uid, 'administrador');
  v_is_gestor := public.has_role(v_uid, 'gestor');

  -- H9-D-L5: resolucao e autorizacao em consulta unica escopada.
  -- client_uuid inexistente e client_uuid alheio retornam o MESMO payload
  -- generico ('not_found'), eliminando o oraculo de existencia.
  SELECT r.* INTO v_row
    FROM public.registros_consultor r
   WHERE r.client_uuid = p_client_uuid
     AND (
       v_is_admin
       OR r.consultor_responsavel = v_uid
       OR (v_is_gestor
           AND r.cliente_id IS NOT NULL
           AND public.has_active_user_cliente_access(
                 v_uid, r.cliente_id, ARRAY['view','execute','manage']))
     )
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'registro_id', v_row.id,
    'status', v_row.status::text,
    'version', v_row.version,
    'pdf_status', v_row.pdf_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_enviar_visita_aprovacao(uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_visita_workspace(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_my_visit_by_client_uuid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_enviar_visita_aprovacao(uuid,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_visita_workspace(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_visit_by_client_uuid(uuid) TO authenticated, service_role;
COMMIT;
