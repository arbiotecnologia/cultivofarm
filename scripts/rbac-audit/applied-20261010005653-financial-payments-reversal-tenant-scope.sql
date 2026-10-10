CREATE OR REPLACE FUNCTION public.fn_reverse_payment(_payment_id uuid, _kind text, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := platform_private.h15_actor_organization();
  v_new_id uuid;
  v_row record;
  v_inst_status text;
  v_prev record;
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
  IF _kind IS NULL OR _kind NOT IN ('receivable','payable') THEN
    RAISE EXCEPTION 'Tipo inválido: %', _kind;
  END IF;

  IF v_org IS NULL THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  IF _kind='receivable' THEN
    IF NOT EXISTS (SELECT 1 FROM public.receivable_payments WHERE id=_payment_id AND organization_id=v_org) THEN
      RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.payable_payments WHERE id=_payment_id AND organization_id=v_org) THEN
      RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501';
    END IF;
  END IF;
  -- lock determinístico por intencao de reversao (mesma baixa original)
  PERFORM pg_advisory_xact_lock(hashtextextended('fin_reverse:' || _kind || ':' || _payment_id::text, 0));

  IF _kind = 'receivable' THEN
    SELECT * INTO v_row FROM public.receivable_payments WHERE id = _payment_id AND organization_id=v_org FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;

    -- replay estavel: mesma intencao -> devolve reversao existente
    SELECT id, reversal_reason INTO v_prev FROM public.receivable_payments
     WHERE reversed_payment_id = _payment_id AND is_reversal = true;
    IF v_prev.id IS NOT NULL THEN
      IF trim(COALESCE(v_prev.reversal_reason,'')) IS DISTINCT FROM trim(_reason) THEN
        RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: baixa já estornada com motivo divergente.'
          USING ERRCODE='check_violation';
      END IF;
      RETURN v_prev.id;
    END IF;

    SELECT status INTO v_inst_status FROM public.accounts_receivable_installments WHERE id = v_row.installment_id;
    IF v_inst_status = 'CANCELED' THEN
      RAISE EXCEPTION 'Não é possível estornar baixa de parcela cancelada.';
    END IF;

    INSERT INTO public.receivable_payments(
      organization_id, installment_id, payment_date, payment_method_id, bank_account_id,
      amount_received, discount_amount, interest_amount, penalty_amount,
      notes, created_by, is_reversal, reversed_payment_id, reversal_reason
    ) VALUES (
      v_org, v_row.installment_id, CURRENT_DATE, v_row.payment_method_id, v_row.bank_account_id,
      -v_row.amount_received, -COALESCE(v_row.discount_amount,0),
      -COALESCE(v_row.interest_amount,0), -COALESCE(v_row.penalty_amount,0),
      '[ESTORNO] '||_reason, v_uid, true, _payment_id, _reason
    ) RETURNING id INTO v_new_id;

  ELSE
    SELECT * INTO v_row FROM public.payable_payments WHERE id = _payment_id AND organization_id=v_org FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;

    SELECT id, reversal_reason INTO v_prev FROM public.payable_payments
     WHERE reversed_payment_id = _payment_id AND is_reversal = true;
    IF v_prev.id IS NOT NULL THEN
      IF trim(COALESCE(v_prev.reversal_reason,'')) IS DISTINCT FROM trim(_reason) THEN
        RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: baixa já estornada com motivo divergente.'
          USING ERRCODE='check_violation';
      END IF;
      RETURN v_prev.id;
    END IF;

    SELECT status INTO v_inst_status FROM public.accounts_payable_installments WHERE id = v_row.installment_id;
    IF v_inst_status = 'CANCELED' THEN
      RAISE EXCEPTION 'Não é possível estornar baixa de parcela cancelada.';
    END IF;

    INSERT INTO public.payable_payments(
      organization_id, installment_id, payment_date, payment_method_id, bank_account_id,
      amount_paid, discount_amount, interest_amount, penalty_amount,
      notes, created_by, is_reversal, reversed_payment_id, reversal_reason
    ) VALUES (
      v_org, v_row.installment_id, CURRENT_DATE, v_row.payment_method_id, v_row.bank_account_id,
      -v_row.amount_paid, -COALESCE(v_row.discount_amount,0),
      -COALESCE(v_row.interest_amount,0), -COALESCE(v_row.penalty_amount,0),
      '[ESTORNO] '||_reason, v_uid, true, _payment_id, _reason
    ) RETURNING id INTO v_new_id;
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

