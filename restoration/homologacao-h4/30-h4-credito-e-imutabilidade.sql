-- =====================================================================
-- FASE H4 — Fluxo Comercial/B2B — correções P1/P2
-- Alvo exclusivo: staging ikaauvsflpmamgxmkhoq (produção intocada)
--
-- H4-001 (P1) Limite de crédito burlável por pedidos pendentes:
--   fn_b2b_credit_exposure só considerava pedidos 'aprovado'+ como
--   comprometidos. Vários pedidos simultâneos/sequenciais em análise não
--   somavam exposição, permitindo estourar o limite. Passa a existir o
--   bucket comprometido_pendente e recheck de crédito na aprovação.
--
-- H4-002 (P2) Edição material pós-aprovação:
--   partner_order_items era gravável por admin/gestor_comercial em
--   qualquer status. Passa a ser imutável a partir de 'aprovado'.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Exposição de crédito com pedidos pendentes (compromisso em curso)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure(
  p_partner_id uuid,
  p_new_order_amount numeric DEFAULT 0,
  p_exclude_order_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit numeric(14,2); v_open numeric(14,2); v_overdue numeric(14,2);
  v_committed numeric(14,2); v_pending numeric(14,2);
  v_new numeric(14,2) := ROUND(COALESCE(p_new_order_amount,0),2);
  v_proj numeric(14,2); v_disp numeric(14,2); v_pct numeric(6,2);
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
END $function$;

-- ---------------------------------------------------------------------
-- 2) Recheck de credito na aprovacao comercial
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_partner_order(
  p_order_id uuid,
  p_approval_notes text DEFAULT NULL::text,
  p_estimated_delivery_date date DEFAULT NULL::date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid; v_prev partner_order_status; v_partner_user uuid; v_numero text;
  v_final_status partner_order_status; v_final_ready boolean; v_block text;
  v_amount numeric(14,2); v_credit_ok timestamptz; v_credit jsonb; v_reason text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT partner_id, status, numero,
         ROUND(COALESCE(final_amount_with_interest, total, 0),2), credit_approved_at
    INTO v_pid, v_prev, v_numero, v_amount, v_credit_ok
    FROM public.partner_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF v_prev = 'aguardando_cotacao' THEN
    RAISE EXCEPTION 'quote_required: defina o preco da cotacao antes de aprovar';
  END IF;
  IF NOT public.fn_b2b_order_priceable(p_order_id) THEN
    RAISE EXCEPTION 'order_not_priceable_quote_required';
  END IF;

  IF v_prev IN ('aprovado','reprovado','cancelado') THEN
    RAISE EXCEPTION 'already_processed: pedido já está em status %', v_prev;
  END IF;

  IF v_prev = 'aguardando_aprovacao_credito' THEN
    RAISE EXCEPTION 'credit_pending: aprove o crédito antes da análise comercial';
  END IF;

  IF v_prev NOT IN ('em_analise_comercial','solicitado','rascunho') THEN
    RAISE EXCEPTION 'invalid_status_transition: %', v_prev;
  END IF;

  -- H4-001: reavaliar credito no momento da aprovacao, com lock por parceiro
  -- (serializa aprovacoes concorrentes do mesmo parceiro).
  PERFORM pg_advisory_xact_lock(hashtext('b2b_credit:' || v_pid::text));
  v_credit := public.fn_b2b_credit_exposure(v_pid, 0, NULL);
  v_reason := COALESCE(v_credit->>'reason_code','OK');
  IF v_credit_ok IS NULL AND v_reason IN ('LIMIT_EXCEEDED_BLOCK','OVERDUE_BLOCK') THEN
    UPDATE public.partner_orders
       SET credit_block_reason = v_reason, updated_at = now()
     WHERE id = p_order_id;
    RAISE EXCEPTION 'credit_block_on_approval: %', v_reason;
  END IF;

  UPDATE public.partner_orders
     SET status = 'aprovado', approved_by = v_uid, approved_at = now(),
         approval_notes = NULLIF(p_approval_notes,''),
         estimated_delivery_date = COALESCE(p_estimated_delivery_date, estimated_delivery_date),
         ready_for_production = true, updated_at = now()
   WHERE id = p_order_id AND status = v_prev;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_update: status do pedido mudou durante a aprovação';
  END IF;

  SELECT status, ready_for_production, credit_block_reason
    INTO v_final_status, v_final_ready, v_block
    FROM public.partner_orders WHERE id = p_order_id;

  IF v_final_status <> 'aprovado' OR v_final_ready IS NOT TRUE THEN
    RAISE EXCEPTION 'credit_block: %', COALESCE(v_block, 'aprovacao_credito_pendente');
  END IF;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'approved',
          jsonb_build_object('status', v_prev),
          jsonb_build_object('status','aprovado','approval_notes',p_approval_notes,
                             'estimated_delivery_date',p_estimated_delivery_date,
                             'credit_reason_code', v_reason));

  FOR v_partner_user IN SELECT user_id FROM public.partner_users WHERE partner_id = v_pid LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user, 'pedido_b2b_aprovado',
            'Pedido ' || v_numero || ' aprovado',
            'Seu pedido foi aprovado e seguirá para planejamento de produção.',
            '/portal-parceiro/pedidos');
  END LOOP;
END $function$;

-- ---------------------------------------------------------------------
-- 3) Imutabilidade material dos itens apos aprovacao (H4-002)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_b2b_guard_order_items_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid := COALESCE(NEW.order_id, OLD.order_id);
  v_status public.partner_order_status;
BEGIN
  SELECT status INTO v_status FROM public.partner_orders WHERE id = v_order_id;
  IF v_status IS NOT NULL AND public.fn_b2b_status_is_approved_or_later(v_status) THEN
    RAISE EXCEPTION 'order_items_immutable_after_approval: pedido em status %', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_b2b_order_items_immutable ON public.partner_order_items;
CREATE TRIGGER trg_b2b_order_items_immutable
BEFORE INSERT OR UPDATE OR DELETE ON public.partner_order_items
FOR EACH ROW EXECUTE FUNCTION public.fn_b2b_guard_order_items_immutable();

COMMIT;
