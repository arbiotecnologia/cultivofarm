
-- Correção: as RPCs de detalhe falharam na criação por causa de ORDER BY/LIMIT
-- dentro de SELECTs de UNION ALL sem parênteses. Recriando ambas.

CREATE OR REPLACE FUNCTION public.rpc_executivo_cliente_detalhe(p_cliente_id uuid, p_filtros jsonb DEFAULT '{}'::jsonb)
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
  v_fazenda uuid := NULLIF(p_filtros->>'fazenda_id','')::uuid;
  v_cliente_row record;
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

  SELECT id, COALESCE(razao_social,nome) AS nome, status_cliente::text AS status
    INTO v_cliente_row FROM public.clientes WHERE id = p_cliente_id;
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

  v_fin := jsonb_build_object(
    'valor_a_receber', COALESCE((SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0)) FROM public.accounts_receivable_installments i JOIN public.accounts_receivable ar ON ar.id=i.receivable_id WHERE ar.customer_id=p_cliente_id AND i.status NOT IN ('PAID','CANCELED')),0),
    'valor_vencido', COALESCE((SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0)) FROM public.accounts_receivable_installments i JOIN public.accounts_receivable ar ON ar.id=i.receivable_id WHERE ar.customer_id=p_cliente_id AND i.status NOT IN ('PAID','CANCELED') AND i.due_date<current_date),0),
    'valor_recebido_periodo', COALESCE((SELECT SUM(rp.amount_received) FROM public.receivable_payments rp JOIN public.accounts_receivable_installments i ON i.id=rp.installment_id JOIN public.accounts_receivable ar ON ar.id=i.receivable_id WHERE ar.customer_id=p_cliente_id AND COALESCE(rp.is_reversal,false)=false AND rp.payment_date BETWEEN v_data_inicio AND v_data_fim),0),
    'fiscal_pendente', (SELECT COUNT(*) FROM public.accounts_receivable ar WHERE ar.customer_id=p_cliente_id AND COALESCE(ar.fiscal_invoice_required,false)=true AND COALESCE(ar.fiscal_invoice_status,'PENDING') NOT IN ('ISSUED','NOT_REQUIRED','CANCELED'))
  );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'fazenda_id', f.id,
    'fazenda_nome', f.nome,
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
    (SELECT 'solicitacao'::text AS tipo, 'Solicitação'::text AS titulo, s.created_at AS data
       FROM public.portal_solicitacoes s
       WHERE s.cliente_id=p_cliente_id ORDER BY s.created_at DESC LIMIT 5)
    UNION ALL
    (SELECT 'os'::text, 'OS On-Farm'::text, o.created_at
       FROM public.ordens_servico_onfarm o WHERE o.cliente_id=p_cliente_id ORDER BY o.created_at DESC LIMIT 5)
    UNION ALL
    (SELECT 'entrega'::text, 'Entrega ' || substring(en.id::text,1,8), COALESCE(en.entregue_em,en.created_at)
       FROM public.entregas en WHERE en.cliente_id=p_cliente_id ORDER BY COALESCE(en.entregue_em,en.created_at) DESC LIMIT 5)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo',tipo,'titulo',titulo,'data',data) ORDER BY data DESC), '[]'::jsonb)
    INTO v_eventos FROM eventos;

  RETURN jsonb_build_object(
    'cliente', jsonb_build_object(
      'id', v_cliente_row.id,
      'nome', v_cliente_row.nome,
      'status', v_cliente_row.status,
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
$$;

GRANT EXECUTE ON FUNCTION public.rpc_executivo_cliente_detalhe(uuid, jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_executivo_fazenda_detalhe(p_fazenda_id uuid, p_filtros jsonb DEFAULT '{}'::jsonb)
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

  SELECT f.id, f.nome AS fazenda_nome, f.cliente_id, COALESCE(c.razao_social,c.nome) AS cliente_nome
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
    'valor_a_receber_estimado', COALESCE((
      SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0))
      FROM public.entregas en
      JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
      JOIN public.accounts_receivable ar ON ar.id=en.receivable_id
      JOIN public.accounts_receivable_installments i ON i.receivable_id=ar.id
      WHERE oso.fazenda_id=p_fazenda_id AND i.status NOT IN ('PAID','CANCELED')
    ),0),
    'valor_vencido_estimado', COALESCE((
      SELECT SUM(COALESCE(i.net_amount,i.original_amount) - COALESCE(i.received_amount,0))
      FROM public.entregas en
      JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
      JOIN public.accounts_receivable ar ON ar.id=en.receivable_id
      JOIN public.accounts_receivable_installments i ON i.receivable_id=ar.id
      WHERE oso.fazenda_id=p_fazenda_id AND i.status NOT IN ('PAID','CANCELED') AND i.due_date<current_date
    ),0)
  );

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_gargalos FROM (
    SELECT jsonb_build_object(
      'tipo','entrega_pendente',
      'titulo','Entrega ' || substring(en.id::text,1,8),
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
    (SELECT 'os'::text AS tipo, 'OS On-Farm'::text AS titulo, o.created_at AS data
       FROM public.ordens_servico_onfarm o WHERE o.fazenda_id=p_fazenda_id ORDER BY o.created_at DESC LIMIT 5)
    UNION ALL
    (SELECT 'entrega'::text, 'Entrega ' || substring(en.id::text,1,8), COALESCE(en.entregue_em,en.created_at)
       FROM public.entregas en JOIN public.ordens_servico_onfarm oso ON oso.id=en.ordem_servico_onfarm_id
       WHERE oso.fazenda_id=p_fazenda_id ORDER BY COALESCE(en.entregue_em,en.created_at) DESC LIMIT 5)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo',tipo,'titulo',titulo,'data',data) ORDER BY data DESC), '[]'::jsonb)
    INTO v_eventos FROM eventos;

  RETURN jsonb_build_object(
    'fazenda', jsonb_build_object(
      'id', v_row.id, 'nome', v_row.fazenda_nome,
      'cliente_id', v_row.cliente_id, 'cliente_nome', v_row.cliente_nome
    ),
    'operacional', v_op,
    'financeiro', v_fin,
    'gargalos', v_gargalos,
    'ultimos_eventos', v_eventos,
    'gerado_em', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_executivo_fazenda_detalhe(uuid, jsonb) TO authenticated;