CREATE OR REPLACE FUNCTION public.rpc_register_payable_payment(p_installment_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := platform_private.h15_actor_organization();
  v_inst public.accounts_payable_installments%ROWTYPE;
  v_amount numeric; v_disc numeric; v_int numeric; v_pen numeric; v_saldo numeric;
  v_pm uuid; v_ba uuid; v_pay_date date; v_notes text;
  v_has_receipt boolean; v_require_receipt boolean;
  v_payment_id uuid; v_idem text; v_fp text; v_existing record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento.' USING ERRCODE='insufficient_privilege';
  END IF;

  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts_payable_installments WHERE id=p_installment_id AND organization_id=v_org) THEN
    RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  IF (p_payload ? 'organization_id' AND NULLIF(p_payload->>'organization_id','')::uuid IS DISTINCT FROM v_org)
     OR (p_payload ? 'tenant_id' AND NULLIF(p_payload->>'tenant_id','')::uuid IS DISTINCT FROM v_org) THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_MISMATCH' USING ERRCODE='42501';
  END IF;
  v_idem := NULLIF(trim(p_payload->>'idempotency_key'), '');
  IF v_idem IS NULL OR length(v_idem) < 8 THEN
    RAISE EXCEPTION 'FIN_IDEMPOTENCY_REQUIRED: idempotency_key obrigatória (mín. 8 caracteres).'
      USING ERRCODE='check_violation';
  END IF;

  v_fp := public.fn_h6b_payment_fingerprint('payable', p_installment_id, p_payload);

  PERFORM pg_advisory_xact_lock(
    hashtextextended('fin_pay:payable:' || p_installment_id::text || ':' || v_idem, 0));

  SELECT * INTO v_inst FROM public.accounts_payable_installments
   WHERE id = p_installment_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;

  SELECT id, request_fingerprint INTO v_existing FROM public.payable_payments
   WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END IF;

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

  IF v_amount::text IN ('NaN','Infinity','-Infinity') OR v_disc::text IN ('NaN','Infinity','-Infinity') OR v_int::text IN ('NaN','Infinity','-Infinity') OR v_pen::text IN ('NaN','Infinity','-Infinity') OR v_disc < 0 OR v_int < 0 OR v_pen < 0 OR v_amount <> round(v_amount,2) OR v_disc <> round(v_disc,2) OR v_int <> round(v_int,2) OR v_pen <> round(v_pen,2) THEN
 RAISE EXCEPTION 'FIN_INVALID_AMOUNT: valores monetários inválidos.' USING ERRCODE='23514';
 END IF;
 IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido.' USING ERRCODE='check_violation';
  END IF;
  IF v_pm IS NULL OR NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = v_pm AND active) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;
  IF v_ba IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = v_ba AND active) THEN
    RAISE EXCEPTION 'Conta bancária inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;

  v_saldo := v_inst.original_amount + COALESCE(v_inst.interest_amount,0) + COALESCE(v_inst.penalty_amount,0) - COALESCE(v_inst.discount_amount,0) - COALESCE(v_inst.paid_amount,0) + v_int + v_pen - v_disc;
  IF v_amount - v_saldo > 0.005 THEN
    RAISE EXCEPTION 'Valor excede o saldo da parcela (saldo: %).', v_saldo USING ERRCODE='check_violation';
  END IF;

  SELECT require_receipt_on_payable_payment INTO v_require_receipt
    FROM public.financial_settings LIMIT 1;
  IF COALESCE(v_require_receipt,false) AND NOT v_has_receipt THEN
    RAISE EXCEPTION 'Comprovante de pagamento é obrigatório.' USING ERRCODE='check_violation';
  END IF;

  BEGIN
    INSERT INTO public.payable_payments (
      organization_id, installment_id, payment_date, amount_paid, payment_method_id, bank_account_id,
      discount_amount, interest_amount, penalty_amount, notes, created_by,
      idempotency_key, request_fingerprint
    ) VALUES (
      v_org, p_installment_id, v_pay_date, v_amount, v_pm, v_ba,
      v_disc, v_int, v_pen, v_notes, v_uid, v_idem, v_fp
    ) RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, request_fingerprint INTO v_existing FROM public.payable_payments
     WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('payable_payments', v_payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object('installment_id', p_installment_id, 'amount', v_amount,
      'payment_method_id', v_pm, 'bank_account_id', v_ba, 'payment_date', v_pay_date,
      'idempotency_key', v_idem, 'request_fingerprint', v_fp), v_uid);

  RETURN v_payment_id;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_register_receivable_payment(p_installment_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := platform_private.h15_actor_organization();
  v_inst public.accounts_receivable_installments%ROWTYPE;
  v_amount numeric; v_disc numeric; v_int numeric; v_pen numeric; v_saldo numeric;
  v_pm uuid; v_ba uuid; v_pay_date date; v_notes text;
  v_has_receipt boolean; v_require_receipt boolean;
  v_payment_id uuid; v_idem text; v_fp text; v_existing record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para registrar recebimento.' USING ERRCODE='insufficient_privilege';
  END IF;

  -- H6-001: idempotency_key obrigatoria (fail-closed)
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts_receivable_installments WHERE id=p_installment_id AND organization_id=v_org) THEN
    RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  IF (p_payload ? 'organization_id' AND NULLIF(p_payload->>'organization_id','')::uuid IS DISTINCT FROM v_org)
     OR (p_payload ? 'tenant_id' AND NULLIF(p_payload->>'tenant_id','')::uuid IS DISTINCT FROM v_org) THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_MISMATCH' USING ERRCODE='42501';
  END IF;
  v_idem := NULLIF(trim(p_payload->>'idempotency_key'), '');
  IF v_idem IS NULL OR length(v_idem) < 8 THEN
    RAISE EXCEPTION 'FIN_IDEMPOTENCY_REQUIRED: idempotency_key obrigatória (mín. 8 caracteres).'
      USING ERRCODE='check_violation';
  END IF;

  v_fp := public.fn_h6b_payment_fingerprint('receivable', p_installment_id, p_payload);

  -- lock determinístico por tipo + parcela + chave, ANTES da decisao de replay
  PERFORM pg_advisory_xact_lock(
    hashtextextended('fin_pay:receivable:' || p_installment_id::text || ':' || v_idem, 0));

  SELECT * INTO v_inst FROM public.accounts_receivable_installments
   WHERE id = p_installment_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;

  SELECT id, request_fingerprint INTO v_existing FROM public.receivable_payments
   WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END IF;

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

  IF v_amount::text IN ('NaN','Infinity','-Infinity') OR v_disc::text IN ('NaN','Infinity','-Infinity') OR v_int::text IN ('NaN','Infinity','-Infinity') OR v_pen::text IN ('NaN','Infinity','-Infinity') OR v_disc < 0 OR v_int < 0 OR v_pen < 0 OR v_amount <> round(v_amount,2) OR v_disc <> round(v_disc,2) OR v_int <> round(v_int,2) OR v_pen <> round(v_pen,2) THEN
 RAISE EXCEPTION 'FIN_INVALID_AMOUNT: valores monetários inválidos.' USING ERRCODE='23514';
 END IF;
 IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido.' USING ERRCODE='check_violation';
  END IF;
  IF v_pm IS NULL OR NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = v_pm AND active) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;
  IF v_ba IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = v_ba AND active) THEN
    RAISE EXCEPTION 'Conta bancária inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;

  v_saldo := v_inst.original_amount + COALESCE(v_inst.interest_amount,0) + COALESCE(v_inst.penalty_amount,0) - COALESCE(v_inst.discount_amount,0) - COALESCE(v_inst.received_amount,0) + v_int + v_pen - v_disc;
  IF v_amount - v_saldo > 0.005 THEN
    RAISE EXCEPTION 'Valor excede o saldo da parcela (saldo: %).', v_saldo USING ERRCODE='check_violation';
  END IF;

  SELECT require_receipt_on_receivable_payment INTO v_require_receipt
    FROM public.financial_settings LIMIT 1;
  IF COALESCE(v_require_receipt,false) AND NOT v_has_receipt THEN
    RAISE EXCEPTION 'Comprovante de recebimento é obrigatório.' USING ERRCODE='check_violation';
  END IF;

  BEGIN
    INSERT INTO public.receivable_payments (
      organization_id, installment_id, payment_date, amount_received, payment_method_id, bank_account_id,
      discount_amount, interest_amount, penalty_amount, notes, created_by,
      idempotency_key, request_fingerprint
    ) VALUES (
      v_org, p_installment_id, v_pay_date, v_amount, v_pm, v_ba,
      v_disc, v_int, v_pen, v_notes, v_uid, v_idem, v_fp
    ) RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, request_fingerprint INTO v_existing FROM public.receivable_payments
     WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('receivable_payments', v_payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object('installment_id', p_installment_id, 'amount', v_amount,
      'payment_method_id', v_pm, 'bank_account_id', v_ba, 'payment_date', v_pay_date,
      'idempotency_key', v_idem, 'request_fingerprint', v_fp), v_uid);

  RETURN v_payment_id;
END $function$;