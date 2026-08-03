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
  v_diag jsonb := '[]'::jsonb;
  v_motivos text[] := ARRAY[]::text[];
  v_score int := 95;
  v_class text := 'saudavel';
  v_tmp int;
  v_num numeric;
  v_alertas_critico int := 0;
  v_sla_vencidos int := 0;
  v_di_raw text;
  v_df_raw text;
  -- conjunto canônico de status "em aberto" de alertas_operacionais
  -- (CHECK: aberto | lido | resolvido | ignorado | reaberto)
  v_alerta_abertos text[] := ARRAY['aberto','lido','reaberto'];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE='42501'; END IF;
  IF NOT public.is_executivo(v_uid) THEN RAISE EXCEPTION 'Acesso negado ao Portal Executivo' USING ERRCODE='42501'; END IF;

  IF v_periodo = 'personalizado' THEN
    v_di_raw := NULLIF(p_filtros->>'data_inicio','');
    v_df_raw := NULLIF(p_filtros->>'data_fim','');
    IF v_di_raw IS NULL OR v_df_raw IS NULL THEN
      RAISE EXCEPTION 'Período personalizado exige data_inicio e data_fim' USING ERRCODE='22023';
    END IF;
    IF v_di_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_data_inicio := (v_di_raw::date::timestamp) AT TIME ZONE v_tz;
    ELSE
      v_data_inicio := v_di_raw::timestamptz;
    END IF;
    -- data_fim inclusiva: data pura vira fim do dia no fuso de negócio
    IF v_df_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_data_fim := ((v_df_raw::date + 1)::timestamp) AT TIME ZONE v_tz - interval '1 microsecond';
    ELSE
      v_data_fim := v_df_raw::timestamptz;
    END IF;
    IF v_data_inicio > v_data_fim THEN
      RAISE EXCEPTION 'data_inicio não pode ser maior que data_fim' USING ERRCODE='22023';
    END IF;
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
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'solicitacoes_abertas');
    v_diag := v_diag || jsonb_build_object('indicador','solicitacoes_abertas','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM portal_solicitacoes s
    WHERE COALESCE(s.urgencia::text,'') = 'critica'
      AND COALESCE(s.status,'') NOT IN ('concluida','cancelada','finalizada','arquivada','rejeitada')
      AND (v_cliente IS NULL OR s.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR s.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('solicitacoes_criticas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'solicitacoes_criticas');
    v_diag := v_diag || jsonb_build_object('indicador','solicitacoes_criticas','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM vw_fluxo_visita_tecnica v
    WHERE COALESCE(v.created_at, v.updated_at) BETWEEN v_data_inicio AND v_data_fim
      AND COALESCE(v.proxima_acao,'') IN ('Realizar check-in','Agendar visita','Atribuir consultor','Registrar diagnóstico','Inserir evidências')
      AND (v_cliente IS NULL OR v.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR v.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('visitas_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'visitas_pendentes');
    v_diag := v_diag || jsonb_build_object('indicador','visitas_pendentes','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM vw_fluxo_visita_tecnica v
    WHERE v.data_prevista_atendimento IS NOT NULL
      AND (v.data_prevista_atendimento AT TIME ZONE v_tz)::date < v_hoje
      AND COALESCE(v.possui_checkin,false) = false
      AND COALESCE(v.status_solicitacao,'') NOT IN ('concluida','cancelada','finalizada','arquivada','rejeitada')
      AND (v_cliente IS NULL OR v.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR v.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('visitas_atrasadas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'visitas_atrasadas');
    v_diag := v_diag || jsonb_build_object('indicador','visitas_atrasadas','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM visitas_checkin c
    WHERE (c.data_hora_checkin AT TIME ZONE v_tz)::date = v_hoje
      AND (v_cliente IS NULL OR c.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR c.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('checkins_hoje', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'checkins_hoje');
    v_diag := v_diag || jsonb_build_object('indicador','checkins_hoje','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM registros_consultor r
    WHERE r.data_vistoria IS NOT NULL
      AND (r.data_vistoria)::date = v_hoje
      AND COALESCE(r.status::text,'') NOT IN ('arquivado','reprovado')
      AND (v_cliente IS NULL OR r.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR r.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('visitas_hoje', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'visitas_hoje');
    v_diag := v_diag || jsonb_build_object('indicador','visitas_hoje','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM vw_fluxo_visita_tecnica v
    WHERE COALESCE(v.created_at, v.updated_at) BETWEEN v_data_inicio AND v_data_fim
      AND COALESCE(v.proxima_acao,'') IN ('Emitir recomendação','Liberar recomendação')
      AND (v_cliente IS NULL OR v.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR v.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('recomendacoes_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'recomendacoes_pendentes');
    v_diag := v_diag || jsonb_build_object('indicador','recomendacoes_pendentes','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o
    WHERE o.created_at BETWEEN v_data_inicio AND v_data_fim
      AND o.status::text IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')
      AND (v_cliente IS NULL OR o.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR o.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('os_ativas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'os_ativas');
    v_diag := v_diag || jsonb_build_object('indicador','os_ativas','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o
    WHERE o.status::text = 'aberta'
      AND (v_cliente IS NULL OR o.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR o.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('os_abertas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'os_abertas');
    v_diag := v_diag || jsonb_build_object('indicador','os_abertas','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o
    WHERE o.status::text IN ('aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega')
      AND o.data_recomendada IS NOT NULL
      AND o.data_recomendada < v_hoje
      AND (v_cliente IS NULL OR o.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR o.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('os_atrasadas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'os_atrasadas');
    v_diag := v_diag || jsonb_build_object('indicador','os_atrasadas','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM lotes l
    WHERE l.created_at BETWEEN v_data_inicio AND v_data_fim
      AND l.status::text IN ('em_producao','aguardando_cq');
    v_resumo := v_resumo || jsonb_build_object('lotes_em_producao', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'lotes_em_producao');
    v_diag := v_diag || jsonb_build_object('indicador','lotes_em_producao','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM lotes l WHERE l.status::text = 'aguardando_cq';
    v_resumo := v_resumo || jsonb_build_object('cq_pendente', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'cq_pendente');
    v_diag := v_diag || jsonb_build_object('indicador','cq_pendente','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM ordens_servico_onfarm o WHERE o.status::text = 'envase';
    v_resumo := v_resumo || jsonb_build_object('envases_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'envases_pendentes');
    v_diag := v_diag || jsonb_build_object('indicador','envases_pendentes','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM estoque_embalagens e
    WHERE e.status IN ('em_estoque','reservado','separado')
      AND (v_cliente IS NULL OR e.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR e.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('embalagens_em_estoque', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'embalagens_em_estoque');
    v_diag := v_diag || jsonb_build_object('indicador','embalagens_em_estoque','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM estoque_embalagens e
    WHERE e.etiqueta_id IS NULL
      AND e.status NOT IN ('cancelado','descartado','entregue');
    v_resumo := v_resumo || jsonb_build_object('embalagens_sem_etiqueta', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'embalagens_sem_etiqueta');
    v_diag := v_diag || jsonb_build_object('indicador','embalagens_sem_etiqueta','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp
    FROM entregas en
    LEFT JOIN ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
    WHERE en.status::text IN ('separado','em_rota')
      AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('entregas_pendentes', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'entregas_pendentes');
    v_diag := v_diag || jsonb_build_object('indicador','entregas_pendentes','sqlstate',SQLSTATE);
  END;

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
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'entregas_sem_comprovante');
    v_diag := v_diag || jsonb_build_object('indicador','entregas_sem_comprovante','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp
    FROM entregas en
    LEFT JOIN ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
    WHERE en.status::text = 'entregue'
      AND COALESCE(en.faturado,false) = false
      AND COALESCE(en.entregue_em, en.updated_at, en.created_at) BETWEEN v_data_inicio AND v_data_fim
      AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda);
    v_resumo := v_resumo || jsonb_build_object('entregas_nao_faturadas', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'entregas_nao_faturadas');
    v_diag := v_diag || jsonb_build_object('indicador','entregas_nao_faturadas','sqlstate',SQLSTATE);
  END;

  -- Alertas operacionais: conjunto canônico único de "em aberto"
  BEGIN
    SELECT count(*) INTO v_alertas_critico FROM alertas_operacionais a
    WHERE COALESCE(a.gravidade,'') = 'critica' AND COALESCE(a.status,'') = ANY(v_alerta_abertos);
    v_resumo := v_resumo || jsonb_build_object('alertas_criticos', COALESCE(v_alertas_critico,0));

    SELECT count(*) INTO v_tmp FROM alertas_operacionais a
    WHERE COALESCE(a.gravidade,'') = 'alta' AND COALESCE(a.status,'') = ANY(v_alerta_abertos);
    v_resumo := v_resumo || jsonb_build_object('alertas_altos', COALESCE(v_tmp,0));

    SELECT count(*) INTO v_tmp FROM alertas_operacionais a
    WHERE COALESCE(a.status,'') = ANY(v_alerta_abertos);
    v_resumo := v_resumo || jsonb_build_object('alertas_ativos', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'alertas_operacionais');
    v_diag := v_diag || jsonb_build_object('indicador','alertas_operacionais','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_tmp FROM clientes c
    WHERE COALESCE(c.status_cliente::text,'ativo') = 'ativo'
      AND (v_cliente IS NULL OR c.id = v_cliente);
    v_resumo := v_resumo || jsonb_build_object('clientes_ativos', COALESCE(v_tmp,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'clientes_ativos');
    v_diag := v_diag || jsonb_build_object('indicador','clientes_ativos','sqlstate',SQLSTATE);
  END;

  -- Receita recebida: mesma base de rpc_executivo_financeiro_resumo.total_recebido
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
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'receita_recebida');
    v_diag := v_diag || jsonb_build_object('indicador','receita_recebida','sqlstate',SQLSTATE);
  END;

  BEGIN
    SELECT count(*) INTO v_sla_vencidos FROM alertas_sla_eventos s
    WHERE COALESCE(s.status,'') IN ('vencido','overdue')
      AND s.created_at BETWEEN v_data_inicio AND v_data_fim;
    v_resumo := v_resumo || jsonb_build_object('sla_vencidos', COALESCE(v_sla_vencidos,0));
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp,'sla_vencidos');
    v_diag := v_diag || jsonb_build_object('indicador','sla_vencidos','sqlstate',SQLSTATE);
  END;

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

  IF jsonb_array_length(v_diag) > 0 THEN
    RAISE WARNING 'rpc_executivo_resumo_geral: fontes indisponíveis %', v_diag::text;
  END IF;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('data_inicio', v_data_inicio, 'data_fim', v_data_fim, 'periodo', v_periodo, 'timezone', v_tz),
    'resumo', v_resumo,
    'saude_operacional', jsonb_build_object('score', v_score, 'classificacao', v_class, 'motivos', to_jsonb(v_motivos)),
    'dados_indisponiveis', to_jsonb(v_indisp),
    'diagnostico', v_diag,
    'gerado_em', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_executivo_resumo_geral(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_executivo_resumo_geral(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_resumo_geral(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_executivo_resumo_geral(jsonb) TO service_role;

COMMENT ON FUNCTION public.rpc_dashboard_geral_lab_resumo() IS
  'Resumo do laboratório da Visão Geral. insumos_criticos compara SUM(estoque_produto.volume_total) (litros) com produtos.estoque_minimo (litros) — produtos não possui coluna de unidade; a comparação assume litros para ambos.';