
-- ============================================================
-- Fase 13.4.1 — Correção Alertas & Ações Executivo
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_executivo_alertas_resumo(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_periodo text := COALESCE(p_filtros->>'periodo','30_dias');
  v_data_inicio date;
  v_data_fim date := current_date;
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_gravidade text := NULLIF(p_filtros->>'gravidade','');
  v_status text := NULLIF(p_filtros->>'status','');
  v_origem text := NULLIF(p_filtros->>'origem','');
  v_resp uuid := NULLIF(p_filtros->>'responsavel_id','')::uuid;
  v_resumo jsonb;
  v_indisp jsonb := '[]'::jsonb;
  v_score int := 100;
  v_class text := 'saudavel';
  v_motivos jsonb := '[]'::jsonb;
  v_abertos int; v_crit int; v_alt int; v_sla_v int; v_sla_h int; v_sem_resp int;
  v_ent_sc int; v_ent_nf int; v_os_atr int; v_cq_pend int; v_emb_se int;
  v_cli_risco int; v_faz_risco int;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;

  v_data_inicio := CASE v_periodo
    WHEN 'hoje' THEN current_date
    WHEN '7_dias' THEN current_date - 7
    WHEN '15_dias' THEN current_date - 15
    WHEN '30_dias' THEN current_date - 30
    WHEN 'safra_atual' THEN date_trunc('year', current_date)::date
    WHEN 'personalizado' THEN COALESCE(NULLIF(p_filtros->>'data_inicio','')::date, current_date - 30)
    ELSE current_date - 30
  END;
  IF v_periodo='personalizado' THEN
    v_data_fim := COALESCE(NULLIF(p_filtros->>'data_fim','')::date, current_date);
  END IF;

  -- Alertas operacionais (período por created_at)
  SELECT
    COUNT(*) FILTER (WHERE a.status IN ('aberto','lido','reaberto')),
    COUNT(*) FILTER (WHERE a.status IN ('aberto','lido','reaberto') AND a.gravidade='critica'),
    COUNT(*) FILTER (WHERE a.status IN ('aberto','lido','reaberto') AND a.gravidade='alta'),
    COUNT(*) FILTER (WHERE a.status IN ('aberto','lido','reaberto') AND a.sla_vencido = true),
    COUNT(*) FILTER (WHERE a.status IN ('aberto','lido','reaberto') AND a.sla_vencido = false AND a.sla_resolucao_em IS NOT NULL AND a.sla_resolucao_em::date = current_date),
    COUNT(*) FILTER (WHERE a.status IN ('aberto','lido','reaberto') AND a.responsavel_id IS NULL)
  INTO v_abertos, v_crit, v_alt, v_sla_v, v_sla_h, v_sem_resp
  FROM public.alertas_operacionais a
  WHERE (v_cliente IS NULL OR a.cliente_id = v_cliente)
    AND (v_fazenda IS NULL OR a.fazenda_id = v_fazenda)
    AND (v_gravidade IS NULL OR a.gravidade = v_gravidade)
    AND (v_status IS NULL OR a.status = v_status)
    AND (v_origem IS NULL OR a.origem = v_origem)
    AND (v_resp IS NULL OR a.responsavel_id = v_resp)
    AND a.created_at::date BETWEEN v_data_inicio AND v_data_fim;

  -- Entregas sem comprovante (fazenda via OS, período por entregue_em/created_at)
  SELECT COUNT(*) INTO v_ent_sc
  FROM public.entregas en
  LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
  WHERE en.status::text='entregue'
    AND (en.comprovante_id IS NULL OR en.comprovante_status IS DISTINCT FROM 'confirmado')
    AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
    AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda)
    AND COALESCE(en.entregue_em, en.created_at)::date BETWEEN v_data_inicio AND v_data_fim;

  -- Entregas não faturadas
  SELECT COUNT(*) INTO v_ent_nf
  FROM public.entregas en
  LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
  WHERE en.status::text='entregue'
    AND en.receivable_id IS NULL
    AND COALESCE(en.financial_status,'PENDING_BILLING')='PENDING_BILLING'
    AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
    AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda)
    AND COALESCE(en.entregue_em, en.created_at)::date BETWEEN v_data_inicio AND v_data_fim;

  -- OS atrasadas (período por COALESCE(data_recomendada, created_at))
  SELECT COUNT(*) INTO v_os_atr
  FROM public.ordens_servico_onfarm o
  WHERE o.status::text IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')
    AND o.data_recomendada IS NOT NULL
    AND o.data_recomendada < current_date
    AND (v_cliente IS NULL OR o.cliente_id = v_cliente)
    AND (v_fazenda IS NULL OR o.fazenda_id = v_fazenda)
    AND COALESCE(o.data_recomendada, o.created_at::date) BETWEEN v_data_inicio AND v_data_fim;

  -- CQ pendente: indicador GLOBAL — não há vínculo confiável de lote→cliente/fazenda.
  -- Aplicamos apenas o período via lotes.created_at e marcamos como global em dados_indisponiveis se houver filtro de cliente/fazenda.
  SELECT COUNT(*) INTO v_cq_pend
  FROM public.lotes l
  WHERE NOT EXISTS (SELECT 1 FROM public.controle_qualidade cq WHERE cq.lote_id = l.id)
    AND l.created_at::date BETWEEN v_data_inicio AND v_data_fim;

  IF v_cliente IS NOT NULL OR v_fazenda IS NOT NULL THEN
    v_indisp := v_indisp || jsonb_build_object(
      'indicador','cq_pendente',
      'motivo','CQ pendente é indicador global por lote — não há vínculo confiável de lote com cliente/fazenda, portanto não respeita esses filtros.'
    );
  END IF;

  -- Embalagens sem etiqueta (período por created_at)
  SELECT COUNT(*) INTO v_emb_se
  FROM public.estoque_embalagens e
  WHERE e.etiqueta_id IS NULL
    AND e.status NOT IN ('cancelado','descartado','entregue')
    AND (v_cliente IS NULL OR e.cliente_id = v_cliente)
    AND (v_fazenda IS NULL OR e.fazenda_id = v_fazenda)
    AND e.created_at::date BETWEEN v_data_inicio AND v_data_fim;

  -- Clientes/Fazendas em risco (alertas críticos/altos abertos)
  SELECT COUNT(DISTINCT a.cliente_id) INTO v_cli_risco
  FROM public.alertas_operacionais a
  WHERE a.status IN ('aberto','lido','reaberto') AND a.gravidade IN ('critica','alta') AND a.cliente_id IS NOT NULL
    AND (v_cliente IS NULL OR a.cliente_id = v_cliente)
    AND (v_fazenda IS NULL OR a.fazenda_id = v_fazenda)
    AND a.created_at::date BETWEEN v_data_inicio AND v_data_fim;

  SELECT COUNT(DISTINCT a.fazenda_id) INTO v_faz_risco
  FROM public.alertas_operacionais a
  WHERE a.status IN ('aberto','lido','reaberto') AND a.gravidade IN ('critica','alta') AND a.fazenda_id IS NOT NULL
    AND (v_cliente IS NULL OR a.cliente_id = v_cliente)
    AND (v_fazenda IS NULL OR a.fazenda_id = v_fazenda)
    AND a.created_at::date BETWEEN v_data_inicio AND v_data_fim;

  v_resumo := jsonb_build_object(
    'alertas_abertos', v_abertos,
    'alertas_criticos', v_crit,
    'alertas_altos', v_alt,
    'sla_vencidos', v_sla_v,
    'sla_vencendo_hoje', v_sla_h,
    'alertas_sem_responsavel', v_sem_resp,
    'entregas_sem_comprovante', v_ent_sc,
    'entregas_nao_faturadas', v_ent_nf,
    'os_atrasadas', v_os_atr,
    'cq_pendente', v_cq_pend,
    'cq_pendente_escopo', 'global',
    'embalagens_sem_etiqueta', v_emb_se,
    'clientes_em_risco', v_cli_risco,
    'fazendas_em_risco', v_faz_risco
  );

  IF v_crit > 0 OR v_sla_v > 0 THEN
    v_score := 40; v_class := 'critico';
    IF v_crit > 0 THEN v_motivos := v_motivos || to_jsonb(v_crit::text || ' alertas críticos abertos'); END IF;
    IF v_sla_v > 0 THEN v_motivos := v_motivos || to_jsonb(v_sla_v::text || ' SLA vencidos'); END IF;
  ELSIF v_alt > 0 OR v_ent_sc > 0 OR v_ent_nf > 0 OR v_os_atr > 0 OR v_emb_se > 0 OR v_sem_resp > 0 THEN
    v_score := 70; v_class := 'atencao';
    IF v_alt > 0 THEN v_motivos := v_motivos || to_jsonb(v_alt::text || ' alertas altos'); END IF;
    IF v_os_atr > 0 THEN v_motivos := v_motivos || to_jsonb(v_os_atr::text || ' OS atrasadas'); END IF;
    IF v_ent_sc > 0 THEN v_motivos := v_motivos || to_jsonb(v_ent_sc::text || ' entregas sem comprovante'); END IF;
    IF v_ent_nf > 0 THEN v_motivos := v_motivos || to_jsonb(v_ent_nf::text || ' entregas não faturadas'); END IF;
    IF v_emb_se > 0 THEN v_motivos := v_motivos || to_jsonb(v_emb_se::text || ' embalagens sem etiqueta'); END IF;
    IF v_sem_resp > 0 THEN v_motivos := v_motivos || to_jsonb(v_sem_resp::text || ' alertas sem responsável'); END IF;
  ELSE
    v_score := 95; v_class := 'saudavel';
    v_motivos := v_motivos || to_jsonb('Sem pendências críticas no momento'::text);
  END IF;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('data_inicio', v_data_inicio, 'data_fim', v_data_fim),
    'resumo', v_resumo,
    'saude_alertas', jsonb_build_object('score', v_score, 'classificacao', v_class, 'motivos', v_motivos),
    'dados_indisponiveis', v_indisp,
    'gerado_em', now()
  );
