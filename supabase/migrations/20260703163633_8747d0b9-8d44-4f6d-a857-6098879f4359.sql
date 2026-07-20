
-- FASE 4.5: RPCs agregadas do BI Operacional

-- Índice auxiliar
CREATE INDEX IF NOT EXISTS idx_mv_fluxo_data_prevista ON public.mv_fluxo_visita_tecnica (data_prevista_atendimento);

-- ==============================================================
-- 1) RPC agregada: Esteira Laboratório
-- ==============================================================
CREATE OR REPLACE FUNCTION public.rpc_bi_esteira_resumo(
  p_data_inicio timestamptz DEFAULT (now() - interval '30 days'),
  p_data_fim    timestamptz DEFAULT now(),
  p_cliente_id  uuid DEFAULT NULL,
  p_fazenda_id  uuid DEFAULT NULL,
  p_produto_id  uuid DEFAULT NULL,
  p_microrganismo_id uuid DEFAULT NULL,
  p_origem_os   text DEFAULT NULL,
  p_status      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF NOT public.can_view_bi_operacional(v_uid) THEN
    RETURN jsonb_build_object(
      'total_os', 0, 'ok', false, 'reason', 'sem_permissao'
    );
  END IF;

  WITH base AS (
    SELECT m.*
    FROM public.mv_esteira_laboratorio m
    WHERE m.created_at >= p_data_inicio
      AND m.created_at <= p_data_fim
      AND (p_cliente_id IS NULL OR m.cliente_id = p_cliente_id)
      AND (p_fazenda_id IS NULL OR m.fazenda_id = p_fazenda_id)
      AND (p_produto_id IS NULL OR m.produto_id = p_produto_id)
      AND (p_microrganismo_id IS NULL OR m.microrganismo_id = p_microrganismo_id)
      AND (p_origem_os IS NULL OR m.origem_os = p_origem_os)
      AND (p_status IS NULL OR m.status_esteira_oficial = p_status)
      -- Escopo por consultor/técnico
      AND (
        public.has_role(v_uid, 'administrador') OR public.has_role(v_uid, 'gestor')
        OR public.has_role(v_uid, 'administrativo') OR public.has_role(v_uid, 'producao')
        OR public.has_role(v_uid, 'financeiro')
        OR (
          (public.has_role(v_uid, 'consultor_tecnico') OR public.has_role(v_uid, 'tecnico_agronomo'))
          AND m.cliente_id = ANY (public.get_cliente_ids_for_user(v_uid))
        )
      )
  )
  SELECT jsonb_build_object(
    'total_os', count(*),
    'os_abertas', count(*) FILTER (WHERE status_os NOT IN ('finalizada','cancelada')),
    'os_finalizadas', count(*) FILTER (WHERE status_os = 'finalizada'),
    'os_atrasadas', count(*) FILTER (WHERE atrasado = true),
    'aguardando_cq', count(*) FILTER (WHERE cq_resultado IS NULL AND lote_id IS NOT NULL),
    'cq_aprovado', count(*) FILTER (WHERE cq_resultado = 'aprovado'),
    'cq_reprovado', count(*) FILTER (WHERE cq_resultado = 'reprovado'),
    'envases_realizados', count(*) FILTER (WHERE envase_id IS NOT NULL),
    'entregas_realizadas', count(*) FILTER (WHERE entrega_id IS NOT NULL),
    'entregas_confirmadas', count(*) FILTER (WHERE entrega_confirmada = true),
    'pendencias_bloqueantes', count(*) FILTER (WHERE array_length(bloqueios, 1) > 0),
    'pode_finalizar', count(*) FILTER (WHERE pode_finalizar = true),
    'volume_solicitado_l', coalesce(sum(volume_solicitado_l), 0),
    'tempo_medio_os_ate_entrega_h', coalesce(avg(tempo_os_ate_entrega), 0),
    'tempo_medio_cq_ate_envase_h', coalesce(avg(tempo_cq_ate_envase), 0),
    'por_status', (
      SELECT jsonb_object_agg(coalesce(status_esteira_oficial,'sem_status'), qtd)
      FROM (SELECT status_esteira_oficial, count(*) AS qtd FROM base GROUP BY status_esteira_oficial) s
    ),
    'por_origem', (
      SELECT jsonb_object_agg(coalesce(origem_os,'sem_origem'), qtd)
      FROM (SELECT origem_os, count(*) AS qtd FROM base GROUP BY origem_os) s
    ),
    'ok', true
  ) INTO v_result FROM base;

  RETURN coalesce(v_result, jsonb_build_object('total_os', 0, 'ok', true));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bi_esteira_resumo(timestamptz,timestamptz,uuid,uuid,uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bi_esteira_resumo(timestamptz,timestamptz,uuid,uuid,uuid,uuid,text,text) TO authenticated;

-- ==============================================================
-- 2) RPC agregada: Fluxo de Visitas
-- ==============================================================
CREATE OR REPLACE FUNCTION public.rpc_bi_fluxo_visitas_resumo(
  p_data_inicio timestamptz DEFAULT (now() - interval '30 days'),
  p_data_fim    timestamptz DEFAULT now(),
  p_cliente_id  uuid DEFAULT NULL,
  p_fazenda_id  uuid DEFAULT NULL,
  p_consultor_id uuid DEFAULT NULL,
  p_status_solicitacao text DEFAULT NULL,
  p_status_visita text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF NOT public.can_view_bi_operacional(v_uid) THEN
    RETURN jsonb_build_object('total_visitas', 0, 'ok', false, 'reason', 'sem_permissao');
  END IF;

  WITH base AS (
    SELECT m.*
    FROM public.mv_fluxo_visita_tecnica m
    WHERE m.created_at >= p_data_inicio
      AND m.created_at <= p_data_fim
      AND (p_cliente_id IS NULL OR m.cliente_id = p_cliente_id)
      AND (p_fazenda_id IS NULL OR m.fazenda_id = p_fazenda_id)
      AND (p_consultor_id IS NULL OR m.consultor_id = p_consultor_id)
      AND (p_status_solicitacao IS NULL OR m.status_solicitacao = p_status_solicitacao)
      AND (p_status_visita IS NULL OR m.status_visita = p_status_visita)
      AND (
        public.has_role(v_uid, 'administrador') OR public.has_role(v_uid, 'gestor')
        OR public.has_role(v_uid, 'administrativo') OR public.has_role(v_uid, 'producao')
        OR public.has_role(v_uid, 'financeiro')
        OR (
          (public.has_role(v_uid, 'consultor_tecnico') OR public.has_role(v_uid, 'tecnico_agronomo'))
          AND (m.consultor_id = v_uid OR m.cliente_id = ANY (public.get_cliente_ids_for_user(v_uid)))
        )
      )
  )
  SELECT jsonb_build_object(
    'total_visitas', count(*),
    'solicitacoes_abertas', count(*) FILTER (WHERE status_solicitacao NOT IN ('concluida','cancelada','convertida_os')),
    'com_checkin', count(*) FILTER (WHERE possui_checkin = true),
    'com_diagnostico', count(*) FILTER (WHERE possui_diagnostico = true),
    'com_evidencias', count(*) FILTER (WHERE possui_evidencias = true),
    'com_recomendacao', count(*) FILTER (WHERE possui_recomendacao = true),
    'convertidas_em_os', count(*) FILTER (WHERE possui_os = true),
    'aprovadas', count(*) FILTER (WHERE status_aprovacao = 'aprovado'),
    'em_atraso', count(*) FILTER (WHERE array_length(bloqueios, 1) > 0),
    'dias_medios_em_aberto', coalesce(avg(dias_em_aberto), 0),
    'tempo_medio_solicitacao_ate_checkin_h', coalesce(avg(tempo_solicitacao_ate_checkin), 0),
    'por_status_solicitacao', (
      SELECT jsonb_object_agg(coalesce(status_solicitacao,'sem_status'), qtd)
      FROM (SELECT status_solicitacao, count(*) AS qtd FROM base GROUP BY status_solicitacao) s
    ),
    'por_status_visita', (
      SELECT jsonb_object_agg(coalesce(status_visita,'sem_status'), qtd)
      FROM (SELECT status_visita, count(*) AS qtd FROM base GROUP BY status_visita) s
    ),
    'por_consultor', (
      SELECT jsonb_object_agg(coalesce(consultor_nome, consultor_id::text, 'sem_consultor'), qtd)
      FROM (SELECT consultor_id, consultor_nome, count(*) AS qtd FROM base GROUP BY consultor_id, consultor_nome ORDER BY count(*) DESC LIMIT 20) s
    ),
    'ok', true
  ) INTO v_result FROM base;

  RETURN coalesce(v_result, jsonb_build_object('total_visitas', 0, 'ok', true));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bi_fluxo_visitas_resumo(timestamptz,timestamptz,uuid,uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bi_fluxo_visitas_resumo(timestamptz,timestamptz,uuid,uuid,uuid,text,text) TO authenticated;
