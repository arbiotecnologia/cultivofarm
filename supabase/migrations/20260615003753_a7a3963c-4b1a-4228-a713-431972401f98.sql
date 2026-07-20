
-- Fase 13.1 — Portal Executivo

-- 1) Helper function (executivo permissions)
CREATE OR REPLACE FUNCTION public.is_executivo(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid
      AND role IN ('administrador','gestor')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_executivo(uuid) TO authenticated, service_role;

-- 2) Preferences table
CREATE TABLE IF NOT EXISTS public.executivo_user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  periodo_padrao text NOT NULL DEFAULT '30_dias',
  cliente_id uuid NULL,
  fazenda_id uuid NULL,
  cards_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  filtros_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  layout_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT executivo_user_preferences_periodo_chk CHECK (
    periodo_padrao IN ('hoje','7_dias','15_dias','30_dias','safra_atual','personalizado')
  ),
  CONSTRAINT executivo_user_preferences_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_executivo_user_preferences_user_id ON public.executivo_user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_executivo_user_preferences_cliente_id ON public.executivo_user_preferences(cliente_id);
CREATE INDEX IF NOT EXISTS idx_executivo_user_preferences_fazenda_id ON public.executivo_user_preferences(fazenda_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.executivo_user_preferences TO authenticated;
GRANT ALL ON public.executivo_user_preferences TO service_role;

ALTER TABLE public.executivo_user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exec_prefs_select_own_or_admin" ON public.executivo_user_preferences;
CREATE POLICY "exec_prefs_select_own_or_admin"
ON public.executivo_user_preferences
FOR SELECT TO authenticated
USING (
  public.is_executivo(auth.uid())
  AND (user_id = auth.uid() OR public.has_role(auth.uid(),'administrador'))
);

DROP POLICY IF EXISTS "exec_prefs_modify_own" ON public.executivo_user_preferences;
CREATE POLICY "exec_prefs_modify_own"
ON public.executivo_user_preferences
FOR ALL TO authenticated
USING (user_id = auth.uid() AND public.is_executivo(auth.uid()))
WITH CHECK (user_id = auth.uid() AND public.is_executivo(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_executivo_user_preferences_updated_at ON public.executivo_user_preferences;
CREATE TRIGGER trg_executivo_user_preferences_updated_at
BEFORE UPDATE ON public.executivo_user_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) RPC: resumo geral
CREATE OR REPLACE FUNCTION public.rpc_executivo_resumo_geral(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_periodo text := COALESCE(p_filtros->>'periodo','30_dias');
  v_data_inicio timestamptz;
  v_data_fim timestamptz := COALESCE((p_filtros->>'data_fim')::timestamptz, now());
  v_cliente_id uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda_id uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_resumo jsonb := '{}'::jsonb;
  v_indispon text[] := ARRAY[]::text[];
  v_solicitacoes_abertas int := 0;
  v_visitas_pendentes int := 0;
  v_recomendacoes_pendentes int := 0;
  v_os_ativas int := 0;
  v_os_atrasadas int := 0;
  v_lotes_em_producao int := 0;
  v_cq_pendente int := 0;
  v_envases_pendentes int := 0;
  v_embalagens_em_estoque int := 0;
  v_embalagens_sem_etiqueta int := 0;
  v_entregas_pendentes int := 0;
  v_entregas_sem_comprovante int := 0;
  v_entregas_nao_faturadas int := 0;
  v_alertas_criticos int := 0;
  v_alertas_altos int := 0;
  v_sla_vencidos int := 0;
  v_score int := 100;
  v_classif text := 'saudavel';
  v_motivos jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado ao Portal Executivo' USING ERRCODE = '42501';
  END IF;

  -- Resolve período
  IF (p_filtros ? 'data_inicio') AND COALESCE(p_filtros->>'data_inicio','')<>'' THEN
    v_data_inicio := (p_filtros->>'data_inicio')::timestamptz;
  ELSE
    v_data_inicio := CASE v_periodo
      WHEN 'hoje' THEN date_trunc('day', now())
      WHEN '7_dias' THEN now() - interval '7 days'
      WHEN '15_dias' THEN now() - interval '15 days'
      WHEN '30_dias' THEN now() - interval '30 days'
      WHEN 'safra_atual' THEN date_trunc('year', now())
      ELSE now() - interval '30 days'
    END;
  END IF;

  -- Solicitações abertas
  BEGIN
    SELECT count(*) INTO v_solicitacoes_abertas
    FROM public.portal_solicitacoes s
    WHERE s.status NOT IN ('concluida','cancelada','encerrada','finalizada')
      AND (v_cliente_id IS NULL OR s.cliente_id = v_cliente_id)
      AND (v_fazenda_id IS NULL OR s.fazenda_id = v_fazenda_id);
  EXCEPTION WHEN OTHERS THEN v_indispon := v_indispon || 'solicitacoes_abertas'; END;

  -- Visitas pendentes (sem checkout/checkin agendado)
  BEGIN
    SELECT count(*) INTO v_visitas_pendentes
    FROM public.visitas_checkin v
    WHERE v.status IN ('agendado','pendente','em_andamento')
      AND (v_cliente_id IS NULL OR v.cliente_id = v_cliente_id)
      AND (v_fazenda_id IS NULL OR v.fazenda_id = v_fazenda_id);
  EXCEPTION WHEN OTHERS THEN v_indispon := v_indispon || 'visitas_pendentes'; END;

  -- Recomendações pendentes (sem aprovação)
  BEGIN
    SELECT count(*) INTO v_recomendacoes_pendentes
    FROM public.aprovacoes_tecnicas a
    WHERE a.status IN ('pendente','em_analise');
  EXCEPTION WHEN OTHERS THEN v_indispon := v_indispon || 'recomendacoes_pendentes'; END;

  -- OS ativas / atrasadas
  BEGIN
    SELECT
      count(*) FILTER (WHERE o.status IN ('programada','em_andamento','aprovada')),
      count(*) FILTER (WHERE o.status IN ('programada','em_andamento','aprovada')
                       AND o.data_recomendada IS NOT NULL
                       AND o.data_recomendada::date < current_date)
    INTO v_os_ativas, v_os_atrasadas
    FROM public.ordens_servico_onfarm o
    WHERE (v_cliente_id IS NULL OR o.cliente_id = v_cliente_id)
      AND (v_fazenda_id IS NULL OR o.fazenda_id = v_fazenda_id);
  EXCEPTION WHEN OTHERS THEN v_indispon := v_indispon || 'os_ativas' || 'os_atrasadas'; END;

  -- Lotes em produção
  BEGIN
    SELECT count(*) INTO v_lotes_em_producao
    FROM public.lotes l
    WHERE l.status IN ('em_producao','iniciado','fermentacao');
  EXCEPTION WHEN OTHERS THEN v_indispon := v_indispon || 'lotes_em_producao'; END;

  -- CQ pendente (lotes sem CQ aprovado)
  BEGIN
    SELECT count(*) INTO v_cq_pendente
    FROM public.lotes l
    WHERE NOT EXISTS (
      SELECT 1 FROM public.controle_qualidade cq
      WHERE cq.lote_id = l.id AND cq.resultado = 'aprovado'
    )
    AND l.status NOT IN ('cancelado','descartado');
  EXCEPTION WHEN OTHERS THEN v_indispon := v_indispon || 'cq_pendente'; END;

  -- Envases pendentes (lotes aprovados sem envase)
  BEGIN
    SELECT count(*) INTO v_envases_pendentes
    FROM public.lotes l
    WHERE EXISTS (SELECT 1 FROM public.controle_qualidade cq WHERE cq.lote_id=l.id AND cq.resultado='aprovado')
      AND NOT EXISTS (SELECT 1 FROM public.envase e WHERE e.lote_id = l.id);
  EXCEPTION WHEN OTHERS THEN v_indispon := v_indispon || 'envases_pendentes'; END;

  -- Embalagens em estoque
  BEGIN
    SELECT
      count(*) FILTER (WHERE e.status IN ('em_estoque','disponivel','reservada','separada')),
      count(*) FILTER (WHERE e.etiqueta_id IS NULL
                        AND e.status NOT IN ('cancelada','descartada','entregue'))
    INTO v_embalagens_em_estoque, v_embalagens_sem_etiqueta
    FROM public.estoque_embalagens e
    WHERE (v_cliente_id IS NULL OR e.cliente_id IS NULL OR e.cliente_id = v_cliente_id)
      AND (v_fazenda_id IS NULL OR e.fazenda_id IS NULL OR e.fazenda_id = v_fazenda_id);
  EXCEPTION WHEN OTHERS THEN
    v_indispon := v_indispon || 'embalagens_em_estoque' || 'embalagens_sem_etiqueta';
  END;

  -- Entregas
  BEGIN
    SELECT
      count(*) FILTER (WHERE en.status IN ('pendente','programada','em_separacao','em_rota','aguardando')),
      count(*) FILTER (WHERE en.status IN ('entregue','confirmada')
                        AND (en.comprovante_id IS NULL OR en.comprovante_status IS DISTINCT FROM 'confirmado')),
      count(*) FILTER (WHERE en.status IN ('entregue','confirmada')
                        AND en.receivable_id IS NULL
                        AND COALESCE(en.financial_status,'pendente') NOT IN ('faturada','nao_faturavel'))
    INTO v_entregas_pendentes, v_entregas_sem_comprovante, v_entregas_nao_faturadas
    FROM public.entregas en
    WHERE (v_cliente_id IS NULL OR en.cliente_id = v_cliente_id);
  EXCEPTION WHEN OTHERS THEN
    v_indispon := v_indispon || 'entregas_pendentes' || 'entregas_sem_comprovante' || 'entregas_nao_faturadas';
  END;

  -- Alertas
  BEGIN
    SELECT
      count(*) FILTER (WHERE a.gravidade = 'critica' AND a.status NOT IN ('resolvido','ignorado')),
      count(*) FILTER (WHERE a.gravidade IN ('alta','alto') AND a.status NOT IN ('resolvido','ignorado')),
      count(*) FILTER (WHERE a.sla_vencido = true AND a.status NOT IN ('resolvido','ignorado'))
    INTO v_alertas_criticos, v_alertas_altos, v_sla_vencidos
    FROM public.alertas_operacionais a
    WHERE (v_cliente_id IS NULL OR a.cliente_id = v_cliente_id)
      AND (v_fazenda_id IS NULL OR a.fazenda_id = v_fazenda_id);
  EXCEPTION WHEN OTHERS THEN
    v_indispon := v_indispon || 'alertas_criticos' || 'alertas_altos' || 'sla_vencidos';
  END;

  -- Score
  IF v_alertas_criticos > 0 OR v_sla_vencidos > 0 THEN
    v_classif := 'critico'; v_score := 40;
  ELSIF (v_os_atrasadas + v_entregas_sem_comprovante + v_entregas_nao_faturadas + v_embalagens_sem_etiqueta + v_cq_pendente + v_alertas_altos) > 0 THEN
    v_classif := 'atencao'; v_score := 70;
  ELSE
    v_classif := 'saudavel'; v_score := 95;
  END IF;

  IF array_length(v_indispon,1) IS NOT NULL AND array_length(v_indispon,1) >= 5 THEN
    v_classif := 'sem_dados'; v_score := 0;
  END IF;

  IF v_alertas_criticos > 0 THEN v_motivos := v_motivos || to_jsonb(v_alertas_criticos || ' alerta(s) crítico(s)'); END IF;
  IF v_sla_vencidos > 0 THEN v_motivos := v_motivos || to_jsonb(v_sla_vencidos || ' SLA vencido(s)'); END IF;
  IF v_os_atrasadas > 0 THEN v_motivos := v_motivos || to_jsonb(v_os_atrasadas || ' OS atrasada(s)'); END IF;
  IF v_entregas_sem_comprovante > 0 THEN v_motivos := v_motivos || to_jsonb(v_entregas_sem_comprovante || ' entrega(s) sem comprovante'); END IF;
  IF v_entregas_nao_faturadas > 0 THEN v_motivos := v_motivos || to_jsonb(v_entregas_nao_faturadas || ' entrega(s) não faturada(s)'); END IF;
  IF v_embalagens_sem_etiqueta > 0 THEN v_motivos := v_motivos || to_jsonb(v_embalagens_sem_etiqueta || ' embalagem(ns) sem etiqueta'); END IF;
  IF v_cq_pendente > 0 THEN v_motivos := v_motivos || to_jsonb(v_cq_pendente || ' lote(s) com CQ pendente'); END IF;

  v_resumo := jsonb_build_object(
    'solicitacoes_abertas', v_solicitacoes_abertas,
    'visitas_pendentes', v_visitas_pendentes,
    'recomendacoes_pendentes', v_recomendacoes_pendentes,
    'os_ativas', v_os_ativas,
    'os_atrasadas', v_os_atrasadas,
    'lotes_em_producao', v_lotes_em_producao,
    'cq_pendente', v_cq_pendente,
    'envases_pendentes', v_envases_pendentes,
    'embalagens_em_estoque', v_embalagens_em_estoque,
    'embalagens_sem_etiqueta', v_embalagens_sem_etiqueta,
    'entregas_pendentes', v_entregas_pendentes,
    'entregas_sem_comprovante', v_entregas_sem_comprovante,
    'entregas_nao_faturadas', v_entregas_nao_faturadas,
    'alertas_criticos', v_alertas_criticos,
    'alertas_altos', v_alertas_altos,
    'sla_vencidos', v_sla_vencidos
  );

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('data_inicio', v_data_inicio, 'data_fim', v_data_fim, 'periodo', v_periodo),
    'resumo', v_resumo,
    'saude_operacional', jsonb_build_object('score', v_score, 'classificacao', v_classif, 'motivos', v_motivos),
    'dados_indisponiveis', to_jsonb(v_indispon),
    'gerado_em', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_executivo_resumo_geral(jsonb) TO authenticated;

-- 4) RPC gargalos
CREATE OR REPLACE FUNCTION public.rpc_executivo_gargalos(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,10),1),50);
  v_cliente_id uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda_id uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado ao Portal Executivo' USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    -- OS atrasadas
    SELECT
      'os_atrasada' AS tipo,
      'OS atrasada' AS titulo,
      COALESCE(o.numero_os::text, o.id::text) AS descricao,
      'alta'::text AS gravidade,
      o.id AS referencia_id,
      'ordens_servico_onfarm'::text AS referencia_tabela,
      c.razao_social AS cliente,
      f.nome AS fazenda,
      GREATEST(0, EXTRACT(day FROM now() - o.data_recomendada)::int) AS dias_em_aberto,
      'Reprogramar ou finalizar OS'::text AS acao_recomendada,
      o.data_recomendada AS ordenacao
    FROM public.ordens_servico_onfarm o
    LEFT JOIN public.clientes c ON c.id = o.cliente_id
    LEFT JOIN public.fazendas f ON f.id = o.fazenda_id
    WHERE o.status IN ('programada','em_andamento','aprovada')
      AND o.data_recomendada IS NOT NULL
      AND o.data_recomendada::date < current_date
      AND (v_cliente_id IS NULL OR o.cliente_id = v_cliente_id)
      AND (v_fazenda_id IS NULL OR o.fazenda_id = v_fazenda_id)

    UNION ALL
    -- Entregas sem comprovante
    SELECT
      'entrega_sem_comprovante', 'Entrega sem comprovante',
      'Entrega #' || COALESCE(en.id::text,''),
      'alta', en.id, 'entregas',
      c.razao_social, NULL,
      GREATEST(0, EXTRACT(day FROM now() - COALESCE(en.entregue_em, en.confirmada_em, en.updated_at))::int),
      'Anexar/confirmar comprovante de entrega',
      en.updated_at
    FROM public.entregas en
    LEFT JOIN public.clientes c ON c.id = en.cliente_id
    WHERE en.status IN ('entregue','confirmada')
      AND (en.comprovante_id IS NULL OR en.comprovante_status IS DISTINCT FROM 'confirmado')
      AND (v_cliente_id IS NULL OR en.cliente_id = v_cliente_id)

    UNION ALL
    -- Entregas não faturadas
    SELECT
      'entrega_nao_faturada','Entrega não faturada',
      'Entrega #' || COALESCE(en.id::text,''),
      'media', en.id, 'entregas',
      c.razao_social, NULL,
      GREATEST(0, EXTRACT(day FROM now() - COALESCE(en.entregue_em, en.confirmada_em, en.updated_at))::int),
      'Gerar faturamento desta entrega',
      en.updated_at
    FROM public.entregas en
    LEFT JOIN public.clientes c ON c.id = en.cliente_id
    WHERE en.status IN ('entregue','confirmada')
      AND en.receivable_id IS NULL
      AND COALESCE(en.financial_status,'pendente') NOT IN ('faturada','nao_faturavel')
      AND (v_cliente_id IS NULL OR en.cliente_id = v_cliente_id)

    UNION ALL
    -- Embalagens sem etiqueta
    SELECT
      'embalagem_sem_etiqueta','Embalagem sem etiqueta',
      COALESCE(eb.codigo_embalagem,'(sem código)'),
      'media', eb.id, 'estoque_embalagens',
      NULL, NULL,
      GREATEST(0, EXTRACT(day FROM now() - eb.created_at)::int),
      'Gerar/vincular etiqueta',
      eb.created_at
    FROM public.estoque_embalagens eb
    WHERE eb.etiqueta_id IS NULL
      AND eb.status NOT IN ('cancelada','descartada','entregue')

    UNION ALL
    -- Alertas críticos
    SELECT
      'alerta_critico','Alerta crítico',
      COALESCE(a.titulo,'Alerta'),
      'alta', a.id, 'alertas_operacionais',
      NULL, NULL,
      GREATEST(0, EXTRACT(day FROM now() - a.created_at)::int),
      'Resolver alerta crítico',
      a.created_at
    FROM public.alertas_operacionais a
    WHERE a.gravidade = 'critica' AND a.status NOT IN ('resolvido','ignorado')
      AND (v_cliente_id IS NULL OR a.cliente_id = v_cliente_id)
      AND (v_fazenda_id IS NULL OR a.fazenda_id = v_fazenda_id)

    UNION ALL
    -- SLA vencidos
    SELECT
      'sla_vencido','SLA vencido',
      COALESCE(a.titulo,'Alerta com SLA vencido'),
      'alta', a.id, 'alertas_operacionais',
      NULL, NULL,
      GREATEST(0, EXTRACT(day FROM now() - COALESCE(a.sla_vencido_em,a.created_at))::int),
      'Tratar pendência com SLA vencido',
      COALESCE(a.sla_vencido_em,a.created_at)
    FROM public.alertas_operacionais a
    WHERE a.sla_vencido = true AND a.status NOT IN ('resolvido','ignorado')
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(b) - 'ordenacao' ORDER BY b.gravidade DESC, b.dias_em_aberto DESC), '[]'::jsonb)
  INTO v_result
  FROM (SELECT * FROM base ORDER BY gravidade DESC, dias_em_aberto DESC LIMIT v_limit) b;

  RETURN jsonb_build_object('gargalos', v_result, 'gerado_em', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_executivo_gargalos(jsonb,int) TO authenticated;

-- 5) RPC timeline
CREATE OR REPLACE FUNCTION public.rpc_executivo_timeline_operacional(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,20),1),100);
  v_cliente_id uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado ao Portal Executivo' USING ERRCODE = '42501';
  END IF;

  WITH eventos AS (
    SELECT 'solicitacao_nova'::text AS tipo, 'Nova solicitação'::text AS descricao,
           s.created_at AS data_evento, 'solicitacoes'::text AS modulo, s.id AS referencia_id
    FROM public.portal_solicitacoes s
    WHERE (v_cliente_id IS NULL OR s.cliente_id = v_cliente_id)
    UNION ALL
    SELECT 'visita_checkin', 'Visita técnica registrada', v.created_at, 'visitas', v.id
    FROM public.visitas_checkin v
    WHERE (v_cliente_id IS NULL OR v.cliente_id = v_cliente_id)
    UNION ALL
    SELECT 'os_criada', 'OS criada', o.created_at, 'ordens_servico', o.id
    FROM public.ordens_servico_onfarm o
    WHERE (v_cliente_id IS NULL OR o.cliente_id = v_cliente_id)
    UNION ALL
    SELECT 'envase_concluido', 'Envase realizado', e.created_at, 'envase', e.id
    FROM public.envase e
    UNION ALL
    SELECT 'embalagem_movimentada', 'Embalagem movimentada', m.created_at, 'estoque_embalagens', m.id
    FROM public.estoque_embalagem_movimentacoes m
    UNION ALL
    SELECT 'entrega_atualizada', 'Entrega atualizada', en.updated_at, 'entregas', en.id
    FROM public.entregas en
    WHERE (v_cliente_id IS NULL OR en.cliente_id = v_cliente_id)
    UNION ALL
    SELECT 'alerta_aberto', COALESCE('Alerta: '||a.titulo,'Alerta aberto'), a.created_at, 'alertas', a.id
    FROM public.alertas_operacionais a
    WHERE (v_cliente_id IS NULL OR a.cliente_id = v_cliente_id)
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.data_evento DESC), '[]'::jsonb)
  INTO v_result
  FROM (SELECT * FROM eventos WHERE data_evento IS NOT NULL ORDER BY data_evento DESC LIMIT v_limit) x;

  RETURN jsonb_build_object('eventos', v_result, 'gerado_em', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_executivo_timeline_operacional(jsonb,int) TO authenticated;