END;
$function$;

-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_executivo_alertas_prioridades(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_periodo text := COALESCE(p_filtros->>'periodo','30_dias');
  v_data_inicio date;
  v_data_fim date := current_date;
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_resp uuid := NULLIF(p_filtros->>'responsavel_id','')::uuid;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,15),1),50);
  v_pool int := v_limit * 5;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;

  v_data_inicio := CASE v_periodo
    WHEN 'hoje' THEN current_date
    WHEN '7_dias' THEN current_date - 7
    WHEN '15_dias' THEN current_date - 15
    WHEN '30_dias' THEN current_date - 30
    WHEN 'safra_atual' THEN date_trunc('year', current_date)::date
    WHEN 'personalizado' THEN COALESCE(NULLIF(p_filtros->>'data_inicio','')::date, current_date - 30)
    ELSE current_date - 30
  END;
  IF v_periodo='personalizado' THEN
    v_data_fim := COALESCE(NULLIF(p_filtros->>'data_fim','')::date, current_date);
  END IF;

  WITH pool AS (
    (SELECT 
        'alerta_operacional'::text AS tipo, a.titulo, a.descricao, a.gravidade, a.status,
        COALESCE(c.razao_social, c.nome) AS cliente, f.nome AS fazenda,
        COALESCE(p.nome, 'Sem responsável') AS responsavel,
        a.sla_resolucao_em, a.sla_vencido,
        EXTRACT(DAY FROM (now() - a.created_at))::int AS dias_em_aberto,
        COALESCE(a.referencia_tabela, 'alertas_operacionais') AS referencia_tabela,
        COALESCE(a.referencia_id, a.id) AS referencia_id,
        COALESCE(a.proxima_acao, 'Avaliar e resolver na Central de Alertas') AS acao_recomendada,
        '/alertas-operacionais'::text AS rota_origem,
        CASE a.gravidade WHEN 'critica' THEN 4 WHEN 'alta' THEN 3 WHEN 'media' THEN 2 ELSE 1 END AS grav_score,
        a.created_at
      FROM public.alertas_operacionais a
      LEFT JOIN public.clientes c ON c.id = a.cliente_id
      LEFT JOIN public.fazendas f ON f.id = a.fazenda_id
      LEFT JOIN public.profiles p ON p.id = a.responsavel_id
      WHERE a.status IN ('aberto','lido','reaberto')
        AND (v_cliente IS NULL OR a.cliente_id = v_cliente)
        AND (v_fazenda IS NULL OR a.fazenda_id = v_fazenda)
        AND (v_resp IS NULL OR a.responsavel_id = v_resp)
        AND a.created_at::date BETWEEN v_data_inicio AND v_data_fim
      ORDER BY a.sla_vencido DESC, grav_score DESC, a.created_at ASC
      LIMIT v_pool)
    UNION ALL
    (SELECT 'entrega_sem_comprovante'::text,
        ('Entrega ' || substring(en.id::text,1,8))::text,
        'Entrega marcada como entregue sem comprovante confirmado'::text,
        'alta'::text, en.status::text,
        COALESCE(c.razao_social, c.nome), f.nome,
        'Operação/Administrativo'::text,
        NULL::timestamptz, false,
        EXTRACT(DAY FROM (now() - COALESCE(en.entregue_em, en.created_at)))::int,
        'entregas'::text, en.id,
        'Confirmar comprovante de entrega'::text,
        '/entregas'::text,
        3, COALESCE(en.entregue_em, en.created_at)
      FROM public.entregas en
      LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
      LEFT JOIN public.fazendas f ON f.id = oso.fazenda_id
      LEFT JOIN public.clientes c ON c.id = en.cliente_id
      WHERE en.status::text='entregue'
        AND (en.comprovante_id IS NULL OR en.comprovante_status IS DISTINCT FROM 'confirmado')
        AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
        AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda)
        AND COALESCE(en.entregue_em, en.created_at)::date BETWEEN v_data_inicio AND v_data_fim
      ORDER BY COALESCE(en.entregue_em, en.created_at) ASC
      LIMIT v_pool)
    UNION ALL
    (SELECT 'entrega_nao_faturada'::text,
        ('Entrega ' || substring(en.id::text,1,8))::text,
        'Entrega entregue ainda não faturada'::text,
        'media'::text, en.status::text,
        COALESCE(c.razao_social, c.nome), f.nome,
        'Financeiro'::text,
        NULL::timestamptz, false,
        EXTRACT(DAY FROM (now() - COALESCE(en.entregue_em, en.created_at)))::int,
        'entregas'::text, en.id,
        'Faturar entrega'::text,
        '/financeiro/entregas-nao-faturadas'::text,
        2, COALESCE(en.entregue_em, en.created_at)
      FROM public.entregas en
      LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
      LEFT JOIN public.fazendas f ON f.id = oso.fazenda_id
      LEFT JOIN public.clientes c ON c.id = en.cliente_id
      WHERE en.status::text='entregue' AND en.receivable_id IS NULL
        AND COALESCE(en.financial_status,'PENDING_BILLING')='PENDING_BILLING'
        AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
        AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda)
        AND COALESCE(en.entregue_em, en.created_at)::date BETWEEN v_data_inicio AND v_data_fim
      ORDER BY COALESCE(en.entregue_em, en.created_at) ASC
      LIMIT v_pool)
    UNION ALL
    (SELECT 'os_atrasada'::text,
        ('OS ' || COALESCE(o.numero_os, substring(o.id::text,1,8)))::text,
        ('Atrasada desde ' || to_char(o.data_recomendada,'DD/MM/YYYY'))::text,
        CASE WHEN current_date - o.data_recomendada > 15 THEN 'alta' ELSE 'media' END,
        o.status::text,
        COALESCE(c.razao_social, c.nome), f.nome,
        'Operação'::text,
        NULL::timestamptz, false,
        (current_date - o.data_recomendada)::int,
        'ordens_servico_onfarm'::text, o.id,
        'Revisar e reprogramar OS'::text,
        '/ordens-servico'::text,
        CASE WHEN current_date - o.data_recomendada > 15 THEN 3 ELSE 2 END,
        o.created_at
      FROM public.ordens_servico_onfarm o
      LEFT JOIN public.clientes c ON c.id = o.cliente_id
      LEFT JOIN public.fazendas f ON f.id = o.fazenda_id
      WHERE o.status::text IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')
        AND o.data_recomendada IS NOT NULL AND o.data_recomendada < current_date
        AND (v_cliente IS NULL OR o.cliente_id = v_cliente)
        AND (v_fazenda IS NULL OR o.fazenda_id = v_fazenda)
        AND COALESCE(o.data_recomendada, o.created_at::date) BETWEEN v_data_inicio AND v_data_fim
      ORDER BY o.data_recomendada ASC
      LIMIT v_pool)
    UNION ALL
    (SELECT 'embalagem_sem_etiqueta'::text,
        ('Embalagem ' || COALESCE(e.codigo_embalagem, substring(e.id::text,1,8)))::text,
        'Embalagem sem etiqueta'::text,
        'media'::text, e.status::text,
        COALESCE(c.razao_social, c.nome), f.nome,
        'Produção'::text,
        NULL::timestamptz, false,
        EXTRACT(DAY FROM (now() - e.created_at))::int,
        'estoque_embalagens'::text, e.id,
        'Gerar etiqueta da embalagem'::text,
        '/estoque/embalagens'::text,
        2, e.created_at
      FROM public.estoque_embalagens e
      LEFT JOIN public.clientes c ON c.id = e.cliente_id
      LEFT JOIN public.fazendas f ON f.id = e.fazenda_id
      WHERE e.etiqueta_id IS NULL AND e.status NOT IN ('cancelado','descartado','entregue')
        AND (v_cliente IS NULL OR e.cliente_id = v_cliente)
        AND (v_fazenda IS NULL OR e.fazenda_id = v_fazenda)
        AND e.created_at::date BETWEEN v_data_inicio AND v_data_fim
      ORDER BY e.created_at ASC
      LIMIT v_pool)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tipo', tipo, 'titulo', titulo, 'descricao', descricao,
      'gravidade', gravidade, 'status', status,
      'cliente', cliente, 'fazenda', fazenda, 'responsavel', responsavel,
      'sla_resolucao_em', sla_resolucao_em, 'sla_vencido', sla_vencido,
      'dias_em_aberto', dias_em_aberto,
      'referencia_tabela', referencia_tabela, 'referencia_id', referencia_id,
      'acao_recomendada', acao_recomendada, 'rota_origem', rota_origem
    ) ORDER BY sla_vencido DESC NULLS LAST, grav_score DESC, dias_em_aberto DESC, created_at ASC), '[]'::jsonb)
  INTO v_result
  FROM (SELECT * FROM pool ORDER BY sla_vencido DESC NULLS LAST, grav_score DESC, dias_em_aberto DESC, created_at ASC LIMIT v_limit) ranked;

  RETURN jsonb_build_object('prioridades', v_result, 'gerado_em', now());
