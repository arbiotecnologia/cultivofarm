-- ============================================================
-- Visão Geral — correção de KPIs (staging)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_executivo_resumo_geral(p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tz text := 'America/Sao_Paulo';
  v_periodo text := COALESCE(p_filtros->>'periodo', '30_dias');
  v_data_inicio timestamptz;
  v_data_fim timestamptz := now();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_resumo jsonb := '{}'::jsonb;
  v_indisp text[] := ARRAY[]::text[];
  v_motivos text[] := ARRAY[]::text[];
  v_score int := 95;
  v_class text := 'saudavel';
  v_tmp int;
  v_num numeric;
  v_alertas_critico int := 0;
  v_sla_vencidos int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;
  IF NOT public.is_executivo(v_uid) THEN RAISE EXCEPTION 'Acesso negado ao Portal Executivo' USING ERRCODE='42501'; END IF;

  IF v_periodo = 'personalizado' AND p_filtros ? 'data_inicio' AND p_filtros ? 'data_fim' THEN
    v_data_inicio := (p_filtros->>'data_inicio')::timestamptz;
    v_data_fim := (p_filtros->>'data_fim')::timestamptz;
  ELSIF v_periodo='hoje' THEN v_data_inicio := (v_hoje::timestamp) AT TIME ZONE v_tz;
  ELSIF v_periodo='7_dias' THEN v_data_inicio := now() - interval '7 days';
  ELSIF v_periodo='15_dias' THEN v_data_inicio := now() - interval '15 days';
  ELSIF v_periodo='safra_atual' THEN v_data_inicio := (date_trunc('year', v_hoje)::timestamp) AT TIME ZONE v_tz;
  ELSE v_data_inicio := now() - interval '30 days'; v_periodo := '30_dias';
  END IF;

  BEGIN
    SELECT count(*) INTO v_tmp FROM portal_solicitacoes s
    WHERE s.created_at BETWEEN v_data_inicio AND v_data_fim
      AND COALESCE(s.status,'') NOT IN ('concluida','cancelada','finalizada','arquivada')
      AND (v_cliente IS NULL OR s.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR s.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('solicitacoes_abertas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'solicitacoes_abertas'); END;

  -- Solicitações críticas abertas (posição atual, independe do período)
  BEGIN
    SELECT count(*) INTO v_tmp FROM portal_solicitacoes s
    WHERE COALESCE(s.urgencia::text,'') = 'critica'
      AND COALESCE(s.status,'') NOT IN ('concluida','cancelada','finalizada','arquivada','rejeitada')
      AND (v_cliente IS NULL OR s.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR s.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('solicitacoes_criticas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'solicitacoes_criticas'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM vw_fluxo_visita_tecnica v
    WHERE COALESCE(v.created_at, v.updated_at) BETWEEN v_data_inicio AND v_data_fim
      AND COALESCE(v.proxima_acao,'') IN ('Realizar check-in','Agendar visita','Atribuir consultor','Registrar diagnóstico','Inserir evidências')
      AND (v_cliente IS NULL OR v.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR v.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('visitas_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'visitas_pendentes'); END;

  -- Visitas atrasadas: previsão de atendimento vencida e ainda sem check-in
  BEGIN
    SELECT count(*) INTO v_tmp FROM vw_fluxo_visita_tecnica v
    WHERE v.data_prevista_atendimento IS NOT NULL
      AND (v.data_prevista_atendimento AT TIME ZONE v_tz)::date < v_hoje
      AND COALESCE(v.possui_checkin,false) = false
      AND COALESCE(v.status_solicitacao,'') NOT IN ('concluida','cancelada','finalizada','arquivada','rejeitada')
      AND (v_cliente IS NULL OR v.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR v.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('visitas_atrasadas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'visitas_atrasadas'); END;

  -- Fluxo do dia (fuso de negócio)
  BEGIN
    SELECT count(*) INTO v_tmp FROM visitas_checkin c
    WHERE (c.data_hora_checkin AT TIME ZONE v_tz)::date = v_hoje
      AND (v_cliente IS NULL OR c.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR c.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('checkins_hoje', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'checkins_hoje'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM registros_consultor r
    WHERE r.data_vistoria IS NOT NULL
      AND (r.data_vistoria)::date = v_hoje
      AND COALESCE(r.status::text,'') NOT IN ('arquivado','reprovado')
      AND (v_cliente IS NULL OR r.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR r.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('visitas_hoje', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'visitas_hoje'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM vw_fluxo_visita_tecnica v
    WHERE COALESCE(v.created_at, v.updated_at) BETWEEN v_data_inicio AND v_data_fim
      AND COALESCE(v.proxima_acao,'') IN ('Emitir recomendação','Liberar recomendação')
      AND (v_cliente IS NULL OR v.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR v.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('recomendacoes_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'recomendacoes_pendentes'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o
    WHERE o.created_at BETWEEN v_data_inicio AND v_data_fim
      AND o.status::text IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')
      AND (v_cliente IS NULL OR o.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR o.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('os_ativas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'os_ativas'); END;

  -- OS abertas (posição atual) — mesma definição do bloco Laboratório
  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o
    WHERE o.status::text = 'aberta'
      AND (v_cliente IS NULL OR o.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR o.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('os_abertas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'os_abertas'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o
    WHERE o.status::text IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')
      AND o.data_recomendada IS NOT NULL
      AND o.data_recomendada < v_hoje
      AND (v_cliente IS NULL OR o.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR o.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('os_atrasadas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'os_atrasadas'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM lotes l
    WHERE l.created_at BETWEEN v_data_inicio AND v_data_fim
      AND l.status::text IN ('em_producao','aguardando_cq');
    v_resumo := v_resumo || jsonb_build_object('lotes_em_producao', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'lotes_em_producao'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM lotes l WHERE l.status::text = 'aguardando_cq';
    v_resumo := v_resumo || jsonb_build_object('cq_pendente', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'cq_pendente'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o WHERE o.status::text = 'envase';
    v_resumo := v_resumo || jsonb_build_object('envases_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'envases_pendentes'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM estoque_embalagens e
    WHERE e.status IN ('em_estoque','reservado','separado')
      AND (v_cliente IS NULL OR e.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR e.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('embalagens_em_estoque', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'embalagens_em_estoque'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM estoque_embalagens e
    WHERE e.etiqueta_id IS NULL
      AND e.status NOT IN ('cancelado','descartado','entregue');
    v_resumo := v_resumo || jsonb_build_object('embalagens_sem_etiqueta', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'embalagens_sem_etiqueta'); END;

  BEGIN
    SELECT count(*) INTO v_tmp
    FROM entregas en
    LEFT JOIN ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
    WHERE en.status::text IN ('separado','em_rota')
      AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('entregas_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'entregas_pendentes'); END;

  BEGIN
    SELECT count(*) INTO v_tmp
    FROM entregas en
    LEFT JOIN ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
    WHERE en.status::text = 'entregue'
      AND (en.comprovante_id IS NULL OR COALESCE(en.comprovante_status,'') IS DISTINCT FROM 'confirmado')
      AND COALESCE(en.entregue_em, en.updated_at, en.created_at) BETWEEN v_data_inicio AND v_data_fim
      AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('entregas_sem_comprovante', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'entregas_sem_comprovante'); END;

  BEGIN
    SELECT count(*) INTO v_tmp
    FROM entregas en
    LEFT JOIN ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
    WHERE en.status::text = 'entregue'
      AND en.receivable_id IS NULL
      AND COALESCE(en.financial_status,'PENDING_BILLING') = 'PENDING_BILLING'
      AND COALESCE(en.entregue_em, en.updated_at, en.created_at) BETWEEN v_data_inicio AND v_data_fim
      AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('entregas_nao_faturadas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'entregas_nao_faturadas'); END;

  BEGIN
    SELECT count(*) INTO v_alertas_critico FROM alertas_operacionais a
    WHERE COALESCE(a.gravidade::text,'') = 'critica'
      AND COALESCE(a.status,'') NOT IN ('resolvido','cancelado','fechado');
    v_resumo := v_resumo || jsonb_build_object('alertas_criticos', v_alertas_critico);

    SELECT count(*) INTO v_tmp FROM alertas_operacionais a
    WHERE COALESCE(a.gravidade::text,'') = 'alta'
      AND COALESCE(a.status,'') NOT IN ('resolvido','cancelado','fechado');
    v_resumo := v_resumo || jsonb_build_object('alertas_altos', COALESCE(v_tmp,0));

    -- Total de alertas abertos (card "Alertas" da Visão Geral)
    SELECT count(*) INTO v_tmp FROM alertas_operacionais a
    WHERE COALESCE(a.status,'') NOT IN ('resolvido','cancelado','fechado','ignorado');
    v_resumo := v_resumo || jsonb_build_object('alertas_ativos', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'alertas_operacionais'); END;

  -- Clientes ativos (mesma definição canônica de rpc_executivo_clientes_resumo)
  BEGIN
    SELECT count(*) INTO v_tmp FROM clientes c
    WHERE COALESCE(c.status_cliente::text,'ativo') = 'ativo'
      AND (v_cliente IS NULL OR c.id = v_cliente);
    v_resumo := v_resumo || jsonb_build_object('clientes_ativos', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'clientes_ativos'); END;

  -- Receita recebida no período (mesma base de rpc_executivo_financeiro_resumo)
  BEGIN
    SELECT COALESCE(SUM(rp.amount_received),0) INTO v_num
    FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE COALESCE(rp.is_reversal,false) = false
      AND rp.payment_date >= (v_data_inicio AT TIME ZONE v_tz)::date
      AND rp.payment_date <= (v_data_fim AT TIME ZONE v_tz)::date
      AND (v_cliente IS NULL OR ar.customer_id = v_cliente);
    v_resumo := v_resumo || jsonb_build_object('receita_recebida', COALESCE(v_num,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'receita_recebida'); END;

  BEGIN
    SELECT count(*) INTO v_sla_vencidos FROM alertas_sla_eventos s
    WHERE COALESCE(s.status,'') IN ('vencido','overdue')
      AND s.created_at BETWEEN v_data_inicio AND v_data_fim;
    v_resumo := v_resumo || jsonb_build_object('sla_vencidos', COALESCE(v_sla_vencidos,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'sla_vencidos'); END;

  IF array_length(v_indisp,1) >= 5 THEN
    v_score := 0; v_class := 'sem_dados';
    v_motivos := array_append(v_motivos, 'Fontes principais indisponíveis');
  ELSIF v_alertas_critico > 0 OR v_sla_vencidos > 0 THEN
    v_score := 40; v_class := 'critico';
    IF v_alertas_critico > 0 THEN v_motivos := array_append(v_motivos, v_alertas_critico || ' alertas críticos abertos'); END IF;
    IF v_sla_vencidos > 0 THEN v_motivos := array_append(v_motivos, v_sla_vencidos || ' SLAs vencidos'); END IF;
  ELSE
    IF COALESCE((v_resumo->>'os_atrasadas')::int,0) > 0
       OR COALESCE((v_resumo->>'entregas_sem_comprovante')::int,0) > 0
       OR COALESCE((v_resumo->>'entregas_nao_faturadas')::int,0) > 0
       OR COALESCE((v_resumo->>'embalagens_sem_etiqueta')::int,0) > 0
       OR COALESCE((v_resumo->>'cq_pendente')::int,0) > 0
       OR COALESCE((v_resumo->>'alertas_altos')::int,0) > 0 THEN
      v_score := 70; v_class := 'atencao';
      IF COALESCE((v_resumo->>'os_atrasadas')::int,0) > 0 THEN v_motivos := array_append(v_motivos, (v_resumo->>'os_atrasadas') || ' OS atrasadas'); END IF;
      IF COALESCE((v_resumo->>'entregas_sem_comprovante')::int,0) > 0 THEN v_motivos := array_append(v_motivos, (v_resumo->>'entregas_sem_comprovante') || ' entregas sem comprovante'); END IF;
      IF COALESCE((v_resumo->>'entregas_nao_faturadas')::int,0) > 0 THEN v_motivos := array_append(v_motivos, (v_resumo->>'entregas_nao_faturadas') || ' entregas não faturadas'); END IF;
      IF COALESCE((v_resumo->>'embalagens_sem_etiqueta')::int,0) > 0 THEN v_motivos := array_append(v_motivos, (v_resumo->>'embalagens_sem_etiqueta') || ' embalagens sem etiqueta'); END IF;
      IF COALESCE((v_resumo->>'cq_pendente')::int,0) > 0 THEN v_motivos := array_append(v_motivos, (v_resumo->>'cq_pendente') || ' lotes em CQ pendente'); END IF;
    ELSE
      v_motivos := array_append(v_motivos, 'Sem pendências críticas');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('data_inicio', v_data_inicio, 'data_fim', v_data_fim, 'periodo', v_periodo, 'timezone', v_tz),
    'resumo', v_resumo,
    'saude_operacional', jsonb_build_object('score', v_score, 'classificacao', v_class, 'motivos', to_jsonb(v_motivos)),
    'dados_indisponiveis', to_jsonb(v_indisp),
    'gerado_em', now()
  );
END;
$function$;

-- ------------------------------------------------------------
-- Resumo do laboratório (Visão Geral) — agregação server-side
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_dashboard_geral_lab_resumo()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  v_indisp text[] := ARRAY[]::text[];
  v_tmp int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;
  IF NOT public.is_executivo(v_uid) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;

  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o WHERE o.status::text = 'aberta';
    v_out := v_out || jsonb_build_object('os_aguardando', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp,'os_aguardando'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM lotes l WHERE l.status::text = 'em_producao';
    v_out := v_out || jsonb_build_object('lotes_producao', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp,'lotes_producao'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM lotes l WHERE l.status::text = 'aguardando_cq';
    v_out := v_out || jsonb_build_object('cq_pendente', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp,'cq_pendente'); END;

  -- Alinhado à definição executiva: OS em etapa de envase
  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o WHERE o.status::text = 'envase';
    v_out := v_out || jsonb_build_object('envases_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp,'envases_pendentes'); END;

  -- Insumos críticos: disponível agregado abaixo do mínimo cadastrado
  BEGIN
    SELECT count(*) INTO v_tmp
    FROM (
      SELECT p.id
      FROM produtos p
      LEFT JOIN estoque_produto ep
        ON ep.produto_id = p.id AND ep.status::text = 'disponivel'
      WHERE COALESCE(p.e_insumo,false) = true
        AND COALESCE(p.ativo,true) = true
        AND COALESCE(p.estoque_minimo,0) > 0
      GROUP BY p.id, p.estoque_minimo
      HAVING COALESCE(SUM(ep.volume_total),0) < COALESCE(p.estoque_minimo,0)
    ) q;
    v_out := v_out || jsonb_build_object('insumos_criticos', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp,'insumos_criticos'); END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM entregas en WHERE en.status::text IN ('separado','em_rota');
    v_out := v_out || jsonb_build_object('entregas_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp,'entregas_pendentes'); END;

  RETURN jsonb_build_object(
    'resumo', v_out,
    'dados_indisponiveis', to_jsonb(v_indisp),
    'gerado_em', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_dashboard_geral_lab_resumo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_dashboard_geral_lab_resumo() FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_dashboard_geral_lab_resumo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dashboard_geral_lab_resumo() TO service_role;