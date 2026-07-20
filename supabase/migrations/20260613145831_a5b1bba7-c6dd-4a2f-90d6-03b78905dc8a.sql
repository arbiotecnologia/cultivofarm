
-- 1. Expandir constraints de financial_documents
ALTER TABLE public.financial_documents DROP CONSTRAINT IF EXISTS financial_documents_owner_type_check;
ALTER TABLE public.financial_documents ADD CONSTRAINT financial_documents_owner_type_check
  CHECK (owner_type = ANY (ARRAY[
    'RECEIVABLE','PAYABLE','DELIVERY','FISCAL_INVOICE',
    'PAYMENT_RECEIVABLE','PAYMENT_PAYABLE','FINANCIAL_RECEIPT','REPORT_EXPORT'
  ]));

ALTER TABLE public.financial_documents DROP CONSTRAINT IF EXISTS financial_documents_document_type_check;
ALTER TABLE public.financial_documents ADD CONSTRAINT financial_documents_document_type_check
  CHECK (document_type = ANY (ARRAY[
    'COMPROVANTE','BOLETO','DANFE','XML_NFE','RECIBO','CONTRATO','OUTRO',
    'INVOICE','RECEIPT','XML','OTHER','CONTRACT'
  ]));

-- 2. Corrigir issue_financial_receipt (auditoria)
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
    RAISE EXCEPTION 'Sem permissão para emitir recibo.' USING ERRCODE='insufficient_privilege';
  END IF;
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