END;
$function$;

-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_executivo_plano_acao(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_periodo text := COALESCE(p_filtros->>'periodo','30_dias');
  v_data_inicio date;
  v_data_fim date := current_date;
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_resp uuid := NULLIF(p_filtros->>'responsavel_id','')::uuid;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,20),1),50);
  v_pool int := v_limit * 5;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;

  v_data_inicio := CASE v_periodo
    WHEN 'hoje' THEN current_date
    WHEN '7_dias' THEN current_date - 7
    WHEN '15_dias' THEN current_date - 15
    WHEN '30_dias' THEN current_date - 30
    WHEN 'safra_atual' THEN date_trunc('year', current_date)::date
    WHEN 'personalizado' THEN COALESCE(NULLIF(p_filtros->>'data_inicio','')::date, current_date - 30)
    ELSE current_date - 30
  END;
  IF v_periodo='personalizado' THEN
    v_data_fim := COALESCE(NULLIF(p_filtros->>'data_fim','')::date, current_date);
  END IF;

  WITH pool AS (
    (SELECT 'alerta'::text AS categoria, 'Resolver alerta crítico' AS acao,
            a.titulo AS motivo, 'critica'::text AS prioridade,
            COALESCE((SELECT nome FROM public.profiles WHERE id=a.responsavel_id),'Sem responsável') AS responsavel_sugerido,
            (SELECT COALESCE(razao_social,nome) FROM public.clientes WHERE id=a.cliente_id) AS cliente,
            (SELECT nome FROM public.fazendas WHERE id=a.fazenda_id) AS fazenda,
            'alertas_operacionais'::text AS referencia_tabela, a.id AS referencia_id,
            '/alertas-operacionais'::text AS rota_origem,
            'Evita escalonamento e perda de SLA.'::text AS impacto,
            4 AS prio_score, a.created_at AS dt
       FROM public.alertas_operacionais a
       WHERE a.status IN ('aberto','lido','reaberto') AND a.gravidade='critica'
         AND (v_cliente IS NULL OR a.cliente_id=v_cliente)
         AND (v_fazenda IS NULL OR a.fazenda_id=v_fazenda)
         AND (v_resp IS NULL OR a.responsavel_id=v_resp)
         AND a.created_at::date BETWEEN v_data_inicio AND v_data_fim
       LIMIT v_pool)
    UNION ALL
    (SELECT 'alerta'::text, 'Atribuir responsável ao alerta',
            a.titulo, 'alta'::text, 'Gestor'::text,
            (SELECT COALESCE(razao_social,nome) FROM public.clientes WHERE id=a.cliente_id),
            (SELECT nome FROM public.fazendas WHERE id=a.fazenda_id),
            'alertas_operacionais'::text, a.id,
            '/alertas-operacionais'::text,
            'Garante accountability na resolução do alerta.'::text,
            3, a.created_at
       FROM public.alertas_operacionais a
       WHERE a.status IN ('aberto','lido','reaberto') AND a.responsavel_id IS NULL
         AND (v_cliente IS NULL OR a.cliente_id=v_cliente)
         AND (v_fazenda IS NULL OR a.fazenda_id=v_fazenda)
         AND a.created_at::date BETWEEN v_data_inicio AND v_data_fim
       LIMIT v_pool)
    UNION ALL
    (SELECT 'sla'::text, 'Regularizar SLA vencido', a.titulo,
            'critica'::text, COALESCE((SELECT nome FROM public.profiles WHERE id=a.responsavel_id),'Sem responsável'),
            (SELECT COALESCE(razao_social,nome) FROM public.clientes WHERE id=a.cliente_id),
            (SELECT nome FROM public.fazendas WHERE id=a.fazenda_id),
            'alertas_operacionais'::text, a.id,
            '/alertas-operacionais'::text,
            'Reduz risco de penalidade contratual e perda de confiança.'::text,
            4, COALESCE(a.sla_vencido_em, a.created_at)
       FROM public.alertas_operacionais a
       WHERE a.status IN ('aberto','lido','reaberto') AND a.sla_vencido=true
         AND (v_cliente IS NULL OR a.cliente_id=v_cliente)
         AND (v_fazenda IS NULL OR a.fazenda_id=v_fazenda)
         AND (v_resp IS NULL OR a.responsavel_id=v_resp)
         AND a.created_at::date BETWEEN v_data_inicio AND v_data_fim
       LIMIT v_pool)
    UNION ALL
    (SELECT 'entrega'::text, 'Confirmar comprovante de entrega',
            'Entrega marcada como entregue, mas sem comprovante confirmado.'::text,
            'alta'::text, 'Administrativo/Operação'::text,
            (SELECT COALESCE(razao_social,nome) FROM public.clientes WHERE id=en.cliente_id),
            (SELECT f.nome FROM public.fazendas f WHERE f.id = oso.fazenda_id),
            'entregas'::text, en.id, '/entregas'::text,
            'Evita falha de rastreabilidade e melhora segurança do faturamento.'::text,
            3, COALESCE(en.entregue_em, en.created_at)
       FROM public.entregas en
       LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
       WHERE en.status::text='entregue'
         AND (en.comprovante_id IS NULL OR en.comprovante_status IS DISTINCT FROM 'confirmado')
         AND (v_cliente IS NULL OR en.cliente_id=v_cliente)
         AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda)
         AND COALESCE(en.entregue_em, en.created_at)::date BETWEEN v_data_inicio AND v_data_fim
       LIMIT v_pool)
    UNION ALL
    (SELECT 'entrega'::text, 'Faturar entrega',
            'Entrega entregue ainda não faturada.'::text,
            'media'::text, 'Financeiro'::text,
            (SELECT COALESCE(razao_social,nome) FROM public.clientes WHERE id=en.cliente_id),
            (SELECT f.nome FROM public.fazendas f WHERE f.id = oso.fazenda_id),
            'entregas'::text, en.id, '/financeiro/entregas-nao-faturadas'::text,
            'Acelera ciclo de caixa e regulariza fiscal.'::text,
            2, COALESCE(en.entregue_em, en.created_at)
       FROM public.entregas en
       LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
       WHERE en.status::text='entregue' AND en.receivable_id IS NULL
         AND COALESCE(en.financial_status,'PENDING_BILLING')='PENDING_BILLING'
         AND (v_cliente IS NULL OR en.cliente_id=v_cliente)
         AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda)
         AND COALESCE(en.entregue_em, en.created_at)::date BETWEEN v_data_inicio AND v_data_fim
       LIMIT v_pool)
    UNION ALL
    (SELECT 'os'::text, 'Revisar OS atrasada',
            ('OS ' || COALESCE(o.numero_os, substring(o.id::text,1,8)) || ' atrasada desde ' || to_char(o.data_recomendada,'DD/MM/YYYY'))::text,
            CASE WHEN current_date-o.data_recomendada>15 THEN 'alta' ELSE 'media' END,
            'Operação'::text,
            (SELECT COALESCE(razao_social,nome) FROM public.clientes WHERE id=o.cliente_id),
            (SELECT nome FROM public.fazendas WHERE id=o.fazenda_id),
            'ordens_servico_onfarm'::text, o.id, '/ordens-servico'::text,
            'Mantém previsibilidade da operação On-Farm.'::text,
            CASE WHEN current_date-o.data_recomendada>15 THEN 3 ELSE 2 END, o.created_at
       FROM public.ordens_servico_onfarm o
       WHERE o.status::text IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')
         AND o.data_recomendada IS NOT NULL AND o.data_recomendada < current_date
         AND (v_cliente IS NULL OR o.cliente_id=v_cliente)
         AND (v_fazenda IS NULL OR o.fazenda_id=v_fazenda)
         AND COALESCE(o.data_recomendada, o.created_at::date) BETWEEN v_data_inicio AND v_data_fim
       LIMIT v_pool)
    UNION ALL
    (SELECT 'estoque'::text, 'Gerar etiqueta para embalagem',
            ('Embalagem ' || COALESCE(e.codigo_embalagem, substring(e.id::text,1,8)) || ' sem etiqueta')::text,
            'media'::text, 'Produção'::text,
            (SELECT COALESCE(razao_social,nome) FROM public.clientes WHERE id=e.cliente_id),
            (SELECT nome FROM public.fazendas WHERE id=e.fazenda_id),
            'estoque_embalagens'::text, e.id, '/estoque/embalagens'::text,
            'Garante rastreabilidade pós-envase.'::text,
            2, e.created_at
       FROM public.estoque_embalagens e
       WHERE e.etiqueta_id IS NULL AND e.status NOT IN ('cancelado','descartado','entregue')
         AND (v_cliente IS NULL OR e.cliente_id=v_cliente)
         AND (v_fazenda IS NULL OR e.fazenda_id=v_fazenda)
         AND e.created_at::date BETWEEN v_data_inicio AND v_data_fim
       LIMIT v_pool)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'categoria', categoria, 'acao', acao, 'motivo', motivo,
      'prioridade', prioridade, 'responsavel_sugerido', responsavel_sugerido,
      'cliente', cliente, 'fazenda', fazenda,
      'referencia_tabela', referencia_tabela, 'referencia_id', referencia_id,
      'rota_origem', rota_origem, 'impacto', impacto
    ) ORDER BY prio_score DESC, dt ASC), '[]'::jsonb)
  INTO v_result
  FROM (SELECT * FROM pool ORDER BY prio_score DESC, dt ASC LIMIT v_limit) ranked;

  RETURN jsonb_build_object('acoes', v_result, 'gerado_em', now());
