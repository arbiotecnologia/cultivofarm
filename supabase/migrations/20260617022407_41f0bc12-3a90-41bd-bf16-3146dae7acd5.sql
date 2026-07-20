
-- =========================================================
-- FASE 5.0.1 — Crédito, Inadimplência e Governança B2B
-- =========================================================

-- 1) Extensões em partner_financial_settings
ALTER TABLE public.partner_financial_settings
  ADD COLUMN IF NOT EXISTS credit_limit_action text NOT NULL DEFAULT 'block',
  ADD COLUMN IF NOT EXISTS overdue_tolerance_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_alert_threshold_1 integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS credit_alert_threshold_2 integer NOT NULL DEFAULT 90;

DO $$ BEGIN
  ALTER TABLE public.partner_financial_settings
    ADD CONSTRAINT pfs_credit_limit_action_check
    CHECK (credit_limit_action IN ('block','approval_required'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.partner_financial_settings
    ADD CONSTRAINT pfs_tolerance_check CHECK (overdue_tolerance_days >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Status do pedido + colunas de bloqueio
DO $$ BEGIN
  ALTER TYPE public.partner_order_status ADD VALUE IF NOT EXISTS 'aguardando_aprovacao_credito';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.partner_orders
  ADD COLUMN IF NOT EXISTS credit_block_reason text,
  ADD COLUMN IF NOT EXISTS credit_approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS credit_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS credit_approval_notes text;

-- 3) Permitir AR B2B (corrige check antigo)
ALTER TABLE public.accounts_receivable
  DROP CONSTRAINT IF EXISTS accounts_receivable_origin_type_check;
ALTER TABLE public.accounts_receivable
  ADD CONSTRAINT accounts_receivable_origin_type_check
  CHECK (origin_type IN ('DELIVERY','SERVICE','MANUAL','RECURRING','CONTRACT','B2B_ORDER'));

-- 4) Função: saldo em aberto + crédito disponível
CREATE OR REPLACE FUNCTION public.rpc_b2b_partner_credit(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit numeric(14,2);
  v_open  numeric(14,2);
  v_overdue numeric(14,2);
  v_disponivel numeric(14,2);
  v_pct numeric(6,2);
  v_tolerance int;
  v_block_if_overdue boolean;
  v_action text;
BEGIN
  SELECT COALESCE(credit_limit,0), COALESCE(overdue_tolerance_days,0),
         COALESCE(block_if_overdue,false), COALESCE(credit_limit_action,'block')
    INTO v_limit, v_tolerance, v_block_if_overdue, v_action
  FROM public.partner_financial_settings WHERE partner_id = p_partner_id;

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0)
    INTO v_open
  FROM public.accounts_receivable ar
  JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.partner_id = p_partner_id
    AND ar.status <> 'CANCELED'
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0)
    INTO v_overdue
  FROM public.accounts_receivable ar
  JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.partner_id = p_partner_id
    AND ar.status <> 'CANCELED'
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
    AND ari.due_date < (current_date - v_tolerance);

  v_disponivel := GREATEST(COALESCE(v_limit,0) - COALESCE(v_open,0), 0);
  v_pct := CASE WHEN COALESCE(v_limit,0) > 0 THEN ROUND((v_open / v_limit) * 100, 2) ELSE 0 END;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'credit_limit', v_limit,
    'saldo_em_aberto', v_open,
    'saldo_vencido', v_overdue,
    'credito_disponivel', v_disponivel,
    'percentual_utilizado', v_pct,
    'overdue_tolerance_days', v_tolerance,
    'block_if_overdue', v_block_if_overdue,
    'credit_limit_action', v_action,
    'tem_vencidos', v_overdue > 0
  );
END;$$;

-- 5) Trigger BEFORE INSERT/UPDATE de status em partner_orders
CREATE OR REPLACE FUNCTION public.tg_partner_orders_credit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  v_after numeric(14,2);
BEGIN
  -- Apenas em transições relevantes (criação ou aprovação)
  IF TG_OP = 'INSERT' THEN
    -- nada a checar para rascunho
    IF NEW.status IN ('rascunho') THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    IF NEW.status NOT IN ('aprovado','em_analise_comercial') THEN RETURN NEW; END IF;
    -- liberação manual via credit_approved_by pula validação
    IF NEW.credit_approved_by IS NOT NULL AND OLD.credit_approved_by IS NULL THEN RETURN NEW; END IF;
  END IF;

  v := public.rpc_b2b_partner_credit(NEW.partner_id);

  -- Inadimplência
  IF (v->>'block_if_overdue')::boolean AND (v->>'tem_vencidos')::boolean THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := 'inadimplencia';
    RETURN NEW;
  END IF;

  -- Limite de crédito
  v_after := COALESCE((v->>'saldo_em_aberto')::numeric,0) + COALESCE(NEW.total,0);
  IF COALESCE((v->>'credit_limit')::numeric,0) > 0
     AND v_after > (v->>'credit_limit')::numeric THEN
    IF (v->>'credit_limit_action') = 'approval_required' THEN
      NEW.status := 'aguardando_aprovacao_credito';
      NEW.credit_block_reason := 'limite_excedido';
    ELSE
      NEW.status := 'aguardando_aprovacao_credito';
      NEW.credit_block_reason := 'limite_excedido_bloqueado';
    END IF;
  END IF;

  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_partner_orders_credit_guard ON public.partner_orders;
CREATE TRIGGER trg_partner_orders_credit_guard
BEFORE INSERT OR UPDATE OF status, total ON public.partner_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_partner_orders_credit_guard();