-- 3. Corrigir cancel_financial_receipt (auditoria)
CREATE OR REPLACE FUNCTION public.cancel_financial_receipt(_receipt_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_rec record;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar recibo.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Motivo do cancelamento é obrigatório (mín. 5 caracteres)';
  END IF;
  SELECT * INTO v_rec FROM financial_receipts WHERE id = _receipt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recibo não encontrado'; END IF;
  IF v_rec.status = 'CANCELED' THEN RAISE EXCEPTION 'Recibo já cancelado'; END IF;
  IF NOT (has_role(auth.uid(),'administrador'::app_role) OR has_role(auth.uid(),'gestor'::app_role))
     AND v_rec.issued_at::date <> CURRENT_DATE THEN
    RAISE EXCEPTION 'Apenas administrador/gestor podem cancelar recibos de outros dias';
  END IF;
  UPDATE financial_receipts
     SET status='CANCELED', cancel_reason=_reason, canceled_by=auth.uid(), canceled_at=now()
   WHERE id=_receipt_id;

  INSERT INTO financial_audit_log(entity_type, entity_id, action, old_data, new_data, performed_by, reason)
  VALUES ('financial_receipts', _receipt_id, 'FINANCIAL_RECEIPT_CANCELED',
          jsonb_build_object('status', v_rec.status),
          jsonb_build_object('status', 'CANCELED'),
          auth.uid(), _reason);
END$function$;

-- 4. Corrigir log_report_export
CREATE OR REPLACE FUNCTION public.log_report_export(_report_type text, _filters jsonb, _format text, _storage_bucket text, _storage_path text, _status text DEFAULT 'SUCCESS'::text, _error text DEFAULT NULL::text, _row_count integer DEFAULT NULL::integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  INSERT INTO financial_report_exports(report_type, filters, format, storage_bucket, storage_path, status, error_message, row_count, generated_by)
  VALUES (_report_type, _filters, _format, _storage_bucket, _storage_path, _status, _error, _row_count, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_report_exports', v_id, 'FINANCIAL_REPORT_EXPORTED',
          jsonb_build_object('report_type', _report_type, 'format', _format, 'status', _status), auth.uid());
  RETURN v_id;
END;$function$;

-- 5. Corrigir log_report_view (entity_id NOT NULL → usar gen_random_uuid placeholder não, deixar usar uma constante? coluna entity_id é NOT NULL)
-- vamos usar o uuid zero para indicar visualização agregada
CREATE OR REPLACE FUNCTION public.log_report_view(p_report_type text, p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RETURN; END IF;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_report', '00000000-0000-0000-0000-000000000000'::uuid, 'FINANCIAL_REPORT_VIEWED',
          jsonb_build_object('report_type', p_report_type, 'filters', p_filters), auth.uid());
END$function$;

-- 6. Corrigir register_financial_report_export
CREATE OR REPLACE FUNCTION public.register_financial_report_export(p_report_type text, p_report_title text, p_filters jsonb, p_file_format text, p_storage_path text DEFAULT NULL::text, p_status text DEFAULT 'SUCCESS'::text, p_error_message text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  INSERT INTO financial_report_exports(
    report_type, report_title, filters, format, file_format,
    storage_bucket, storage_path, status, error_message, generated_by
  ) VALUES (
    p_report_type, COALESCE(p_report_title, p_report_type), COALESCE(p_filters,'{}'::jsonb),
    p_file_format, p_file_format,
    CASE WHEN p_storage_path IS NULL THEN NULL ELSE 'financial-reports' END,
    p_storage_path, p_status, p_error_message, auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_report_exports', v_id, 'FINANCIAL_REPORT_EXPORTED',
          jsonb_build_object('report_type', p_report_type, 'format', p_file_format,
                             'title', p_report_title, 'status', p_status), auth.uid());
  RETURN v_id;
END$function$;

-- 7. Nova RPC para upsert manual de fiscal_invoices
CREATE OR REPLACE FUNCTION public.rpc_upsert_fiscal_invoice_manual(p_receivable_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ar  record;
  v_existing record;
  v_id uuid;
  v_status text;
  v_number text;
  v_series text;
  v_key text;
  v_issue date;
  v_type text;
  v_total numeric(14,2);
  v_old jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para alterar dados fiscais.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_ar FROM accounts_receivable WHERE id = p_receivable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a receber não encontrada.'; END IF;

  v_status := COALESCE(NULLIF(p_payload->>'status',''), 'PENDING');
  v_number := NULLIF(p_payload->>'invoice_number','');
  v_series := NULLIF(p_payload->>'series','');
  v_key    := NULLIF(p_payload->>'access_key','');
  v_issue  := NULLIF(p_payload->>'issue_date','')::date;
  v_type   := COALESCE(NULLIF(p_payload->>'invoice_type',''), 'NFE');
  v_total  := COALESCE((p_payload->>'total_amount')::numeric, v_ar.total_amount);

  IF v_status NOT IN ('PENDING','ISSUED','CANCELED','ERROR') THEN
    RAISE EXCEPTION 'Status fiscal inválido: %', v_status USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_existing FROM fiscal_invoices WHERE receivable_id = p_receivable_id LIMIT 1;

  IF FOUND THEN
    v_old := to_jsonb(v_existing);
    UPDATE fiscal_invoices SET
      status = v_status,
      invoice_number = v_number,
      series = v_series,
      access_key = v_key,
      issue_date = v_issue,
      invoice_type = v_type,
      total_amount = v_total
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO fiscal_invoices(
      receivable_id, invoice_type, invoice_number, series, access_key,
      issue_date, total_amount, status, created_by
    ) VALUES (
      p_receivable_id, v_type, v_number, v_series, v_key,
      v_issue, v_total, v_status, v_uid
    ) RETURNING id INTO v_id;
  END IF;

  -- Espelhar no contas a receber
  UPDATE accounts_receivable SET
    fiscal_invoice_status = CASE
      WHEN v_status = 'ISSUED' THEN 'ISSUED'
      WHEN v_status = 'CANCELED' THEN 'CANCELED'
      WHEN v_status = 'PENDING' THEN 'PENDING'
      ELSE accounts_receivable.fiscal_invoice_status
    END,
    fiscal_invoice_number = v_number,
    fiscal_access_key = v_key,
    fiscal_issue_date = v_issue
  WHERE id = p_receivable_id;

  -- Auditoria (UPDATE da fiscal_invoices já registra via trigger fn_audit_fiscal_status quando status mudou)
  INSERT INTO financial_audit_log(entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES ('fiscal_invoices', v_id, CASE WHEN v_existing.id IS NULL THEN 'FISCAL_INVOICE_CREATED' ELSE 'FISCAL_INVOICE_UPDATED' END,
          v_old,
          jsonb_build_object('status', v_status, 'invoice_number', v_number, 'access_key', v_key, 'issue_date', v_issue),
          v_uid);

  RETURN jsonb_build_object('invoice_id', v_id, 'status', v_status);
END$function$;

REVOKE ALL ON FUNCTION public.rpc_upsert_fiscal_invoice_manual(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_fiscal_invoice_manual(uuid, jsonb) TO authenticated;
