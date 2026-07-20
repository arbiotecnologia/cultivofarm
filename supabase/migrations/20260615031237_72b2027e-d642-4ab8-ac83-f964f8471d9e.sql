
-- ============================================================
-- Fase 13.3.1 — Correção RPCs Clientes & Fazendas Executivo
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_executivo_cliente_detalhe(p_cliente_id uuid, p_filtros jsonb DEFAULT '{}'::jsonb)
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
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_cli record;
  v_op jsonb;
  v_fin jsonb;
  v_fazendas jsonb := '[]'::jsonb;
  v_gargalos jsonb := '[]'::jsonb;
  v_eventos jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;
  IF p_cliente_id IS NULL THEN RAISE EXCEPTION 'cliente_id obrigatório'; END IF;

  SELECT c.id, COALESCE(c.razao_social, c.nome) AS nome,
         c.tipo_pessoa::text AS tipo,
         c.cpf_cnpj AS documento,
         c.status_cliente::text AS status_cliente
    INTO v_cli FROM public.clientes c WHERE c.id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;

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

  v_op := jsonb_build_object(
    'solicitacoes', (SELECT COUNT(*) FROM public.portal_solicitacoes s WHERE s.cliente_id=p_cliente_id AND s.created_at::date BETWEEN v_data_inicio AND v_data_fim),
    'visitas', (SELECT COUNT(*) FROM public.vw_fluxo_visita_tecnica v WHERE v.cliente_id=p_cliente_id AND COALESCE(v.data_checkin,v.data_vistoria)::date BETWEEN v_data_inicio AND v_data_fim),
    'recomendacoes', (SELECT COUNT(*) FROM public.registros_consultor rc WHERE rc.cliente_id=p_cliente_id AND rc.created_at::date BETWEEN v_data_inicio AND v_data_fim),
    'os_total', (SELECT COUNT(*) FROM public.ordens_servico_onfarm o WHERE o.cliente_id=p_cliente_id AND (v_fazenda IS NULL OR o.fazenda_id=v_fazenda)),
    'os_ativas', (SELECT COUNT(*) FROM public.ordens_servico_onfarm o WHERE o.cliente_id=p_cliente_id AND o.status::text NOT IN ('entregue','finalizada','cancelada') AND (v_fazenda IS NULL OR o.fazenda_id=v_fazenda)),
    'entregas_total', (SELECT COUNT(*) FROM public.entregas en LEFT JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE en.cliente_id=p_cliente_id AND (v_fazenda IS NULL OR oso.fazenda_id=v_fazenda)),
    'entregas_pendentes', (SELECT COUNT(*) FROM public.entregas en LEFT JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE en.cliente_id=p_cliente_id AND en.status::text IN ('separado','em_rota') AND (v_fazenda IS NULL OR oso.fazenda_id=v_fazenda)),
    'entregas_sem_comprovante', (SELECT COUNT(*) FROM public.entregas en LEFT JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE en.cliente_id=p_cliente_id AND en.status::text='entregue' AND (en.comprovante_id IS NULL OR en.comprovante_status IS DISTINCT FROM 'confirmado') AND (v_fazenda IS NULL OR oso.fazenda_id=v_fazenda)),
    'entregas_nao_faturadas', (SELECT COUNT(*) FROM public.entregas en LEFT JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE en.cliente_id=p_cliente_id AND en.status::text='entregue' AND en.receivable_id IS NULL AND COALESCE(en.financial_status,'PENDING_BILLING')='PENDING_BILLING' AND (v_fazenda IS NULL OR oso.fazenda_id=v_fazenda))
  );

  IF v_fazenda IS NULL THEN
    v_fin := jsonb_build_object(
      'valor_a_receber', COALESCE((SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0)) FROM public.accounts_receivable_installments i JOIN public.accounts_receivable ar ON ar.id=i.receivable_id WHERE ar.customer_id=p_cliente_id AND i.status NOT IN ('PAID','CANCELED')),0),
      'valor_vencido', COALESCE((SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0)) FROM public.accounts_receivable_installments i JOIN public.accounts_receivable ar ON ar.id=i.receivable_id WHERE ar.customer_id=p_cliente_id AND i.status NOT IN ('PAID','CANCELED') AND i.due_date<current_date),0),
      'valor_recebido_periodo', COALESCE((SELECT SUM(rp.amount_received) FROM public.receivable_payments rp JOIN public.accounts_receivable_installments i ON i.id=rp.installment_id JOIN public.accounts_receivable ar ON ar.id=i.receivable_id WHERE ar.customer_id=p_cliente_id AND COALESCE(rp.is_reversal,false)=false AND rp.payment_date BETWEEN v_data_inicio AND v_data_fim),0),
      'fiscal_pendente', (SELECT COUNT(*) FROM public.accounts_receivable ar WHERE ar.customer_id=p_cliente_id AND COALESCE(ar.fiscal_invoice_required,false)=true AND COALESCE(ar.fiscal_invoice_status,'PENDING') NOT IN ('ISSUED','NOT_REQUIRED','CANCELED')),
      'fonte', 'cliente_consolidado'
    );
  ELSE
    -- Filtro por fazenda: apenas AR com origem em entrega vinculada à OS On-Farm da fazenda
    v_fin := jsonb_build_object(
      'valor_a_receber', COALESCE((
        SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0))
        FROM public.accounts_receivable ar
        JOIN public.accounts_receivable_installments i ON i.receivable_id=ar.id
        JOIN public.entregas en ON en.id = ar.origin_id AND ar.origin_type='DELIVERY'
        JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
        WHERE ar.customer_id=p_cliente_id AND oso.fazenda_id=v_fazenda AND i.status NOT IN ('PAID','CANCELED')
      ),0),
      'valor_vencido', COALESCE((
        SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0))
        FROM public.accounts_receivable ar
        JOIN public.accounts_receivable_installments i ON i.receivable_id=ar.id
        JOIN public.entregas en ON en.id = ar.origin_id AND ar.origin_type='DELIVERY'
        JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
        WHERE ar.customer_id=p_cliente_id AND oso.fazenda_id=v_fazenda AND i.status NOT IN ('PAID','CANCELED') AND i.due_date<current_date
      ),0),
      'valor_recebido_periodo', COALESCE((
        SELECT SUM(rp.amount_received)
        FROM public.receivable_payments rp
        JOIN public.accounts_receivable_installments i ON i.id=rp.installment_id
        JOIN public.accounts_receivable ar ON ar.id=i.receivable_id
        JOIN public.entregas en ON en.id = ar.origin_id AND ar.origin_type='DELIVERY'
        JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
        WHERE ar.customer_id=p_cliente_id AND oso.fazenda_id=v_fazenda AND COALESCE(rp.is_reversal,false)=false AND rp.payment_date BETWEEN v_data_inicio AND v_data_fim
      ),0),
      'fiscal_pendente', (
        SELECT COUNT(*) FROM public.accounts_receivable ar
        JOIN public.entregas en ON en.id = ar.origin_id AND ar.origin_type='DELIVERY'
        JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
        WHERE ar.customer_id=p_cliente_id AND oso.fazenda_id=v_fazenda AND COALESCE(ar.fiscal_invoice_required,false)=true AND COALESCE(ar.fiscal_invoice_status,'PENDING') NOT IN ('ISSUED','NOT_REQUIRED','CANCELED')
      ),
      'fonte', 'entregas_vinculadas_os_onfarm'
    );
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'nome', f.nome,
    'municipio', f.municipio,
    'estado', f.estado,
    'area_total', f.area_total,
    'os_total', (SELECT COUNT(*) FROM public.ordens_servico_onfarm o WHERE o.fazenda_id=f.id),
    'entregas_total', (SELECT COUNT(*) FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE oso.fazenda_id=f.id),
    'entregas_pendentes', (SELECT COUNT(*) FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE oso.fazenda_id=f.id AND en.status::text IN ('separado','em_rota')),
    'alertas_criticos', (SELECT COUNT(*) FROM public.alertas_operacionais a WHERE a.fazenda_id=f.id AND a.gravidade='critica' AND a.status IN ('aberto','lido','reaberto'))
  )), '[]'::jsonb) INTO v_fazendas
  FROM public.fazendas f
  WHERE f.cliente_id = p_cliente_id AND COALESCE(f.ativo,true)=true
    AND (v_fazenda IS NULL OR f.id=v_fazenda);

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_gargalos FROM (
    SELECT jsonb_build_object(
      'tipo','receber_vencido',
      'titulo','Parcela vencida ' || i.installment_number,
      'descricao','Parcela ' || i.installment_number || ' vencida há ' || (current_date - i.due_date) || ' dias',
      'gravidade', CASE WHEN current_date-i.due_date > 30 THEN 'alta' WHEN current_date-i.due_date > 7 THEN 'media' ELSE 'baixa' END,
      'valor', COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0),
      'dias_atraso', current_date - i.due_date,
      'referencia_tabela','accounts_receivable',
      'referencia_id', ar.id
    ) AS x
    FROM public.accounts_receivable_installments i
    JOIN public.accounts_receivable ar ON ar.id=i.receivable_id
    WHERE ar.customer_id=p_cliente_id AND i.status NOT IN ('PAID','CANCELED') AND i.due_date < current_date
    ORDER BY (current_date - i.due_date) DESC LIMIT 10
  ) s;

  WITH eventos AS (
    (SELECT 'solicitacao'::text AS tipo, 'Solicitação'::text AS titulo,
            'Nova solicitação registrada'::text AS descricao, s.created_at AS data
       FROM public.portal_solicitacoes s WHERE s.cliente_id=p_cliente_id ORDER BY s.created_at DESC LIMIT 5)
    UNION ALL
    (SELECT 'os'::text, 'OS On-Farm'::text, ('OS ' || COALESCE(o.numero,'#'))::text, o.created_at
       FROM public.ordens_servico_onfarm o WHERE o.cliente_id=p_cliente_id ORDER BY o.created_at DESC LIMIT 5)
    UNION ALL
    (SELECT 'entrega'::text, ('Entrega ' || substring(en.id::text,1,8))::text,
            ('Status: ' || en.status::text)::text, COALESCE(en.entregue_em,en.created_at)
       FROM public.entregas en WHERE en.cliente_id=p_cliente_id ORDER BY COALESCE(en.entregue_em,en.created_at) DESC LIMIT 5)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo',tipo,'titulo',titulo,'descricao',descricao,'data',data) ORDER BY data DESC), '[]'::jsonb)
    INTO v_eventos FROM eventos;

  RETURN jsonb_build_object(
    'cliente', jsonb_build_object(
      'id', v_cli.id,
      'nome', v_cli.nome,
      'tipo', v_cli.tipo,
      'documento', v_cli.documento,
      'status_cliente', v_cli.status_cliente,
      'fazendas_total', (SELECT COUNT(*) FROM public.fazendas f WHERE f.cliente_id=p_cliente_id AND COALESCE(f.ativo,true)=true)
    ),
    'operacional', v_op,
    'financeiro', v_fin,
    'fazendas', v_fazendas,
    'gargalos', v_gargalos,
    'ultimos_eventos', v_eventos,
    'gerado_em', now()
  );
END;
$function$;

-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_executivo_fazenda_detalhe(p_fazenda_id uuid, p_filtros jsonb DEFAULT '{}'::jsonb)
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
  v_row record;
  v_op jsonb;
  v_fin jsonb;
  v_gargalos jsonb := '[]'::jsonb;
  v_eventos jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
  END IF;
  IF p_fazenda_id IS NULL THEN RAISE EXCEPTION 'fazenda_id obrigatório'; END IF;

  SELECT f.id, f.nome, f.municipio, f.estado, f.area_total,
         f.cliente_id, COALESCE(c.razao_social,c.nome) AS cliente_nome
    INTO v_row
    FROM public.fazendas f LEFT JOIN public.clientes c ON c.id=f.cliente_id
    WHERE f.id = p_fazenda_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fazenda não encontrada'; END IF;

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

  v_op := jsonb_build_object(
    'visitas', (SELECT COUNT(*) FROM public.vw_fluxo_visita_tecnica v WHERE v.fazenda_id=p_fazenda_id AND COALESCE(v.data_checkin,v.data_vistoria)::date BETWEEN v_data_inicio AND v_data_fim),
    'recomendacoes', (SELECT COUNT(*) FROM public.registros_consultor rc WHERE rc.fazenda_id=p_fazenda_id AND rc.created_at::date BETWEEN v_data_inicio AND v_data_fim),
    'os_total', (SELECT COUNT(*) FROM public.ordens_servico_onfarm o WHERE o.fazenda_id=p_fazenda_id),
    'os_ativas', (SELECT COUNT(*) FROM public.ordens_servico_onfarm o WHERE o.fazenda_id=p_fazenda_id AND o.status::text NOT IN ('entregue','finalizada','cancelada')),
    'entregas_total', (SELECT COUNT(*) FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE oso.fazenda_id=p_fazenda_id),
    'entregas_pendentes', (SELECT COUNT(*) FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE oso.fazenda_id=p_fazenda_id AND en.status::text IN ('separado','em_rota')),
    'entregas_sem_comprovante', (SELECT COUNT(*) FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE oso.fazenda_id=p_fazenda_id AND en.status::text='entregue' AND (en.comprovante_id IS NULL OR en.comprovante_status IS DISTINCT FROM 'confirmado')),
    'entregas_nao_faturadas', (SELECT COUNT(*) FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE oso.fazenda_id=p_fazenda_id AND en.status::text='entregue' AND en.receivable_id IS NULL AND COALESCE(en.financial_status,'PENDING_BILLING')='PENDING_BILLING'),
    'alertas_criticos', (SELECT COUNT(*) FROM public.alertas_operacionais a WHERE a.fazenda_id=p_fazenda_id AND a.gravidade='critica' AND a.status IN ('aberto','lido','reaberto'))
  );

  v_fin := jsonb_build_object(
    'valor_a_receber', COALESCE((
      SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0))
      FROM public.accounts_receivable ar
      JOIN public.accounts_receivable_installments i ON i.receivable_id=ar.id
      JOIN public.entregas en ON en.id = ar.origin_id AND ar.origin_type='DELIVERY'
      JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
      WHERE oso.fazenda_id=p_fazenda_id AND i.status NOT IN ('PAID','CANCELED')
    ),0),
    'valor_vencido', COALESCE((
      SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0))
      FROM public.accounts_receivable ar
      JOIN public.accounts_receivable_installments i ON i.receivable_id=ar.id
      JOIN public.entregas en ON en.id = ar.origin_id AND ar.origin_type='DELIVERY'
      JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
      WHERE oso.fazenda_id=p_fazenda_id AND i.status NOT IN ('PAID','CANCELED') AND i.due_date<current_date
    ),0),
    'valor_recebido_periodo', COALESCE((
      SELECT SUM(rp.amount_received)
      FROM public.receivable_payments rp
      JOIN public.accounts_receivable_installments i ON i.id=rp.installment_id
      JOIN public.accounts_receivable ar ON ar.id=i.receivable_id
      JOIN public.entregas en ON en.id = ar.origin_id AND ar.origin_type='DELIVERY'
      JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
      WHERE oso.fazenda_id=p_fazenda_id AND COALESCE(rp.is_reversal,false)=false AND rp.payment_date BETWEEN v_data_inicio AND v_data_fim
    ),0),
    'valor_faturado', COALESCE((
      SELECT SUM(COALESCE(ar.total_amount, ar.original_amount, 0))
      FROM public.accounts_receivable ar
      JOIN public.entregas en ON en.id = ar.origin_id AND ar.origin_type='DELIVERY'
      JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
      WHERE oso.fazenda_id=p_fazenda_id
    ),0),
    'fiscal_pendente', (
      SELECT COUNT(*) FROM public.accounts_receivable ar
      JOIN public.entregas en ON en.id = ar.origin_id AND ar.origin_type='DELIVERY'
      JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
      WHERE oso.fazenda_id=p_fazenda_id AND COALESCE(ar.fiscal_invoice_required,false)=true AND COALESCE(ar.fiscal_invoice_status,'PENDING') NOT IN ('ISSUED','NOT_REQUIRED','CANCELED')
    ),
    'fonte', 'entregas_vinculadas_os_onfarm'
  );

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_gargalos FROM (
    SELECT jsonb_build_object(
      'tipo','entrega_pendente',
      'titulo','Entrega ' || substring(en.id::text,1,8),
      'descricao','Entrega com status ' || en.status::text,
      'gravidade', CASE WHEN current_date-COALESCE(en.entregue_em::date,en.created_at::date) > 15 THEN 'alta' ELSE 'media' END,
      'dias_atraso', current_date - COALESCE(en.entregue_em::date,en.created_at::date),
      'referencia_tabela','entregas',
      'referencia_id', en.id
    ) AS x
    FROM public.entregas en
    JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
    WHERE oso.fazenda_id=p_fazenda_id
      AND (en.status::text IN ('separado','em_rota')
        OR (en.status::text='entregue' AND (en.comprovante_id IS NULL OR en.comprovante_status IS DISTINCT FROM 'confirmado'))
        OR (en.status::text='entregue' AND en.receivable_id IS NULL AND COALESCE(en.financial_status,'PENDING_BILLING')='PENDING_BILLING'))
    ORDER BY COALESCE(en.entregue_em,en.created_at) DESC LIMIT 10
  ) s;

  WITH eventos AS (
    (SELECT 'os'::text AS tipo, 'OS On-Farm'::text AS titulo,
            ('OS ' || COALESCE(o.numero,'#'))::text AS descricao, o.created_at AS data
       FROM public.ordens_servico_onfarm o WHERE o.fazenda_id=p_fazenda_id ORDER BY o.created_at DESC LIMIT 5)
    UNION ALL
    (SELECT 'entrega'::text, ('Entrega ' || substring(en.id::text,1,8))::text,
            ('Status: ' || en.status::text)::text, COALESCE(en.entregue_em,en.created_at)
       FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
       WHERE oso.fazenda_id=p_fazenda_id ORDER BY COALESCE(en.entregue_em,en.created_at) DESC LIMIT 5)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo',tipo,'titulo',titulo,'descricao',descricao,'data',data) ORDER BY data DESC), '[]'::jsonb)
    INTO v_eventos FROM eventos;

  RETURN jsonb_build_object(
    'fazenda', jsonb_build_object(
      'id', v_row.id,
      'nome', v_row.nome,
      'municipio', v_row.municipio,
      'estado', v_row.estado,
      'area_total', v_row.area_total,
      'cliente_id', v_row.cliente_id,
      'cliente_nome', v_row.cliente_nome
    ),
    'operacional', v_op,
    'financeiro', v_fin,
    'gargalos', v_gargalos,
    'ultimos_eventos', v_eventos,
    'gerado_em', now()
  );
END;
$function$;

-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_executivo_clientes_ranking(p_filtros jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_periodo text := COALESCE(p_filtros->>'periodo','30_dias');
  v_data_inicio date; v_data_fim date := current_date;
  v_cliente uuid := NULLIF(p_filtros->>'cliente_id','')::uuid;
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,10),1),50);
  v_clientes jsonb := '[]'::jsonb; v_fazendas jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
  v_data_inicio := CASE v_periodo
    WHEN 'hoje' THEN current_date WHEN '7_dias' THEN current_date - 7
    WHEN '15_dias' THEN current_date - 15 WHEN '30_dias' THEN current_date - 30
    WHEN 'safra_atual' THEN date_trunc('year', current_date)::date
    WHEN 'personalizado' THEN COALESCE(NULLIF(p_filtros->>'data_inicio','')::date, current_date - 30)
    ELSE current_date - 30 END;
  IF v_periodo='personalizado' THEN v_data_fim := COALESCE(NULLIF(p_filtros->>'data_fim','')::date, current_date); END IF;

  BEGIN
    WITH base AS (
      SELECT c.id AS cliente_id, COALESCE(c.razao_social, c.nome) AS cliente_nome,
        (SELECT COUNT(*) FROM public.fazendas f WHERE f.cliente_id=c.id AND COALESCE(f.ativo,true)=true) AS fazendas_total,
        (SELECT COUNT(*) FROM public.portal_solicitacoes s WHERE s.cliente_id=c.id AND s.created_at::date BETWEEN v_data_inicio AND v_data_fim) AS solicitacoes,
        (SELECT COUNT(*) FROM public.vw_fluxo_visita_tecnica v WHERE v.cliente_id=c.id AND COALESCE(v.data_checkin,v.data_vistoria)::date BETWEEN v_data_inicio AND v_data_fim) AS visitas,
        (SELECT COUNT(*) FROM public.registros_consultor rc WHERE rc.cliente_id=c.id AND rc.created_at::date BETWEEN v_data_inicio AND v_data_fim) AS recomendacoes,
        (SELECT COUNT(*) FROM public.ordens_servico_onfarm o WHERE o.cliente_id=c.id AND (v_fazenda IS NULL OR o.fazenda_id=v_fazenda)) AS os_total,
        (SELECT COUNT(*) FROM public.entregas en LEFT JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE en.cliente_id=c.id AND (v_fazenda IS NULL OR oso.fazenda_id=v_fazenda)) AS entregas_total,
        (SELECT COUNT(*) FROM public.entregas en LEFT JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE en.cliente_id=c.id AND en.status::text='entregue' AND en.receivable_id IS NULL AND COALESCE(en.financial_status,'PENDING_BILLING')='PENDING_BILLING' AND (v_fazenda IS NULL OR oso.fazenda_id=v_fazenda)) AS entregas_nao_faturadas,
        CASE WHEN v_fazenda IS NULL THEN
          COALESCE((SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0)) FROM public.accounts_receivable_installments i JOIN public.accounts_receivable ar ON ar.id=i.receivable_id WHERE ar.customer_id=c.id AND i.status NOT IN ('PAID','CANCELED')),0)
        ELSE
          COALESCE((SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0))
            FROM public.accounts_receivable ar
            JOIN public.accounts_receivable_installments i ON i.receivable_id=ar.id
            JOIN public.entregas en ON en.id=ar.origin_id AND ar.origin_type='DELIVERY'
            JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
            WHERE ar.customer_id=c.id AND oso.fazenda_id=v_fazenda AND i.status NOT IN ('PAID','CANCELED')),0)
        END AS valor_a_receber,
        CASE WHEN v_fazenda IS NULL THEN
          COALESCE((SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0)) FROM public.accounts_receivable_installments i JOIN public.accounts_receivable ar ON ar.id=i.receivable_id WHERE ar.customer_id=c.id AND i.status NOT IN ('PAID','CANCELED') AND i.due_date<current_date),0)
        ELSE
          COALESCE((SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0))
            FROM public.accounts_receivable ar
            JOIN public.accounts_receivable_installments i ON i.receivable_id=ar.id
            JOIN public.entregas en ON en.id=ar.origin_id AND ar.origin_type='DELIVERY'
            JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
            WHERE ar.customer_id=c.id AND oso.fazenda_id=v_fazenda AND i.status NOT IN ('PAID','CANCELED') AND i.due_date<current_date),0)
        END AS valor_vencido,
        CASE WHEN v_fazenda IS NULL THEN
          COALESCE((SELECT SUM(rp.amount_received) FROM public.receivable_payments rp JOIN public.accounts_receivable_installments i ON i.id=rp.installment_id JOIN public.accounts_receivable ar ON ar.id=i.receivable_id WHERE ar.customer_id=c.id AND COALESCE(rp.is_reversal,false)=false AND rp.payment_date BETWEEN v_data_inicio AND v_data_fim),0)
        ELSE
          COALESCE((SELECT SUM(rp.amount_received)
            FROM public.receivable_payments rp
            JOIN public.accounts_receivable_installments i ON i.id=rp.installment_id
            JOIN public.accounts_receivable ar ON ar.id=i.receivable_id
            JOIN public.entregas en ON en.id=ar.origin_id AND ar.origin_type='DELIVERY'
            JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
            WHERE ar.customer_id=c.id AND oso.fazenda_id=v_fazenda AND COALESCE(rp.is_reversal,false)=false AND rp.payment_date BETWEEN v_data_inicio AND v_data_fim),0)
        END AS valor_recebido_periodo,
        (SELECT COUNT(*) FROM public.alertas_operacionais a WHERE a.cliente_id=c.id AND a.gravidade='critica' AND a.status IN ('aberto','lido','reaberto') AND (v_fazenda IS NULL OR a.fazenda_id=v_fazenda)) AS alertas_criticos
      FROM public.clientes c
      WHERE COALESCE(c.status_cliente::text,'ativo')='ativo' AND (v_cliente IS NULL OR c.id=v_cliente)),
    com_score AS (
      SELECT *, GREATEST(LEAST(
        100 - CASE WHEN valor_vencido>0 THEN 25 ELSE 0 END
            - LEAST(entregas_nao_faturadas*5, 25)
            - LEAST(alertas_criticos*15, 30)
            + CASE WHEN valor_recebido_periodo>0 THEN 5 ELSE 0 END
            + CASE WHEN visitas>0 THEN 5 ELSE 0 END, 100), 0) AS score_cliente
      FROM base
      WHERE solicitacoes+visitas+recomendacoes+os_total+entregas_total+entregas_nao_faturadas+alertas_criticos>0
         OR valor_a_receber>0 OR valor_vencido>0 OR valor_recebido_periodo>0),
    ordenado AS (
      SELECT * FROM com_score
      ORDER BY valor_vencido DESC NULLS LAST, valor_a_receber DESC NULLS LAST,
               entregas_nao_faturadas DESC NULLS LAST, alertas_criticos DESC NULLS LAST,
               (solicitacoes+visitas+os_total+entregas_total) DESC NULLS LAST
      LIMIT v_limit)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'cliente_id', cliente_id, 'cliente_nome', cliente_nome,
      'fazendas_total', fazendas_total, 'solicitacoes', solicitacoes,
      'visitas', visitas, 'recomendacoes', recomendacoes,
      'os_total', os_total, 'entregas_total', entregas_total,
      'entregas_nao_faturadas', entregas_nao_faturadas,
      'valor_a_receber', valor_a_receber, 'valor_vencido', valor_vencido,
      'valor_recebido_periodo', valor_recebido_periodo,
      'alertas_criticos', alertas_criticos, 'score_cliente', score_cliente,
      'classificacao', CASE WHEN score_cliente>=80 THEN 'saudavel' WHEN score_cliente>=50 THEN 'atencao' ELSE 'critico' END
    )), '[]'::jsonb) INTO v_clientes FROM ordenado;
  EXCEPTION WHEN OTHERS THEN v_clientes := '[]'::jsonb; END;

  BEGIN
    WITH base AS (
      SELECT f.id AS fazenda_id, f.nome AS fazenda_nome, COALESCE(c.razao_social, c.nome) AS cliente_nome,
        (SELECT COUNT(*) FROM public.vw_fluxo_visita_tecnica v WHERE v.fazenda_id=f.id AND COALESCE(v.data_checkin,v.data_vistoria)::date BETWEEN v_data_inicio AND v_data_fim) AS visitas,
        (SELECT COUNT(*) FROM public.registros_consultor rc WHERE rc.fazenda_id=f.id AND rc.created_at::date BETWEEN v_data_inicio AND v_data_fim) AS recomendacoes,
        (SELECT COUNT(*) FROM public.ordens_servico_onfarm o WHERE o.fazenda_id=f.id) AS os_total,
        (SELECT COUNT(*) FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE oso.fazenda_id=f.id) AS entregas_total,
        (SELECT COUNT(*) FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE oso.fazenda_id=f.id AND en.status::text IN ('separado','em_rota')) AS entregas_pendentes,
        (SELECT COUNT(*) FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE oso.fazenda_id=f.id AND en.status::text='entregue' AND (en.comprovante_id IS NULL OR en.comprovante_status IS DISTINCT FROM 'confirmado')) AS entregas_sem_comprovante,
        (SELECT COUNT(*) FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id WHERE oso.fazenda_id=f.id AND en.status::text='entregue' AND en.receivable_id IS NULL AND COALESCE(en.financial_status,'PENDING_BILLING')='PENDING_BILLING') AS entregas_nao_faturadas,
        (SELECT COUNT(*) FROM public.alertas_operacionais a WHERE a.fazenda_id=f.id AND a.gravidade='critica' AND a.status IN ('aberto','lido','reaberto')) AS alertas_criticos
      FROM public.fazendas f LEFT JOIN public.clientes c ON c.id=f.cliente_id
      WHERE COALESCE(f.ativo,true)=true
        AND (v_cliente IS NULL OR f.cliente_id=v_cliente)
        AND (v_fazenda IS NULL OR f.id=v_fazenda)),
    com_score AS (
      SELECT *, GREATEST(LEAST(
        100 - LEAST(entregas_pendentes*3, 15) - LEAST(entregas_sem_comprovante*5, 25)
            - LEAST(entregas_nao_faturadas*5, 25) - LEAST(alertas_criticos*15, 30)
            + CASE WHEN visitas>0 THEN 5 ELSE 0 END, 100), 0) AS score_fazenda
      FROM base
      WHERE visitas+recomendacoes+os_total+entregas_total+entregas_pendentes+entregas_sem_comprovante+entregas_nao_faturadas+alertas_criticos>0),
    ordenado AS (
      SELECT * FROM com_score
      ORDER BY (entregas_pendentes+entregas_sem_comprovante+entregas_nao_faturadas) DESC NULLS LAST,
               (os_total+entregas_total) DESC NULLS LAST, alertas_criticos DESC NULLS LAST
      LIMIT v_limit)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fazenda_id', fazenda_id, 'fazenda_nome', fazenda_nome, 'cliente_nome', cliente_nome,
      'visitas', visitas, 'recomendacoes', recomendacoes,
      'os_total', os_total, 'entregas_total', entregas_total,
      'entregas_pendentes', entregas_pendentes,
      'entregas_sem_comprovante', entregas_sem_comprovante,
      'entregas_nao_faturadas', entregas_nao_faturadas,
      'alertas_criticos', alertas_criticos, 'score_fazenda', score_fazenda,
      'classificacao', CASE WHEN score_fazenda>=80 THEN 'saudavel' WHEN score_fazenda>=50 THEN 'atencao' ELSE 'critico' END
    )), '[]'::jsonb) INTO v_fazendas FROM ordenado;
  EXCEPTION WHEN OTHERS THEN v_fazendas := '[]'::jsonb; END;

  RETURN jsonb_build_object('ranking_clientes', v_clientes, 'ranking_fazendas', v_fazendas, 'gerado_em', now());
END; $function$;
