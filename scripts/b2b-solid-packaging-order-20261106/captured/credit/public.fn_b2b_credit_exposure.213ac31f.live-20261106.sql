CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure(p_partner_id uuid, p_new_order_amount numeric DEFAULT 0, p_exclude_order_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit numeric(14,2); v_open numeric(14,2); v_overdue numeric(14,2);
  v_committed numeric(14,2); v_pending numeric(14,2);
  v_new numeric(14,2) := ROUND(COALESCE(p_new_order_amount,0),2);
  v_proj numeric(14,2); v_disp numeric(14,2); v_pct numeric;
  v_tolerance int; v_block boolean; v_action text; v_reason text;
BEGIN
  SELECT COALESCE(credit_limit,0), COALESCE(overdue_tolerance_days,0),
         COALESCE(block_if_overdue,false), COALESCE(credit_limit_action,'block')
    INTO v_limit, v_tolerance, v_block, v_action
  FROM public.partner_financial_settings WHERE partner_id = p_partner_id;
  v_limit := COALESCE(v_limit,0); v_tolerance := COALESCE(v_tolerance,0);
  v_block := COALESCE(v_block,false); v_action := COALESCE(v_action,'block');

  -- (a) recebiveis em aberto do parceiro
  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_open
  FROM public.accounts_receivable ar
  JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.partner_id = p_partner_id
    AND ar.status <> 'CANCELED'
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_overdue
  FROM public.accounts_receivable ar
  JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.partner_id = p_partner_id
    AND ar.status <> 'CANCELED'
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
    AND ari.due_date < (current_date - v_tolerance);

  -- (b) pedidos com compromisso financeiro real e SEM recebivel gerado
  SELECT COALESCE(SUM(ROUND(COALESCE(po.final_amount_with_interest, po.total, 0),2)),0)
    INTO v_committed
  FROM public.partner_orders po
  WHERE po.partner_id = p_partner_id
    AND po.status IN ('aprovado','em_producao','produzido','aguardando_entrega',
                      'confirmado','em_separacao','enviado','entregue')
    AND COALESCE(po.receivable_generated,false) = false
    AND NOT EXISTS (SELECT 1 FROM public.partner_order_financial_links pofl
                    WHERE pofl.partner_order_id = po.id)
    AND (p_exclude_order_id IS NULL OR po.id <> p_exclude_order_id);

  -- (c) H4-001: pedidos vivos ainda nao aprovados ja consomem limite.
  --     Sem isso, N pedidos em analise passavam individualmente no teste
  --     de credito e estouravam o limite ao serem aprovados.
  SELECT COALESCE(SUM(ROUND(COALESCE(po.final_amount_with_interest, po.total, 0),2)),0)
    INTO v_pending
  FROM public.partner_orders po
  WHERE po.partner_id = p_partner_id
    AND po.status IN ('pendente','solicitado','em_analise_comercial',
                      'aguardando_aprovacao_credito','aguardando_ajuste_comercial',
                      'aguardando_itens')
    AND COALESCE(po.receivable_generated,false) = false
    AND NOT EXISTS (SELECT 1 FROM public.partner_order_financial_links pofl
                    WHERE pofl.partner_order_id = po.id)
    AND (p_exclude_order_id IS NULL OR po.id <> p_exclude_order_id);

  v_proj := ROUND(v_open + v_committed + v_pending + v_new, 2);
  v_disp := GREATEST(v_limit - v_proj, 0);
  v_pct  := CASE WHEN v_limit > 0 THEN ROUND((v_proj / v_limit) * 100, 2) ELSE 0 END;

  v_reason := CASE
    WHEN v_block AND v_overdue > 0 THEN 'OVERDUE_BLOCK'
    WHEN v_limit <= 0 THEN 'NO_LIMIT_DEFINED'
    WHEN v_proj > v_limit AND v_action = 'approval_required' THEN 'LIMIT_EXCEEDED_APPROVAL'
    WHEN v_proj > v_limit THEN 'LIMIT_EXCEEDED_BLOCK'
    ELSE 'OK' END;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'credit_limit', v_limit,
    'saldo_em_aberto', v_open,
    'saldo_vencido', v_overdue,
    'comprometido_nao_faturado', v_committed,
    'comprometido_pendente', v_pending,
    'novo_pedido', v_new,
    'exposicao_atual', ROUND(v_open + v_committed + v_pending, 2),
    'exposicao_projetada', v_proj,
    'credito_disponivel', v_disp,
    'percentual_utilizado', v_pct,
    'overdue_tolerance_days', v_tolerance,
    'block_if_overdue', v_block,
    'credit_limit_action', v_action,
    'tem_vencidos', v_overdue > 0,
    'reason_code', v_reason
  );
END $function$
