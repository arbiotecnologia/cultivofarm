CREATE OR REPLACE FUNCTION public.rpc_executivo_resumo_geral(p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;
  IF NOT public.is_executivo(v_uid) THEN RAISE EXCEPTION 'Acesso negado ao Portal Executivo' USING ERRCODE='42501'; END IF;

  IF v_periodo = 'personalizado' AND p_filtros ? 'data_inicio' AND p_filtros ? 'data_fim' THEN
    v_data_inicio := (p_filtros->>'data_inicio')::timestamptz;
    v_data_fim := (p_filtros->>'data_fim')::timestamptz;
  ELSIF v_periodo='hoje' THEN v_data_inicio := date_trunc('day', now());
  ELSIF v_periodo='7_dias' THEN v_data_inicio := now() - interval '7 days';
  ELSIF v_periodo='15_dias' THEN v_data_inicio := now() - interval '15 days';
  ELSIF v_periodo='safra_atual' THEN v_data_inicio := date_trunc('year', now());
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

  BEGIN
    SELECT count(*) INTO v_tmp FROM vw_fluxo_visita_tecnica v
    WHERE COALESCE(v.created_at, v.updated_at) BETWEEN v_data_inicio AND v_data_fim
      AND COALESCE(v.proxima_acao,'') IN ('Realizar check-in','Agendar visita','Atribuir consultor','Registrar diagnóstico','Inserir evidências')
      AND (v_cliente IS NULL OR v.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR v.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('visitas_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'visitas_pendentes'); END;

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

  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o
    WHERE o.status::text IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')
      AND o.data_recomendada IS NOT NULL
      AND o.data_recomendada < current_date
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
  EXCEPTION WHEN OTHERS THEN v_indisp := array_append(v_indisp, 'alertas_operacionais'); END;

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
    IF (v_resumo->>'os_atrasadas')::int > 0
       OR (v_resumo->>'entregas_sem_comprovante')::int > 0
       OR (v_resumo->>'entregas_nao_faturadas')::int > 0
       OR (v_resumo->>'embalagens_sem_etiqueta')::int > 0
       OR (v_resumo->>'cq_pendente')::int > 0
       OR (v_resumo->>'alertas_altos')::int > 0 THEN
      v_score := 70; v_class := 'atencao';
      IF (v_resumo->>'os_atrasadas')::int > 0 THEN v_motivos := array_append(v_motivos, (v_resumo->>'os_atrasadas') || ' OS atrasadas'); END IF;
      IF (v_resumo->>'entregas_sem_comprovante')::int > 0 THEN v_motivos := array_append(v_motivos, (v_resumo->>'entregas_sem_comprovante') || ' entregas sem comprovante'); END IF;
      IF (v_resumo->>'entregas_nao_faturadas')::int > 0 THEN v_motivos := array_append(v_motivos, (v_resumo->>'entregas_nao_faturadas') || ' entregas não faturadas'); END IF;
      IF (v_resumo->>'embalagens_sem_etiqueta')::int > 0 THEN v_motivos := array_append(v_motivos, (v_resumo->>'embalagens_sem_etiqueta') || ' embalagens sem etiqueta'); END IF;
      IF (v_resumo->>'cq_pendente')::int > 0 THEN v_motivos := array_append(v_motivos, (v_resumo->>'cq_pendente') || ' lotes em CQ pendente'); END IF;
    ELSE
      v_motivos := array_append(v_motivos, 'Sem pendências críticas');
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
$function$;