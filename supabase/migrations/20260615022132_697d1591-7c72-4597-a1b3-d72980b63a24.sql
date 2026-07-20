
-- =====================================================================
-- Fase 13.2.2 — Ajuste Final do Ranking, Gargalos e Fiscal Pendente
-- =====================================================================

-- 1) RESUMO: fiscal_pendente passa a respeitar v_fazenda via origin DELIVERY
CREATE OR REPLACE FUNCTION public.rpc_executivo_financeiro_resumo(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_periodo text := COALESCE(p_filtros->>'periodo','30_dias');
  v_data_inicio date;
  v_data_fim date := current_date;
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_indisp text[] := ARRAY[]::text[];

  v_total_a_receber numeric := 0;
  v_total_recebido numeric := 0;
  v_total_vencido_r numeric := 0;
  v_total_a_vencer_r numeric := 0;
  v_qtd_titulos_r int := 0;
  v_qtd_vencidas_r int := 0;

  v_total_a_pagar numeric := 0;
  v_total_pago numeric := 0;
  v_total_vencido_p numeric := 0;
  v_total_a_vencer_p numeric := 0;
  v_qtd_titulos_p int := 0;
  v_qtd_vencidas_p int := 0;

  v_entregas_nao_fat int := 0;
  v_valor_nao_fat numeric := 0;
  v_entregas_fat int := 0;
  v_valor_fat numeric := 0;
  v_fiscal_pend int := 0;
  v_recibos_pend int := 0;

  v_score int := 100;
  v_classif text := 'saudavel';
  v_motivos text[] := ARRAY[]::text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado ao Portal Executivo' USING ERRCODE = '42501';
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
  IF v_periodo = 'personalizado' THEN
    v_data_fim := COALESCE(NULLIF(p_filtros->>'data_fim','')::date, current_date);
  END IF;

  BEGIN
    SELECT
      COALESCE(SUM(CASE WHEN i.status NOT IN ('PAID','CANCELED') THEN COALESCE(i.net_amount, i.original_amount) - COALESCE(i.received_amount,0) END),0),
      COALESCE(SUM(CASE WHEN i.status NOT IN ('PAID','CANCELED') AND i.due_date < current_date THEN COALESCE(i.net_amount, i.original_amount) - COALESCE(i.received_amount,0) END),0),
      COALESCE(SUM(CASE WHEN i.status NOT IN ('PAID','CANCELED') AND i.due_date >= current_date THEN COALESCE(i.net_amount, i.original_amount) - COALESCE(i.received_amount,0) END),0),
      COUNT(DISTINCT ar.id) FILTER (WHERE i.status NOT IN ('PAID','CANCELED')),
      COUNT(*) FILTER (WHERE i.status NOT IN ('PAID','CANCELED') AND i.due_date < current_date)
    INTO v_total_a_receber, v_total_vencido_r, v_total_a_vencer_r, v_qtd_titulos_r, v_qtd_vencidas_r
    FROM public.accounts_receivable_installments i
    JOIN public.accounts_receivable ar ON ar.id = i.receivable_id
    WHERE (v_cliente IS NULL OR ar.customer_id = v_cliente);
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp, 'receitas_abertas');
  END;

  BEGIN
    SELECT COALESCE(SUM(rp.amount_received),0)
    INTO v_total_recebido
    FROM public.receivable_payments rp
    JOIN public.accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN public.accounts_receivable ar ON ar.id = i.receivable_id
    WHERE COALESCE(rp.is_reversal,false) = false
      AND rp.payment_date BETWEEN v_data_inicio AND v_data_fim
      AND (v_cliente IS NULL OR ar.customer_id = v_cliente);
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp, 'receitas_recebidas');
  END;

  BEGIN
    SELECT
      COALESCE(SUM(CASE WHEN i.status NOT IN ('PAID','CANCELED') THEN COALESCE(i.net_amount, i.original_amount) - COALESCE(i.paid_amount,0) END),0),
      COALESCE(SUM(CASE WHEN i.status NOT IN ('PAID','CANCELED') AND i.due_date < current_date THEN COALESCE(i.net_amount, i.original_amount) - COALESCE(i.paid_amount,0) END),0),
      COALESCE(SUM(CASE WHEN i.status NOT IN ('PAID','CANCELED') AND i.due_date >= current_date THEN COALESCE(i.net_amount, i.original_amount) - COALESCE(i.paid_amount,0) END),0),
      COUNT(DISTINCT ap.id) FILTER (WHERE i.status NOT IN ('PAID','CANCELED')),
      COUNT(*) FILTER (WHERE i.status NOT IN ('PAID','CANCELED') AND i.due_date < current_date)
    INTO v_total_a_pagar, v_total_vencido_p, v_total_a_vencer_p, v_qtd_titulos_p, v_qtd_vencidas_p
    FROM public.accounts_payable_installments i
    JOIN public.accounts_payable ap ON ap.id = i.payable_id;
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp, 'despesas_abertas');
  END;

  BEGIN
    SELECT COALESCE(SUM(pp.amount_paid),0)
    INTO v_total_pago
    FROM public.payable_payments pp
    WHERE COALESCE(pp.is_reversal,false) = false
      AND pp.payment_date BETWEEN v_data_inicio AND v_data_fim;
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp, 'despesas_pagas');
  END;

  BEGIN
    SELECT COUNT(*)
    INTO v_entregas_nao_fat
    FROM public.entregas en
    LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
    WHERE en.status::text = 'entregue'
      AND en.receivable_id IS NULL
      AND COALESCE(en.financial_status,'PENDING_BILLING') = 'PENDING_BILLING'
      AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda);
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp, 'entregas_nao_faturadas');
  END;

  BEGIN
    SELECT COUNT(*), COALESCE(SUM(ar.total_amount),0)
    INTO v_entregas_fat, v_valor_fat
    FROM public.entregas en
    LEFT JOIN public.accounts_receivable ar ON ar.id = en.receivable_id
    LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
    WHERE (en.receivable_id IS NOT NULL OR en.financial_status = 'BILLED')
      AND COALESCE(en.billing_generated_at, en.updated_at, en.created_at) BETWEEN v_data_inicio AND v_data_fim + interval '1 day'
      AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda);
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp, 'entregas_faturadas');
  END;

  -- Fiscal pendente: agora respeita fazenda quando origem = DELIVERY → entrega → OS
  -- Se v_fazenda for informada, ARs sem origem DELIVERY/sem OS vinculada são excluídas.
  BEGIN
    SELECT COUNT(*)
    INTO v_fiscal_pend
    FROM public.accounts_receivable ar
    LEFT JOIN public.entregas en_o
      ON v_fazenda IS NOT NULL AND ar.origin_type = 'DELIVERY' AND en_o.id = ar.origin_id
    LEFT JOIN public.ordens_servico_onfarm oso_o
      ON v_fazenda IS NOT NULL AND oso_o.id = en_o.ordem_servico_onfarm_id
    WHERE COALESCE(ar.fiscal_invoice_required,false) = true
      AND COALESCE(ar.fiscal_invoice_status,'PENDING') NOT IN ('ISSUED','NOT_REQUIRED','CANCELED')
      AND (v_cliente IS NULL OR ar.customer_id = v_cliente)
      AND (v_fazenda IS NULL OR oso_o.fazenda_id = v_fazenda);
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp, 'fiscal_pendente');
  END;

  BEGIN
    SELECT COUNT(*)
    INTO v_recibos_pend
    FROM public.receivable_payments rp
    JOIN public.accounts_receivable_installments ari ON ari.id = rp.installment_id
    JOIN public.accounts_receivable ar ON ar.id = ari.receivable_id
    LEFT JOIN public.financial_receipts fr
      ON fr.receivable_payment_id = rp.id AND COALESCE(fr.status,'ISSUED') <> 'CANCELED'
    LEFT JOIN public.entregas en_o
      ON v_fazenda IS NOT NULL AND ar.origin_type = 'DELIVERY' AND en_o.id = ar.origin_id
    LEFT JOIN public.ordens_servico_onfarm oso_o
      ON v_fazenda IS NOT NULL AND oso_o.id = en_o.ordem_servico_onfarm_id
    WHERE COALESCE(rp.is_reversal,false) = false
      AND fr.id IS NULL
      AND rp.payment_date BETWEEN v_data_inicio AND v_data_fim
      AND (v_cliente IS NULL OR ar.customer_id = v_cliente)
      AND (v_fazenda IS NULL OR oso_o.fazenda_id = v_fazenda);
  EXCEPTION WHEN OTHERS THEN
    v_indisp := array_append(v_indisp, 'recibos_pendentes');
  END;

  v_valor_nao_fat := 0;
  IF NOT ('entregas_nao_faturadas' = ANY(v_indisp)) THEN
    v_indisp := array_append(v_indisp, 'valor_estimado_nao_faturado');
  END IF;

  IF v_total_vencido_r > 50000 OR v_total_vencido_p > 50000 OR v_entregas_nao_fat > 20 THEN
    v_score := 35; v_classif := 'critico';
  ELSIF v_total_vencido_r > 0 OR v_total_vencido_p > 0 OR v_entregas_nao_fat > 5 OR v_fiscal_pend > 5 THEN
    v_score := 65; v_classif := 'atencao';
  ELSE
    v_score := 95; v_classif := 'saudavel';
  END IF;

  IF v_total_vencido_r > 0 THEN
    v_motivos := array_append(v_motivos, 'R$ ' || to_char(v_total_vencido_r,'FM999G999G990D00') || ' vencidos a receber');
  END IF;
  IF v_total_vencido_p > 0 THEN
    v_motivos := array_append(v_motivos, 'R$ ' || to_char(v_total_vencido_p,'FM999G999G990D00') || ' vencidos a pagar');
  END IF;
  IF v_entregas_nao_fat > 0 THEN
    v_motivos := array_append(v_motivos, v_entregas_nao_fat || ' entregas não faturadas');
  END IF;
  IF v_fiscal_pend > 0 THEN
    v_motivos := array_append(v_motivos, v_fiscal_pend || ' fiscais pendentes');
  END IF;
  IF array_length(v_indisp,1) >= 4 THEN
    v_classif := 'sem_dados'; v_score := 0;
  END IF;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('data_inicio', v_data_inicio, 'data_fim', v_data_fim, 'periodo', v_periodo),
    'receitas', jsonb_build_object(
      'total_a_receber', v_total_a_receber,
      'total_recebido', v_total_recebido,
      'total_vencido', v_total_vencido_r,
      'total_a_vencer', v_total_a_vencer_r,
      'quantidade_titulos_abertos', v_qtd_titulos_r,
      'quantidade_parcelas_vencidas', v_qtd_vencidas_r
    ),
    'despesas', jsonb_build_object(
      'total_a_pagar', v_total_a_pagar,
      'total_pago', v_total_pago,
      'total_vencido', v_total_vencido_p,
      'total_a_vencer', v_total_a_vencer_p,
      'quantidade_titulos_abertos', v_qtd_titulos_p,
      'quantidade_parcelas_vencidas', v_qtd_vencidas_p
    ),
    'faturamento', jsonb_build_object(
      'entregas_nao_faturadas', v_entregas_nao_fat,
      'valor_estimado_nao_faturado', v_valor_nao_fat,
      'entregas_faturadas', v_entregas_fat,
      'valor_faturado_entregas', v_valor_fat,
      'fiscal_pendente', v_fiscal_pend,
      'recibos_pendentes', v_recibos_pend
    ),
    'risco_financeiro', jsonb_build_object(
      'score', v_score, 'classificacao', v_classif, 'motivos', to_jsonb(v_motivos)
    ),
    'dados_indisponiveis', to_jsonb(v_indisp),
    'gerado_em', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_executivo_financeiro_resumo(jsonb) TO authenticated;

