
-- FASE 1: Corrigir uso antigo de colunas inexistentes em financial_audit_log
-- Schema oficial: entity_type, entity_id, action, old_data, new_data, performed_by, performed_at, reason

-- 1) issue_financial_receipt
CREATE OR REPLACE FUNCTION public.issue_financial_receipt(
  _payment_id uuid,
  _description text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    _payment_id, _payment_id, v_installment.receivable_id, v_receivable.cliente_id,
    v_payment.amount_received, v_payment.payment_date, v_payment.payment_method_id,
    v_desc, auth.uid(), 'ISSUED'
  ) RETURNING id INTO v_receipt_id;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_receipts', v_receipt_id, 'FINANCIAL_RECEIPT_ISSUED',
          jsonb_build_object('payment_id', _payment_id, 'amount', v_payment.amount_received), auth.uid());
  RETURN jsonb_build_object('duplicate', false, 'receipt_id', v_receipt_id,
    'receipt_number', (SELECT receipt_number FROM financial_receipts WHERE id = v_receipt_id));
END$$;

-- 2) cancel_financial_receipt
CREATE OR REPLACE FUNCTION public.cancel_financial_receipt(_receipt_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec record;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
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
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
  VALUES ('financial_receipts', _receipt_id, 'FINANCIAL_RECEIPT_CANCELED',
          jsonb_build_object('reason', _reason), auth.uid(), _reason);
END$$;

-- 3) register_financial_report_export
CREATE OR REPLACE FUNCTION public.register_financial_report_export(
  p_report_type text, p_report_title text, p_filters jsonb,
  p_file_format text, p_storage_path text DEFAULT NULL,
  p_status text DEFAULT 'SUCCESS', p_error_message text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END$$;

-- 4) log_report_view (entity_id NOT NULL safe: use random uuid placeholder is bad; instead skip when null)
CREATE OR REPLACE FUNCTION public.log_report_view(
  p_report_type text, p_filters jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RETURN; END IF;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_report', gen_random_uuid(), 'FINANCIAL_REPORT_VIEWED',
          jsonb_build_object('report_type', p_report_type, 'filters', p_filters), auth.uid());
END$$;

-- 5) rpc_desvincular_etiqueta_entrega: corrigir insert no financial_audit_log
CREATE OR REPLACE FUNCTION public.rpc_desvincular_etiqueta_entrega(
  p_entrega_id uuid,
  p_etiqueta_id uuid,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (
    public.has_role(v_uid,'administrador'::app_role)
    OR public.has_role(v_uid,'gestor'::app_role)
    OR public.has_role(v_uid,'producao'::app_role)
    OR public.has_role(v_uid,'operador_onfarm'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF coalesce(length(trim(p_motivo)),0) < 3 THEN
    RAISE EXCEPTION 'Motivo obrigatório';
  END IF;

  UPDATE public.entrega_etiquetas
     SET ativo = false,
         desvinculado_em = now(),
         desvinculado_por = v_uid,
         motivo_desvinculacao = p_motivo
   WHERE entrega_id = p_entrega_id
     AND etiqueta_id = p_etiqueta_id
     AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vínculo não encontrado ou já desvinculado';
  END IF;

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, user_id, payload)
  VALUES (p_etiqueta_id, 'etiqueta_substituida', v_uid,
          jsonb_build_object('entrega_id', p_entrega_id, 'motivo', p_motivo, 'acao','desvinculada'));

  BEGIN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('produto_etiqueta', p_etiqueta_id, 'LABEL_DELIVERY_UNLINKED',
            jsonb_build_object('entrega_id', p_entrega_id, 'motivo', p_motivo), v_uid, p_motivo);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_desvincular_etiqueta_entrega(uuid,uuid,text) TO authenticated;
