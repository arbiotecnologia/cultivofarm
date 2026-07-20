
-- =========================================================
-- Receivable payment
-- =========================================================
CREATE OR REPLACE FUNCTION public.rpc_register_receivable_payment(
  p_installment_id uuid,
  p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_inst public.accounts_receivable_installments%ROWTYPE;
  v_amount numeric;
  v_disc numeric;
  v_int numeric;
  v_pen numeric;
  v_saldo numeric;
  v_pm uuid;
  v_ba uuid;
  v_pay_date date;
  v_notes text;
  v_has_receipt boolean;
  v_require_receipt boolean;
  v_payment_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para registrar recebimento.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_inst FROM public.accounts_receivable_installments
   WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;
  IF v_inst.status = 'CANCELED' THEN
    RAISE EXCEPTION 'Parcela cancelada.' USING ERRCODE='check_violation';
  END IF;
  IF v_inst.status = 'PAID' THEN
    RAISE EXCEPTION 'Parcela já quitada.' USING ERRCODE='check_violation';
  END IF;

  v_amount   := COALESCE((p_payload->>'amount_received')::numeric, 0);
  v_disc     := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_int      := COALESCE((p_payload->>'interest_amount')::numeric, 0);
  v_pen      := COALESCE((p_payload->>'penalty_amount')::numeric, 0);
  v_pm       := NULLIF(p_payload->>'payment_method_id','')::uuid;
  v_ba       := NULLIF(p_payload->>'bank_account_id','')::uuid;
  v_pay_date := COALESCE((p_payload->>'payment_date')::date, CURRENT_DATE);
  v_notes    := NULLIF(p_payload->>'notes','');
  v_has_receipt := COALESCE((p_payload->>'has_receipt')::boolean, false);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido.' USING ERRCODE='check_violation';
  END IF;
  IF v_pm IS NULL OR NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = v_pm AND active) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;
  IF v_ba IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = v_ba AND active) THEN
    RAISE EXCEPTION 'Conta bancária inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;

  v_saldo := v_inst.original_amount + v_int + v_pen - v_disc - COALESCE(v_inst.received_amount,0);
  IF v_amount - v_saldo > 0.005 THEN
    RAISE EXCEPTION 'Valor excede o saldo da parcela (saldo: %).', v_saldo USING ERRCODE='check_violation';
  END IF;

  SELECT require_receipt_on_receivable_payment INTO v_require_receipt
    FROM public.financial_settings LIMIT 1;
  IF COALESCE(v_require_receipt,false) AND NOT v_has_receipt THEN
    RAISE EXCEPTION 'Comprovante de recebimento é obrigatório.' USING ERRCODE='check_violation';
  END IF;

  INSERT INTO public.receivable_payments (
    installment_id, payment_date, amount_received, payment_method_id, bank_account_id,
    discount_amount, interest_amount, penalty_amount, notes, created_by
  ) VALUES (
    p_installment_id, v_pay_date, v_amount, v_pm, v_ba,
    v_disc, v_int, v_pen, v_notes, v_uid
  ) RETURNING id INTO v_payment_id;

  INSERT INTO public.financial_audit_log (
    entity_type, entity_id, action, new_data, performed_by
  ) VALUES (
    'receivable_payments', v_payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object(
      'installment_id', p_installment_id,
      'amount', v_amount,
      'payment_method_id', v_pm,
      'bank_account_id', v_ba,
      'payment_date', v_pay_date
    ),
    v_uid
  );

  RETURN v_payment_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.rpc_register_receivable_payment(uuid, jsonb) TO authenticated;

-- =========================================================
-- Payable payment
-- =========================================================
CREATE OR REPLACE FUNCTION public.rpc_register_payable_payment(
  p_installment_id uuid,
  p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_inst public.accounts_payable_installments%ROWTYPE;
  v_amount numeric;
  v_disc numeric;
  v_int numeric;
  v_pen numeric;
  v_saldo numeric;
  v_pm uuid;
  v_ba uuid;
  v_pay_date date;
  v_notes text;
  v_has_receipt boolean;
  v_require_receipt boolean;
  v_payment_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_inst FROM public.accounts_payable_installments
   WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;
  IF v_inst.status = 'CANCELED' THEN
    RAISE EXCEPTION 'Parcela cancelada.' USING ERRCODE='check_violation';
  END IF;
  IF v_inst.status = 'PAID' THEN
    RAISE EXCEPTION 'Parcela já quitada.' USING ERRCODE='check_violation';
  END IF;

  v_amount   := COALESCE((p_payload->>'amount_paid')::numeric, 0);
  v_disc     := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_int      := COALESCE((p_payload->>'interest_amount')::numeric, 0);
  v_pen      := COALESCE((p_payload->>'penalty_amount')::numeric, 0);
  v_pm       := NULLIF(p_payload->>'payment_method_id','')::uuid;
  v_ba       := NULLIF(p_payload->>'bank_account_id','')::uuid;
  v_pay_date := COALESCE((p_payload->>'payment_date')::date, CURRENT_DATE);
  v_notes    := NULLIF(p_payload->>'notes','');
  v_has_receipt := COALESCE((p_payload->>'has_receipt')::boolean, false);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido.' USING ERRCODE='check_violation';
  END IF;
  IF v_pm IS NULL OR NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = v_pm AND active) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;
  IF v_ba IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = v_ba AND active) THEN
    RAISE EXCEPTION 'Conta bancária inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;

  v_saldo := v_inst.original_amount + v_int + v_pen - v_disc - COALESCE(v_inst.paid_amount,0);
  IF v_amount - v_saldo > 0.005 THEN
    RAISE EXCEPTION 'Valor excede o saldo da parcela (saldo: %).', v_saldo USING ERRCODE='check_violation';
  END IF;

  SELECT require_receipt_on_payable_payment INTO v_require_receipt
    FROM public.financial_settings LIMIT 1;
  IF COALESCE(v_require_receipt,false) AND NOT v_has_receipt THEN
    RAISE EXCEPTION 'Comprovante de pagamento é obrigatório.' USING ERRCODE='check_violation';
  END IF;

  INSERT INTO public.payable_payments (
    installment_id, payment_date, amount_paid, payment_method_id, bank_account_id,
    discount_amount, interest_amount, penalty_amount, notes, created_by
  ) VALUES (
    p_installment_id, v_pay_date, v_amount, v_pm, v_ba,
    v_disc, v_int, v_pen, v_notes, v_uid
  ) RETURNING id INTO v_payment_id;

  INSERT INTO public.financial_audit_log (
    entity_type, entity_id, action, new_data, performed_by
  ) VALUES (
    'payable_payments', v_payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object(
      'installment_id', p_installment_id,
      'amount', v_amount,
      'payment_method_id', v_pm,
      'bank_account_id', v_ba,
      'payment_date', v_pay_date
    ),
    v_uid
  );

  RETURN v_payment_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.rpc_register_payable_payment(uuid, jsonb) TO authenticated;