-- =====================================================================
-- 2) GARGALOS: consolida tudo em tabela temp e aplica LIMIT final único
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_executivo_financeiro_gargalos(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_periodo text := COALESCE(p_filtros->>'periodo','30_dias');
  v_data_inicio date;
  v_data_fim date := current_date;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,10),1),50);
  v_pool_limit int;
  v_g jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  v_pool_limit := v_limit * 5; -- pool por bloco, antes do ranking consolidado

  v_data_inicio := CASE v_periodo
    WHEN 'hoje' THEN current_date
    WHEN '7_dias' THEN current_date - 7
    WHEN '15_dias' THEN current_date - 15
    WHEN '30_dias' THEN current_date - 30
    WHEN 'safra_atual' THEN date_trunc('year', current_date)::date
    WHEN 'personalizado' THEN COALESCE(NULLIF(p_filtros->>'data_inicio','')::date, current_date - 30)
    ELSE current_date - 30
  END;
  IF v_periodo = 'personalizado' THEN
    v_data_fim := COALESCE(NULLIF(p_filtros->>'data_fim','')::date, current_date);
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _exec_gargalos_pool (
    tipo text,
    titulo text,
    descricao text,
    gravidade text,
    valor numeric,
    cliente text,
    fazenda text,
    dias_atraso int,
    referencia_tabela text,
    referencia_id uuid,
    acao_recomendada text,
    ordenacao_data timestamp
  ) ON COMMIT DROP;
  DELETE FROM _exec_gargalos_pool;

  -- AR vencidos
  BEGIN
    INSERT INTO _exec_gargalos_pool
    SELECT 'receber_vencido',
      COALESCE(c.razao_social,'Cliente') || ' — parcela ' || i.installment_number,
      COALESCE(ar.description,''),
      CASE WHEN (current_date - i.due_date) > 30 THEN 'alta' WHEN (current_date - i.due_date) > 7 THEN 'media' ELSE 'baixa' END,
      COALESCE(i.net_amount, i.original_amount) - COALESCE(i.received_amount,0),
      c.razao_social, f.nome, current_date - i.due_date,
      'accounts_receivable', ar.id, 'Cobrar cliente',
      i.due_date::timestamp
    FROM public.accounts_receivable_installments i
    JOIN public.accounts_receivable ar ON ar.id = i.receivable_id
    LEFT JOIN public.clientes c ON c.id = ar.customer_id
    LEFT JOIN public.entregas en_o ON ar.origin_type='DELIVERY' AND en_o.id = ar.origin_id
    LEFT JOIN public.ordens_servico_onfarm oso_o ON oso_o.id = en_o.ordem_servico_onfarm_id
    LEFT JOIN public.fazendas f ON f.id = oso_o.fazenda_id
    WHERE i.status NOT IN ('PAID','CANCELED') AND i.due_date < current_date
      AND (v_cliente IS NULL OR ar.customer_id = v_cliente)
      AND (v_fazenda IS NULL OR oso_o.fazenda_id = v_fazenda)
    ORDER BY (current_date - i.due_date) DESC
    LIMIT v_pool_limit;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- AP vencidos (sem vínculo de cliente/fazenda)
  BEGIN
    IF v_cliente IS NULL AND v_fazenda IS NULL THEN
      INSERT INTO _exec_gargalos_pool
      SELECT 'pagar_vencido',
        COALESCE(ap.supplier_name,'Fornecedor') || ' — parcela ' || i.installment_number,
        COALESCE(ap.description,''),
        CASE WHEN (current_date - i.due_date) > 30 THEN 'alta' WHEN (current_date - i.due_date) > 7 THEN 'media' ELSE 'baixa' END,
        COALESCE(i.net_amount, i.original_amount) - COALESCE(i.paid_amount,0),
        NULL, NULL, current_date - i.due_date,
        'accounts_payable', ap.id, 'Revisar conta a pagar',
        i.due_date::timestamp
      FROM public.accounts_payable_installments i
      JOIN public.accounts_payable ap ON ap.id = i.payable_id
      WHERE i.status NOT IN ('PAID','CANCELED') AND i.due_date < current_date
      ORDER BY (current_date - i.due_date) DESC
      LIMIT v_pool_limit;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Entregas não faturadas
  BEGIN
    INSERT INTO _exec_gargalos_pool
    SELECT 'entrega_nao_faturada',
      'Entrega ' || substring(en.id::text,1,8),
      COALESCE(c.razao_social,''),
      CASE WHEN (current_date - COALESCE(en.entregue_em::date,en.created_at::date)) > 15 THEN 'alta' ELSE 'media' END,
      NULL,
      c.razao_social, f.nome,
      current_date - COALESCE(en.entregue_em::date, en.created_at::date),
      'entregas', en.id, 'Faturar entrega',
      COALESCE(en.entregue_em, en.created_at)
    FROM public.entregas en
    LEFT JOIN public.clientes c ON c.id = en.cliente_id
    LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
    LEFT JOIN public.fazendas f ON f.id = oso.fazenda_id
    WHERE en.status::text = 'entregue'
      AND en.receivable_id IS NULL
      AND COALESCE(en.financial_status,'PENDING_BILLING') = 'PENDING_BILLING'
      AND (v_cliente IS NULL OR en.cliente_id = v_cliente)
      AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda)
      AND COALESCE(en.entregue_em::date, en.created_at::date) BETWEEN v_data_inicio AND v_data_fim
    ORDER BY COALESCE(en.entregue_em, en.created_at) ASC
    LIMIT v_pool_limit;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Fiscal pendente
  BEGIN
    INSERT INTO _exec_gargalos_pool
    SELECT 'fiscal_pendente',
      COALESCE(c.razao_social,'Cliente') || ' — fiscal pendente',
      COALESCE(ar.description,''),
      'media',
      ar.total_amount,
      c.razao_social, f.nome,
      current_date - ar.issue_date,
      'accounts_receivable', ar.id, 'Emitir/regularizar fiscal',
      ar.issue_date::timestamp
    FROM public.accounts_receivable ar
    LEFT JOIN public.clientes c ON c.id = ar.customer_id
    LEFT JOIN public.entregas en_o ON ar.origin_type='DELIVERY' AND en_o.id = ar.origin_id
    LEFT JOIN public.ordens_servico_onfarm oso_o ON oso_o.id = en_o.ordem_servico_onfarm_id
    LEFT JOIN public.fazendas f ON f.id = oso_o.fazenda_id
    WHERE COALESCE(ar.fiscal_invoice_required,false) = true
      AND COALESCE(ar.fiscal_invoice_status,'PENDING') NOT IN ('ISSUED','NOT_REQUIRED','CANCELED')
      AND (v_cliente IS NULL OR ar.customer_id = v_cliente)
      AND (v_fazenda IS NULL OR oso_o.fazenda_id = v_fazenda)
      AND ar.issue_date BETWEEN v_data_inicio AND v_data_fim
    ORDER BY ar.issue_date ASC
    LIMIT v_pool_limit;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Consolida com ordenação final única e LIMIT global
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_g
  FROM (
    SELECT jsonb_build_object(
      'tipo', tipo,
      'titulo', titulo,
      'descricao', descricao,
      'gravidade', gravidade,
      'valor', valor,
      'cliente', cliente,
      'fazenda', fazenda,
      'dias_atraso', dias_atraso,
      'referencia_tabela', referencia_tabela,
      'referencia_id', referencia_id,
      'acao_recomendada', acao_recomendada
    ) AS x
    FROM _exec_gargalos_pool
    ORDER BY
      CASE gravidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
      COALESCE(dias_atraso,0) DESC,
      COALESCE(valor,0) DESC,
      ordenacao_data ASC NULLS LAST
    LIMIT v_limit
  ) s;

  RETURN jsonb_build_object('gargalos', v_g, 'gerado_em', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_executivo_financeiro_gargalos(jsonb, int) TO authenticated;

-- =====================================================================
-- 3) RANKING: calcula, filtra, ordena e ENTÃO aplica LIMIT
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_executivo_financeiro_ranking_clientes(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_periodo text := COALESCE(p_filtros->>'periodo','30_dias');
  v_data_inicio date;
  v_data_fim date := current_date;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,10),1),50);
  v_ranking jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
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
  IF v_periodo = 'personalizado' THEN
    v_data_fim := COALESCE(NULLIF(p_filtros->>'data_fim','')::date, current_date);
  END IF;

  BEGIN
    WITH base AS (
      SELECT
        c.id   AS cliente_id,
        c.razao_social AS cliente,
        COALESCE(ar_open.total,0)  AS valor_a_receber,
        COALESCE(ar_over.total,0)  AS valor_vencido,
        COALESCE(ar_open.qtd,0)    AS titulos_abertos,
        COALESCE(en_nf.qtd,0)      AS entregas_nao_faturadas,
        COALESCE(en_sc.qtd,0)      AS entregas_sem_comprovante
      FROM public.clientes c
      LEFT JOIN LATERAL (
        SELECT
          SUM(COALESCE(i.net_amount, i.original_amount) - COALESCE(i.received_amount,0)) AS total,
          COUNT(DISTINCT ar.id) AS qtd
        FROM public.accounts_receivable_installments i
        JOIN public.accounts_receivable ar ON ar.id = i.receivable_id
        LEFT JOIN public.entregas en_o ON v_fazenda IS NOT NULL AND ar.origin_type='DELIVERY' AND en_o.id = ar.origin_id
        LEFT JOIN public.ordens_servico_onfarm oso_o ON v_fazenda IS NOT NULL AND oso_o.id = en_o.ordem_servico_onfarm_id
        WHERE ar.customer_id = c.id
          AND i.status NOT IN ('PAID','CANCELED')
          AND ar.issue_date <= v_data_fim
          AND (v_fazenda IS NULL OR oso_o.fazenda_id = v_fazenda)
      ) ar_open ON true
      LEFT JOIN LATERAL (
        SELECT SUM(COALESCE(i.net_amount, i.original_amount) - COALESCE(i.received_amount,0)) AS total
        FROM public.accounts_receivable_installments i
        JOIN public.accounts_receivable ar ON ar.id = i.receivable_id
        LEFT JOIN public.entregas en_o ON v_fazenda IS NOT NULL AND ar.origin_type='DELIVERY' AND en_o.id = ar.origin_id
        LEFT JOIN public.ordens_servico_onfarm oso_o ON v_fazenda IS NOT NULL AND oso_o.id = en_o.ordem_servico_onfarm_id
        WHERE ar.customer_id = c.id
          AND i.status NOT IN ('PAID','CANCELED')
          AND i.due_date < current_date
          AND ar.issue_date <= v_data_fim
          AND (v_fazenda IS NULL OR oso_o.fazenda_id = v_fazenda)
      ) ar_over ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS qtd
        FROM public.entregas en
        LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
        WHERE en.cliente_id = c.id
          AND en.status::text = 'entregue'
          AND en.receivable_id IS NULL
          AND COALESCE(en.financial_status,'PENDING_BILLING') = 'PENDING_BILLING'
          AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda)
      ) en_nf ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS qtd
        FROM public.entregas en
        LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = en.ordem_servico_onfarm_id
        WHERE en.cliente_id = c.id
          AND en.status::text = 'entregue'
          AND (en.comprovante_id IS NULL OR en.comprovante_status IS DISTINCT FROM 'confirmado')
          AND (v_fazenda IS NULL OR oso.fazenda_id = v_fazenda)
      ) en_sc ON true
      WHERE (v_cliente IS NULL OR c.id = v_cliente)
    ),
    filtrado AS (
      SELECT *
      FROM base
      WHERE valor_a_receber > 0
         OR valor_vencido > 0
         OR titulos_abertos > 0
         OR entregas_nao_faturadas > 0
         OR entregas_sem_comprovante > 0
    ),
    ordenado AS (
      SELECT *
      FROM filtrado
      ORDER BY
        valor_vencido DESC NULLS LAST,
        valor_a_receber DESC NULLS LAST,
        entregas_nao_faturadas DESC NULLS LAST,
        entregas_sem_comprovante DESC NULLS LAST
      LIMIT v_limit
    )
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'cliente_id', cliente_id,
        'cliente', cliente,
        'valor_a_receber', valor_a_receber,
        'valor_vencido', valor_vencido,
        'titulos_abertos', titulos_abertos,
        'entregas_nao_faturadas', entregas_nao_faturadas,
        'entregas_sem_comprovante', entregas_sem_comprovante
      )
      ORDER BY
        valor_vencido DESC NULLS LAST,
        valor_a_receber DESC NULLS LAST,
        entregas_nao_faturadas DESC NULLS LAST,
        entregas_sem_comprovante DESC NULLS LAST
    ), '[]'::jsonb)
    INTO v_ranking
    FROM ordenado;
  EXCEPTION WHEN OTHERS THEN
    v_ranking := '[]'::jsonb;
  END;

  RETURN jsonb_build_object('ranking', v_ranking, 'gerado_em', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_executivo_financeiro_ranking_clientes(jsonb, int) TO authenticated;
