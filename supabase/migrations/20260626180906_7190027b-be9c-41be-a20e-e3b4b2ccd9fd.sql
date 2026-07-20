CREATE OR REPLACE FUNCTION public.issue_financial_receipt(_payment_id uuid, _description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment record; v_installment record; v_receivable record;
  v_existing record; v_receipt_id uuid; v_desc text;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT * INTO v_payment FROM receivable_payments WHERE id = _payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recebimento não encontrado'; END IF;
  IF v_payment.is_reversal THEN RAISE EXCEPTION 'Não é possível emitir recibo para estorno'; END IF;
  SELECT * INTO v_installment FROM accounts_receivable_installments WHERE id = v_payment.installment_id;
  SELECT * INTO v_receivable FROM accounts_receivable WHERE id = v_installment.receivable_id;
  SELECT * INTO v_existing FROM financial_receipts
    WHERE payment_id = _payment_id AND status = 'ISSUED' LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'receipt_id', v_existing.id,
      'receipt_number', v_existing.receipt_number,
      'message', 'Recibo já emitido para este recebimento');
  END IF;
  v_desc := COALESCE(NULLIF(trim(_description), ''),
    'Recebimento ref. parcela ' || COALESCE(v_installment.installment_number::text, '—') ||
    ' de ' || COALESCE(v_receivable.description, 'título financeiro'));
  INSERT INTO financial_receipts(
    payment_id, receivable_payment_id, receivable_id, customer_id, amount,
    payment_date, payment_method_id, description, issued_by, status
  ) VALUES (
    _payment_id, _payment_id, v_installment.receivable_id, v_receivable.customer_id,
    v_payment.amount_received, v_payment.payment_date, v_payment.payment_method_id,
    v_desc, auth.uid(), 'ISSUED'
  ) RETURNING id INTO v_receipt_id;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_receipts', v_receipt_id, 'FINANCIAL_RECEIPT_ISSUED',
          jsonb_build_object('payment_id', _payment_id, 'amount', v_payment.amount_received), auth.uid());
  RETURN jsonb_build_object('duplicate', false, 'receipt_id', v_receipt_id,
    'receipt_number', (SELECT receipt_number FROM financial_receipts WHERE id = v_receipt_id));
END$function$;