-- 6) Aprovação gerencial de crédito
CREATE OR REPLACE FUNCTION public.approve_b2b_credit(
  p_partner_order_id uuid, p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.partner_orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')
          OR public.has_role(v_uid,'financeiro')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_partner_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status <> 'aguardando_aprovacao_credito' THEN
    RAISE EXCEPTION 'invalid_status: %', v_order.status;
  END IF;

  UPDATE public.partner_orders SET
    status = 'em_analise_comercial',
    credit_approved_by = v_uid,
    credit_approved_at = now(),
    credit_approval_notes = p_notes,
    credit_block_reason = NULL
  WHERE id = p_partner_order_id;

  INSERT INTO public.partner_order_audit_logs(usuario_id, partner_id, order_id, acao, dados_anteriores, dados_novos)
  VALUES (v_uid, v_order.partner_id, p_partner_order_id, 'credito_aprovado',
          jsonb_build_object('status', v_order.status, 'reason', v_order.credit_block_reason),
          jsonb_build_object('approved_by', v_uid, 'notes', p_notes));

  RETURN jsonb_build_object('ok', true, 'order_id', p_partner_order_id);
END;$$;

-- 7) Aging financeiro
CREATE OR REPLACE FUNCTION public.rpc_b2b_aging(p_partner_id uuid DEFAULT NULL)
RETURNS TABLE(faixa text, qtd_titulos int, valor numeric, parceiros int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT ar.partner_id, ari.id,
           (ari.original_amount - ari.received_amount) AS saldo,
           GREATEST(0, (current_date - ari.due_date)) AS dias
    FROM public.accounts_receivable ar
    JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
    WHERE ar.origin_type = 'B2B_ORDER'
      AND ar.status <> 'CANCELED'
      AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
      AND (p_partner_id IS NULL OR ar.partner_id = p_partner_id)
  ), faixas AS (
    SELECT CASE
             WHEN dias <= 30 THEN '0-30'
             WHEN dias <= 60 THEN '31-60'
             WHEN dias <= 90 THEN '61-90'
             ELSE '90+'
           END AS faixa, partner_id, saldo
    FROM base
  )
  SELECT faixa, COUNT(*)::int, COALESCE(SUM(saldo),0), COUNT(DISTINCT partner_id)::int
  FROM faixas GROUP BY faixa
  ORDER BY CASE faixa WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END;
$$;

-- 8) KPIs de governança
CREATE OR REPLACE FUNCTION public.rpc_b2b_governance_kpis()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_concedido numeric := 0;
  v_total_utilizado numeric := 0;
  v_total_disponivel numeric := 0;
  v_bloqueados int := 0;
  v_vencidos numeric := 0;
  v_recebido_mes numeric := 0;
  v_inad_pct numeric := 0;
  v_receita numeric := 0;
BEGIN
  SELECT COALESCE(SUM(credit_limit),0) INTO v_total_concedido
    FROM public.partner_financial_settings WHERE active;

  SELECT COALESCE(SUM((ari.original_amount - ari.received_amount)),0) INTO v_total_utilizado
    FROM public.accounts_receivable ar
    JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
   WHERE ar.origin_type = 'B2B_ORDER' AND ar.status <> 'CANCELED'
     AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  v_total_disponivel := GREATEST(v_total_concedido - v_total_utilizado, 0);

  SELECT COUNT(DISTINCT partner_id) INTO v_bloqueados
    FROM public.partner_orders WHERE status = 'aguardando_aprovacao_credito';

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_vencidos
    FROM public.accounts_receivable ar
    JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
   WHERE ar.origin_type = 'B2B_ORDER' AND ar.status <> 'CANCELED'
     AND ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < current_date;

  SELECT COALESCE(SUM(rp.amount),0) INTO v_recebido_mes
    FROM public.receivable_payments rp
    JOIN public.accounts_receivable_installments ari ON ari.id = rp.installment_id
    JOIN public.accounts_receivable ar ON ar.id = ari.receivable_id
   WHERE ar.origin_type = 'B2B_ORDER'
     AND date_trunc('month', rp.payment_date) = date_trunc('month', current_date);

  SELECT COALESCE(SUM(total),0) INTO v_receita
    FROM public.partner_orders
   WHERE status IN ('entregue','faturado')
     AND date_trunc('month', created_at) = date_trunc('month', current_date);

  v_inad_pct := CASE WHEN v_total_utilizado > 0
                     THEN ROUND((v_vencidos / v_total_utilizado) * 100, 2)
                     ELSE 0 END;

  RETURN jsonb_build_object(
    'credito_total_concedido', v_total_concedido,
    'credito_utilizado', v_total_utilizado,
    'credito_disponivel', v_total_disponivel,
    'parceiros_bloqueados', v_bloqueados,
    'titulos_vencidos', v_vencidos,
    'recebimentos_mes', v_recebido_mes,
    'inadimplencia_pct', v_inad_pct,
    'receita_b2b_mes', v_receita
  );
END;$$;

-- 9) Visão do portal — situação financeira do próprio parceiro
CREATE OR REPLACE FUNCTION public.rpc_portal_partner_credit_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_partner uuid; BEGIN
  v_partner := public.get_user_partner_id();
  IF v_partner IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public.rpc_b2b_partner_credit(v_partner);
END;$$;

-- 10) Permissões
GRANT EXECUTE ON FUNCTION public.rpc_b2b_partner_credit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_aging(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_governance_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_b2b_credit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_portal_partner_credit_status() TO authenticated;