END;
$function$;

-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_executivo_responsaveis_pendencias(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_periodo text := COALESCE(p_filtros->>'periodo','30_dias');
  v_data_inicio date;
  v_data_fim date := current_date;
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_resp uuid := NULLIF(p_filtros->>'responsavel_id','')::uuid;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,10),1),50);
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;

  v_data_inicio := CASE v_periodo
    WHEN 'hoje' THEN current_date
    WHEN '7_dias' THEN current_date - 7
    WHEN '15_dias' THEN current_date - 15
    WHEN '30_dias' THEN current_date - 30
    WHEN 'safra_atual' THEN date_trunc('year', current_date)::date
    WHEN 'personalizado' THEN COALESCE(NULLIF(p_filtros->>'data_inicio','')::date, current_date - 30)
    ELSE current_date - 30
  END;
  IF v_periodo='personalizado' THEN
    v_data_fim := COALESCE(NULLIF(p_filtros->>'data_fim','')::date, current_date);
  END IF;

  WITH base AS (
    SELECT a.responsavel_id,
           COALESCE((SELECT nome FROM public.profiles WHERE id=a.responsavel_id), 'Sem responsável') AS responsavel,
           a.gravidade, a.sla_vencido, a.created_at
    FROM public.alertas_operacionais a
    WHERE a.status IN ('aberto','lido','reaberto')
      AND (v_cliente IS NULL OR a.cliente_id=v_cliente)
      AND (v_fazenda IS NULL OR a.fazenda_id=v_fazenda)
      AND (v_resp IS NULL OR a.responsavel_id=v_resp)
      AND a.created_at::date BETWEEN v_data_inicio AND v_data_fim
  ), agg AS (
    SELECT responsavel_id, responsavel,
           COUNT(*) AS alertas_abertos,
           COUNT(*) FILTER (WHERE sla_vencido) AS sla_vencidos,
           COUNT(*) FILTER (WHERE gravidade='critica') AS alertas_criticos,
           COUNT(*) FILTER (WHERE gravidade='alta') AS alertas_altos,
           MAX(created_at) AS ultima_acao
    FROM base
    GROUP BY responsavel_id, responsavel
    ORDER BY sla_vencidos DESC, alertas_criticos DESC, alertas_abertos DESC
    LIMIT v_limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'responsavel_id', responsavel_id,
      'responsavel', responsavel,
      'alertas_abertos', alertas_abertos,
      'sla_vencidos', sla_vencidos,
      'alertas_criticos', alertas_criticos,
      'alertas_altos', alertas_altos,
      'ultima_acao', ultima_acao
    )), '[]'::jsonb)
  INTO v_result FROM agg;

  RETURN jsonb_build_object(
    'responsaveis', v_result,
    'escopo', 'alertas_operacionais',
    'observacao', 'Agrupamento considera apenas alertas_operacionais. OS, entregas e estoque ainda não entram no agrupamento por responsável.',
    'gerado_em', now()
  );
END;
$function$;
