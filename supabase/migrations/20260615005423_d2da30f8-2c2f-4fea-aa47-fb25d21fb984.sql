
-- =====================================================================
-- Fase 13.1.1 — Correção das RPCs Executivas
-- Status oficiais, filtros de período, financial_status padronizado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) rpc_executivo_resumo_geral
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_executivo_resumo_geral(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_periodo text := COALESCE(p_filtros->>'periodo', '30_dias');
  v_data_inicio timestamptz;
  v_data_fim timestamptz := now();
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_resumo jsonb := '{}'::jsonb;
  v_indisp text[] := ARRAY[]::text[];
  v_motivos text[] := ARRAY[]::text[];
  v_score int := 95;
  v_class text := 'saudavel';
  v_tmp int;
  v_alertas_critico int := 0;
  v_sla_vencidos int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado ao Portal Executivo' USING ERRCODE = '42501';
  END IF;

  -- Período
  IF v_periodo = 'personalizado' AND p_filtros ? 'data_inicio' AND p_filtros ? 'data_fim' THEN
    v_data_inicio := (p_filtros->>'data_inicio')::timestamptz;
    v_data_fim := (p_filtros->>'data_fim')::timestamptz;
  ELSIF v_periodo = 'hoje' THEN
    v_data_inicio := date_trunc('day', now());
  ELSIF v_periodo = '7_dias' THEN
    v_data_inicio := now() - interval '7 days';
  ELSIF v_periodo = '15_dias' THEN
    v_data_inicio := now() - interval '15 days';
  ELSIF v_periodo = 'safra_atual' THEN
    v_data_inicio := date_trunc('year', now());
  ELSE
    v_data_inicio := now() - interval '30 days';
    v_periodo := '30_dias';
  END IF;

  -- Solicitações abertas (período histórico)
  BEGIN
    SELECT count(*) INTO v_tmp FROM portal_solicitacoes s
    WHERE s.created_at BETWEEN v_data_inicio AND v_data_fim
      AND COALESCE(s.status,'') NOT IN ('concluida','cancelada','finalizada','arquivada')
      AND (v_cliente IS NULL OR s.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR s.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('solicitacoes_abertas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'solicitacoes_abertas';
  END;

  -- Visitas pendentes via vw_fluxo_visita_tecnica
  BEGIN
    SELECT count(*) INTO v_tmp FROM vw_fluxo_visita_tecnica v
    WHERE COALESCE(v.created_at, v.updated_at) BETWEEN v_data_inicio AND v_data_fim
      AND COALESCE(v.proxima_acao,'') IN (
        'Realizar check-in','Agendar visita','Atribuir consultor',
        'Registrar diagnóstico','Inserir evidências'
      )
      AND (v_cliente IS NULL OR v.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR v.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('visitas_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'visitas_pendentes';
  END;

  -- Recomendações pendentes via view
  BEGIN
    SELECT count(*) INTO v_tmp FROM vw_fluxo_visita_tecnica v
    WHERE COALESCE(v.created_at, v.updated_at) BETWEEN v_data_inicio AND v_data_fim
      AND COALESCE(v.proxima_acao,'') IN ('Emitir recomendação','Liberar recomendação')
      AND (v_cliente IS NULL OR v.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR v.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('recomendacoes_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'recomendacoes_pendentes';
  END;

  -- OS ativas
  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o
    WHERE o.created_at BETWEEN v_data_inicio AND v_data_fim
      AND o.status::text IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')
      AND (v_cliente IS NULL OR o.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR o.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('os_ativas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'os_ativas';
  END;

  -- OS atrasadas (ativas com data_recomendada < hoje) — fotografia atual
  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o
    WHERE o.status::text IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')
      AND o.data_recomendada IS NOT NULL
      AND o.data_recomendada < current_date
      AND (v_cliente IS NULL OR o.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR o.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('os_atrasadas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'os_atrasadas';
  END;

  -- Lotes em produção (histórico)
  BEGIN
    SELECT count(*) INTO v_tmp FROM lotes l
    WHERE l.created_at BETWEEN v_data_inicio AND v_data_fim
      AND l.status::text IN ('em_producao','aguardando_cq');
    v_resumo := v_resumo || jsonb_build_object('lotes_em_producao', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'lotes_em_producao';
  END;

  -- CQ pendente: lotes aguardando_cq (fotografia)
  BEGIN
    SELECT count(*) INTO v_tmp FROM lotes l
    WHERE l.status::text = 'aguardando_cq';
    v_resumo := v_resumo || jsonb_build_object('cq_pendente', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'cq_pendente';
  END;

  -- Envases pendentes: OS com status envase (fotografia)
  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o
    WHERE o.status::text = 'envase';
    v_resumo := v_resumo || jsonb_build_object('envases_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'envases_pendentes';
  END;

  -- Embalagens em estoque (fotografia atual, sem filtro de período)
  BEGIN
    SELECT count(*) INTO v_tmp FROM estoque_embalagens e
    WHERE e.status IN ('em_estoque','reservado','separado')
      AND (v_cliente IS NULL OR e.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR e.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('embalagens_em_estoque', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'embalagens_em_estoque';
  END;

  -- Embalagens sem etiqueta (fotografia)
  BEGIN
    SELECT count(*) INTO v_tmp FROM estoque_embalagens e
    WHERE e.etiqueta_id IS NULL
      AND e.status NOT IN ('cancelado','descartado','entregue');
    v_resumo := v_resumo || jsonb_build_object('embalagens_sem_etiqueta', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'embalagens_sem_etiqueta';
  END;

  -- Entregas pendentes (separado/em_rota, fotografia)
  BEGIN
    SELECT count(*) INTO v_tmp FROM entregas en
    WHERE en.status::text IN ('separado','em_rota')
      AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR en.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('entregas_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'entregas_pendentes';
  END;

  -- Entregas sem comprovante
  BEGIN
    SELECT count(*) INTO v_tmp FROM entregas en
    WHERE en.status::text = 'entregue'
      AND (en.comprovante_id IS NULL OR COALESCE(en.comprovante_status,'') IS DISTINCT FROM 'confirmado')
      AND COALESCE(en.entregue_em, en.updated_at, en.created_at) BETWEEN v_data_inicio AND v_data_fim
      AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR en.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('entregas_sem_comprovante', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'entregas_sem_comprovante';
  END;

  -- Entregas não faturadas
  BEGIN
    SELECT count(*) INTO v_tmp FROM entregas en
    WHERE en.status::text = 'entregue'
      AND en.receivable_id IS NULL
      AND COALESCE(en.financial_status,'PENDING_BILLING') = 'PENDING_BILLING'
      AND COALESCE(en.entregue_em, en.updated_at, en.created_at) BETWEEN v_data_inicio AND v_data_fim
      AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR en.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('entregas_nao_faturadas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'entregas_nao_faturadas';
  END;

  -- Alertas críticos (fotografia, abertos)
  BEGIN
    SELECT count(*) INTO v_alertas_critico FROM alertas_operacionais a
    WHERE COALESCE(a.gravidade::text,'') = 'critica'
      AND COALESCE(a.status,'') NOT IN ('resolvido','cancelado','fechado');
    v_resumo := v_resumo || jsonb_build_object('alertas_criticos', v_alertas_critico);

    SELECT count(*) INTO v_tmp FROM alertas_operacionais a
    WHERE COALESCE(a.gravidade::text,'') = 'alta'
      AND COALESCE(a.status,'') NOT IN ('resolvido','cancelado','fechado');
    v_resumo := v_resumo || jsonb_build_object('alertas_altos', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'alertas_operacionais';
  END;

  -- SLA vencidos
  BEGIN
    SELECT count(*) INTO v_sla_vencidos FROM alertas_sla_eventos s
    WHERE COALESCE(s.status,'') IN ('vencido','overdue')
      AND s.created_at BETWEEN v_data_inicio AND v_data_fim;
    v_resumo := v_resumo || jsonb_build_object('sla_vencidos', COALESCE(v_sla_vencidos,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'sla_vencidos';
  END;

  -- Score
  IF array_length(v_indisp,1) >= 5 THEN
    v_score := 0; v_class := 'sem_dados';
    v_motivos := v_motivos || 'Fontes principais indisponíveis';
  ELSIF v_alertas_critico > 0 OR v_sla_vencidos > 0 THEN
    v_score := 40; v_class := 'critico';
    IF v_alertas_critico > 0 THEN v_motivos := v_motivos || (v_alertas_critico || ' alertas críticos abertos'); END IF;
    IF v_sla_vencidos > 0 THEN v_motivos := v_motivos || (v_sla_vencidos || ' SLA vencidos'); END IF;
  ELSE
    IF (v_resumo->>'os_atrasadas')::int > 0
       OR (v_resumo->>'entregas_sem_comprovante')::int > 0
       OR (v_resumo->>'entregas_nao_faturadas')::int > 0
       OR (v_resumo->>'embalagens_sem_etiqueta')::int > 0
       OR (v_resumo->>'cq_pendente')::int > 0
       OR (v_resumo->>'alertas_altos')::int > 0 THEN
      v_score := 70; v_class := 'atencao';
      IF (v_resumo->>'os_atrasadas')::int > 0 THEN v_motivos := v_motivos || ((v_resumo->>'os_atrasadas') || ' OS atrasadas'); END IF;
      IF (v_resumo->>'entregas_sem_comprovante')::int > 0 THEN v_motivos := v_motivos || ((v_resumo->>'entregas_sem_comprovante') || ' entregas sem comprovante'); END IF;
      IF (v_resumo->>'entregas_nao_faturadas')::int > 0 THEN v_motivos := v_motivos || ((v_resumo->>'entregas_nao_faturadas') || ' entregas não faturadas'); END IF;
      IF (v_resumo->>'embalagens_sem_etiqueta')::int > 0 THEN v_motivos := v_motivos || ((v_resumo->>'embalagens_sem_etiqueta') || ' embalagens sem etiqueta'); END IF;
      IF (v_resumo->>'cq_pendente')::int > 0 THEN v_motivos := v_motivos || ((v_resumo->>'cq_pendente') || ' lotes em CQ pendente'); END IF;
    ELSE
      v_motivos := v_motivos || 'Sem pendências críticas';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('data_inicio', v_data_inicio, 'data_fim', v_data_fim, 'periodo', v_periodo),
    'resumo', v_resumo,
    'saude_operacional', jsonb_build_object('score', v_score, 'classificacao', v_class, 'motivos', to_jsonb(v_motivos)),
    'dados_indisponiveis', to_jsonb(v_indisp),
    'gerado_em', now()
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 2) rpc_executivo_gargalos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_executivo_gargalos(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_lim int := LEAST(GREATEST(COALESCE(p_limit,10),1),50);
  v_out jsonb := '[]'::jsonb;
  v_indisp text[] := ARRAY[]::text[];
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;
  IF NOT public.is_executivo(v_uid) THEN RAISE EXCEPTION 'Acesso negado ao Portal Executivo' USING ERRCODE='42501'; END IF;

  -- OS atrasadas
  BEGIN
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
        'tipo','os_atrasada',
        'titulo','OS atrasada',
        'descricao', COALESCE(o.numero_os,'OS') || ' — status ' || o.status::text,
        'gravidade', CASE WHEN current_date - o.data_recomendada > 7 THEN 'alta' ELSE 'media' END,
        'referencia_id', o.id::text,
        'referencia_tabela','ordens_servico_onfarm',
        'cliente', c.razao_social,
        'fazenda', f.nome,
        'dias_em_aberto', (current_date - o.data_recomendada),
        'acao_recomendada','Revisar OS atrasada e atualizar status'
      ) AS x
      FROM ordens_servico_onfarm o
      LEFT JOIN clientes c ON c.id = o.cliente_id
      LEFT JOIN fazendas f ON f.id = o.fazenda_id
      WHERE o.status::text IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')
        AND o.data_recomendada < current_date
        AND (v_cliente IS NULL OR o.cliente_id = v_cliente)
        AND (v_fazenda IS NULL OR o.fazenda_id = v_fazenda)
      ORDER BY o.data_recomendada ASC
      LIMIT v_lim
    ) t;
    v_out := v_out || v_rows;
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'os_atrasadas'; END;

  -- Entregas sem comprovante
  BEGIN
    SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
        'tipo','entrega_sem_comprovante',
        'titulo','Entrega sem comprovante',
        'descricao', COALESCE(en.numero_entrega,'Entrega'),
        'gravidade','alta',
        'referencia_id', en.id::text,
        'referencia_tabela','entregas',
        'cliente', c.razao_social,
        'fazenda', f.nome,
        'dias_em_aberto', GREATEST(0, (current_date - COALESCE(en.entregue_em, en.updated_at, en.created_at)::date)),
        'acao_recomendada','Anexar/confirmar comprovante de entrega'
      ) AS x
      FROM entregas en
      LEFT JOIN clientes c ON c.id = en.cliente_id
      LEFT JOIN fazendas f ON f.id = en.fazenda_id
      WHERE en.status::text = 'entregue'
        AND (en.comprovante_id IS NULL OR COALESCE(en.comprovante_status,'') IS DISTINCT FROM 'confirmado')
        AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
        AND (v_fazenda IS NULL OR en.fazenda_id = v_fazenda)
      ORDER BY COALESCE(en.entregue_em, en.updated_at) DESC NULLS LAST
      LIMIT v_lim
    ) t;
    v_out := v_out || v_rows;
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'entregas_sem_comprovante'; END;

  -- Entregas não faturadas
  BEGIN
    SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
        'tipo','entrega_nao_faturada',
        'titulo','Entrega não faturada',
        'descricao', COALESCE(en.numero_entrega,'Entrega'),
        'gravidade','media',
        'referencia_id', en.id::text,
        'referencia_tabela','entregas',
        'cliente', c.razao_social,
        'fazenda', f.nome,
        'dias_em_aberto', GREATEST(0, (current_date - COALESCE(en.entregue_em, en.updated_at, en.created_at)::date)),
        'acao_recomendada','Gerar fatura/contas a receber para a entrega'
      ) AS x
      FROM entregas en
      LEFT JOIN clientes c ON c.id = en.cliente_id
      LEFT JOIN fazendas f ON f.id = en.fazenda_id
      WHERE en.status::text = 'entregue'
        AND en.receivable_id IS NULL
        AND COALESCE(en.financial_status,'PENDING_BILLING') = 'PENDING_BILLING'
        AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
        AND (v_fazenda IS NULL OR en.fazenda_id = v_fazenda)
      ORDER BY COALESCE(en.entregue_em, en.updated_at) DESC NULLS LAST
      LIMIT v_lim
    ) t;
    v_out := v_out || v_rows;
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'entregas_nao_faturadas'; END;

  -- Embalagens sem etiqueta
  BEGIN
    SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
        'tipo','embalagem_sem_etiqueta',
        'titulo','Embalagem sem etiqueta',
        'descricao', COALESCE(e.codigo, e.id::text),
        'gravidade','media',
        'referencia_id', e.id::text,
        'referencia_tabela','estoque_embalagens',
        'cliente', NULL,
        'fazenda', NULL,
        'dias_em_aberto', GREATEST(0,(current_date - e.created_at::date)),
        'acao_recomendada','Gerar etiqueta para a embalagem'
      ) AS x
      FROM estoque_embalagens e
      WHERE e.etiqueta_id IS NULL
        AND e.status NOT IN ('cancelado','descartado','entregue')
      ORDER BY e.created_at ASC
      LIMIT v_lim
    ) t;
    v_out := v_out || v_rows;
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'embalagens_sem_etiqueta'; END;

  -- Alertas críticos abertos
  BEGIN
    SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) INTO v_rows FROM (
      SELECT jsonb_build_object(
        'tipo','alerta_critico',
        'titulo', COALESCE(a.titulo,'Alerta crítico'),
        'descricao', COALESCE(a.descricao,''),
        'gravidade','alta',
        'referencia_id', a.id::text,
        'referencia_tabela','alertas_operacionais',
        'cliente', NULL,
        'fazenda', NULL,
        'dias_em_aberto', GREATEST(0,(current_date - a.created_at::date)),
        'acao_recomendada','Tratar alerta crítico'
      ) AS x
      FROM alertas_operacionais a
      WHERE COALESCE(a.gravidade::text,'') IN ('critica','alta')
        AND COALESCE(a.status,'') NOT IN ('resolvido','cancelado','fechado')
      ORDER BY a.created_at DESC
      LIMIT v_lim
    ) t;
    v_out := v_out || v_rows;
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'alertas_operacionais'; END;

  RETURN jsonb_build_object(
    'gargalos', v_out,
    'dados_indisponiveis', to_jsonb(v_indisp),
    'gerado_em', now()
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 3) rpc_executivo_timeline_operacional
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_executivo_timeline_operacional(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_periodo text := COALESCE(p_filtros->>'periodo','30_dias');
  v_data_inicio timestamptz;
  v_data_fim timestamptz := now();
  v_lim int := LEAST(GREATEST(COALESCE(p_limit,20),1),100);
  v_indisp text[] := ARRAY[]::text[];
  v_eventos jsonb := '[]'::jsonb;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;
  IF NOT public.is_executivo(v_uid) THEN RAISE EXCEPTION 'Acesso negado ao Portal Executivo' USING ERRCODE='42501'; END IF;

  IF v_periodo = 'personalizado' AND p_filtros ? 'data_inicio' AND p_filtros ? 'data_fim' THEN
    v_data_inicio := (p_filtros->>'data_inicio')::timestamptz;
    v_data_fim := (p_filtros->>'data_fim')::timestamptz;
  ELSIF v_periodo='hoje' THEN v_data_inicio := date_trunc('day', now());
  ELSIF v_periodo='7_dias' THEN v_data_inicio := now() - interval '7 days';
  ELSIF v_periodo='15_dias' THEN v_data_inicio := now() - interval '15 days';
  ELSIF v_periodo='safra_atual' THEN v_data_inicio := date_trunc('year', now());
  ELSE v_data_inicio := now() - interval '30 days';
  END IF;

  BEGIN
    SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'data_evento') DESC),'[]'::jsonb) INTO v_rows FROM (
      (SELECT jsonb_build_object('tipo','solicitacao','descricao','Solicitação criada','data_evento',s.created_at,'modulo','solicitacoes','referencia_id',s.id::text) AS x
        FROM portal_solicitacoes s
        WHERE s.created_at BETWEEN v_data_inicio AND v_data_fim
        ORDER BY s.created_at DESC LIMIT v_lim)
      UNION ALL
      (SELECT jsonb_build_object('tipo','os','descricao','OS '||COALESCE(o.numero_os,'')||' — '||o.status::text,'data_evento',o.updated_at,'modulo','ordens_servico','referencia_id',o.id::text)
        FROM ordens_servico_onfarm o
        WHERE o.updated_at BETWEEN v_data_inicio AND v_data_fim
        ORDER BY o.updated_at DESC LIMIT v_lim)
      UNION ALL
      (SELECT jsonb_build_object('tipo','envase','descricao','Envase registrado','data_evento',e.created_at,'modulo','envase','referencia_id',e.id::text)
        FROM envase e
        WHERE e.created_at BETWEEN v_data_inicio AND v_data_fim
        ORDER BY e.created_at DESC LIMIT v_lim)
      UNION ALL
      (SELECT jsonb_build_object('tipo','entrega','descricao','Entrega — '||en.status::text,'data_evento', COALESCE(en.entregue_em, en.updated_at, en.created_at),'modulo','entregas','referencia_id',en.id::text)
        FROM entregas en
        WHERE COALESCE(en.entregue_em, en.updated_at, en.created_at) BETWEEN v_data_inicio AND v_data_fim
        ORDER BY COALESCE(en.entregue_em, en.updated_at, en.created_at) DESC LIMIT v_lim)
      UNION ALL
      (SELECT jsonb_build_object('tipo','alerta','descricao', COALESCE(a.titulo,'Alerta'),'data_evento',a.created_at,'modulo','alertas','referencia_id',a.id::text)
        FROM alertas_operacionais a
        WHERE a.created_at BETWEEN v_data_inicio AND v_data_fim
        ORDER BY a.created_at DESC LIMIT v_lim)
    ) t;
    v_eventos := v_rows;
  EXCEPTION WHEN OTHERS THEN v_indisp := v_indisp || 'timeline_geral';
  END;

  -- Limita o total final
  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO v_eventos
  FROM (SELECT e FROM jsonb_array_elements(v_eventos) e
        ORDER BY (e->>'data_evento') DESC LIMIT v_lim) sub;

  RETURN jsonb_build_object(
    'eventos', v_eventos,
    'periodo', jsonb_build_object('data_inicio', v_data_inicio, 'data_fim', v_data_fim, 'periodo', v_periodo),
    'dados_indisponiveis', to_jsonb(v_indisp),
    'gerado_em', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_executivo_resumo_geral(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_gargalos(jsonb, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_timeline_operacional(jsonb, int) TO authenticated;
