
-- ===== receivable_payments =====
ALTER TABLE public.receivable_payments
  DROP CONSTRAINT IF EXISTS receivable_payments_amount_received_check;

ALTER TABLE public.receivable_payments
  ADD CONSTRAINT receivable_payments_amount_sign_check
  CHECK (
    (COALESCE(is_reversal,false) = false AND amount_received > 0)
    OR
    (is_reversal = true AND amount_received < 0)
  );

ALTER TABLE public.receivable_payments
  DROP CONSTRAINT IF EXISTS receivable_payments_reversal_consistency_check;
ALTER TABLE public.receivable_payments
  ADD CONSTRAINT receivable_payments_reversal_consistency_check
  CHECK (
    (COALESCE(is_reversal,false) = false AND reversed_payment_id IS NULL)
    OR
    (is_reversal = true AND reversed_payment_id IS NOT NULL)
  );

DROP INDEX IF EXISTS public.ux_receivable_payments_one_reversal;
CREATE UNIQUE INDEX ux_receivable_payments_one_reversal
  ON public.receivable_payments(reversed_payment_id)
  WHERE is_reversal = true AND reversed_payment_id IS NOT NULL;

-- ===== payable_payments =====
ALTER TABLE public.payable_payments
  DROP CONSTRAINT IF EXISTS payable_payments_amount_paid_check;

ALTER TABLE public.payable_payments
  ADD CONSTRAINT payable_payments_amount_sign_check
  CHECK (
    (COALESCE(is_reversal,false) = false AND amount_paid > 0)
    OR
    (is_reversal = true AND amount_paid < 0)
  );

ALTER TABLE public.payable_payments
  DROP CONSTRAINT IF EXISTS payable_payments_reversal_consistency_check;
ALTER TABLE public.payable_payments
  ADD CONSTRAINT payable_payments_reversal_consistency_check
  CHECK (
    (COALESCE(is_reversal,false) = false AND reversed_payment_id IS NULL)
    OR
    (is_reversal = true AND reversed_payment_id IS NOT NULL)
  );

DROP INDEX IF EXISTS public.ux_payable_payments_one_reversal;
CREATE UNIQUE INDEX ux_payable_payments_one_reversal
  ON public.payable_payments(reversed_payment_id)
  WHERE is_reversal = true AND reversed_payment_id IS NOT NULL;

-- ===== fn_reverse_payment reforçada =====
CREATE OR REPLACE FUNCTION public.fn_reverse_payment(_payment_id uuid, _kind text, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_new_id uuid;
  v_row record;
  v_inst_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão obrigatória.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Apenas administrador, gestor ou financeiro podem estornar uma baixa.'
      USING ERRCODE='insufficient_privilege';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Informe um motivo (mín. 5 caracteres) para o estorno.'
      USING ERRCODE='check_violation';
  END IF;

  IF _kind = 'receivable' THEN
    SELECT * INTO v_row FROM public.receivable_payments WHERE id = _payment_id FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;
    IF EXISTS (SELECT 1 FROM public.receivable_payments WHERE reversed_payment_id = _payment_id) THEN
      RAISE EXCEPTION 'Este pagamento já foi estornado.';
    END IF;
    SELECT status INTO v_inst_status FROM public.accounts_receivable_installments WHERE id = v_row.installment_id;
    IF v_inst_status = 'CANCELED' THEN
      RAISE EXCEPTION 'Não é possível estornar baixa de parcela cancelada.';
    END IF;

    INSERT INTO public.receivable_payments(
      installment_id, payment_date, payment_method_id, bank_account_id,
      amount_received, discount_amount, interest_amount, penalty_amount,
      notes, created_by, is_reversal, reversed_payment_id, reversal_reason
    ) VALUES (
      v_row.installment_id, CURRENT_DATE, v_row.payment_method_id, v_row.bank_account_id,
      -v_row.amount_received, -COALESCE(v_row.discount_amount,0),
      -COALESCE(v_row.interest_amount,0), -COALESCE(v_row.penalty_amount,0),
      '[ESTORNO] '||_reason, v_uid, true, _payment_id, _reason
    ) RETURNING id INTO v_new_id;

  ELSIF _kind = 'payable' THEN
    SELECT * INTO v_row FROM public.payable_payments WHERE id = _payment_id FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;
    IF EXISTS (SELECT 1 FROM public.payable_payments WHERE reversed_payment_id = _payment_id) THEN
      RAISE EXCEPTION 'Este pagamento já foi estornado.';
    END IF;
    SELECT status INTO v_inst_status FROM public.accounts_payable_installments WHERE id = v_row.installment_id;
    IF v_inst_status = 'CANCELED' THEN
      RAISE EXCEPTION 'Não é possível estornar baixa de parcela cancelada.';
    END IF;

    INSERT INTO public.payable_payments(
      installment_id, payment_date, payment_method_id, bank_account_id,
      amount_paid, discount_amount, interest_amount, penalty_amount,
      notes, created_by, is_reversal, reversed_payment_id, reversal_reason
    ) VALUES (
      v_row.installment_id, CURRENT_DATE, v_row.payment_method_id, v_row.bank_account_id,
      -v_row.amount_paid, -COALESCE(v_row.discount_amount,0),
      -COALESCE(v_row.interest_amount,0), -COALESCE(v_row.penalty_amount,0),
      '[ESTORNO] '||_reason, v_uid, true, _payment_id, _reason
    ) RETURNING id INTO v_new_id;
  ELSE
    RAISE EXCEPTION 'Tipo inválido: %', _kind;
  END IF;

  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES (
    CASE WHEN _kind='receivable' THEN 'receivable_payments' ELSE 'payable_payments' END,
    v_new_id, 'PAYMENT_REVERSAL_CREATED',
    jsonb_build_object('reversed_payment_id', _payment_id, 'reason', _reason),
    v_uid
  );

  RETURN v_new_id;
END $function$;
