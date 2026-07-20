
-- 1. Hardening de os_faturamento_base
DROP POLICY IF EXISTS "View billing base" ON public.os_faturamento_base;
DROP POLICY IF EXISTS "Manage billing base" ON public.os_faturamento_base;

CREATE POLICY "ofb_staff_all" ON public.os_faturamento_base
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_financial_staff(auth.uid()) OR public.has_role(auth.uid(),'administrativo'::app_role))
  WITH CHECK (public.is_financial_staff(auth.uid()) OR public.has_role(auth.uid(),'administrativo'::app_role));

CREATE POLICY "ofb_producer_read_own" ON public.os_faturamento_base
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'cliente_produtor'::app_role)
    AND cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
  );

-- 2. RPCs de desativação (anti-delete)
CREATE OR REPLACE FUNCTION public.rpc_desativar_financial_category(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='insufficient_privilege';
  END IF;
  UPDATE financial_categories SET active = false WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada.'; END IF;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
  VALUES ('financial_categories', p_id, 'CATEGORY_DEACTIVATED',
          jsonb_build_object('active', false), auth.uid(), p_reason);
END$$;

CREATE OR REPLACE FUNCTION public.rpc_desativar_cost_center(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='insufficient_privilege';
  END IF;
  UPDATE financial_cost_centers SET active = false WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Centro de custo não encontrado.'; END IF;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
  VALUES ('financial_cost_centers', p_id, 'COST_CENTER_DEACTIVATED',
          jsonb_build_object('active', false), auth.uid(), p_reason);
END$$;

CREATE OR REPLACE FUNCTION public.rpc_desativar_bank_account(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='insufficient_privilege';
  END IF;
  UPDATE bank_accounts SET active = false WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta bancária não encontrada.'; END IF;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
  VALUES ('bank_accounts', p_id, 'BANK_ACCOUNT_DEACTIVATED',
          jsonb_build_object('active', false), auth.uid(), p_reason);
END$$;

CREATE OR REPLACE FUNCTION public.rpc_desativar_payment_method(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='insufficient_privilege';
  END IF;
  UPDATE payment_methods SET active = false WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forma de pagamento não encontrada.'; END IF;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
  VALUES ('payment_methods', p_id, 'PAYMENT_METHOD_DEACTIVATED',
          jsonb_build_object('active', false), auth.uid(), p_reason);
END$$;

-- 3. RPC: cancelar conta a receber
CREATE OR REPLACE FUNCTION public.rpc_cancel_accounts_receivable(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ar record; v_has_payment boolean;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Motivo é obrigatório (mín. 5 caracteres).' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO v_ar FROM accounts_receivable WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a receber não encontrada.'; END IF;
  IF v_ar.status = 'CANCELED' THEN RAISE EXCEPTION 'Conta já cancelada.'; END IF;
  IF v_ar.status = 'PAID' THEN RAISE EXCEPTION 'Conta paga não pode ser cancelada.'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    WHERE i.receivable_id = p_id AND COALESCE(rp.is_reversal,false) = false
      AND NOT EXISTS (SELECT 1 FROM receivable_payments r2 WHERE r2.reversed_payment_id = rp.id)
  ) INTO v_has_payment;
  IF v_has_payment THEN
    RAISE EXCEPTION 'Existem recebimentos não estornados. Estorne antes de cancelar.' USING ERRCODE='check_violation';
  END IF;

  UPDATE accounts_receivable_installments
     SET status = 'CANCELED'
   WHERE receivable_id = p_id AND status IN ('OPEN','PARTIAL','OVERDUE');
  UPDATE accounts_receivable SET status = 'CANCELED' WHERE id = p_id;

  INSERT INTO financial_audit_log(entity_type, entity_id, action, old_data, new_data, performed_by, reason)
  VALUES ('accounts_receivable', p_id, 'AR_CANCELED',
          jsonb_build_object('status', v_ar.status),
          jsonb_build_object('status','CANCELED'), auth.uid(), p_reason);
END$$;

-- 4. RPC: cancelar conta a pagar
CREATE OR REPLACE FUNCTION public.rpc_cancel_accounts_payable(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ap record; v_has_payment boolean;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Motivo é obrigatório (mín. 5 caracteres).' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO v_ap FROM accounts_payable WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a pagar não encontrada.'; END IF;
  IF v_ap.status = 'CANCELED' THEN RAISE EXCEPTION 'Conta já cancelada.'; END IF;
  IF v_ap.status = 'PAID' THEN RAISE EXCEPTION 'Conta paga não pode ser cancelada.'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM payable_payments pp
    JOIN accounts_payable_installments i ON i.id = pp.installment_id
    WHERE i.payable_id = p_id AND COALESCE(pp.is_reversal,false) = false
      AND NOT EXISTS (SELECT 1 FROM payable_payments r2 WHERE r2.reversed_payment_id = pp.id)
  ) INTO v_has_payment;
  IF v_has_payment THEN
    RAISE EXCEPTION 'Existem pagamentos não estornados. Estorne antes de cancelar.' USING ERRCODE='check_violation';
  END IF;

  UPDATE accounts_payable_installments
     SET status = 'CANCELED'
   WHERE payable_id = p_id AND status IN ('OPEN','PARTIAL','OVERDUE');
  UPDATE accounts_payable SET status = 'CANCELED' WHERE id = p_id;

  INSERT INTO financial_audit_log(entity_type, entity_id, action, old_data, new_data, performed_by, reason)
  VALUES ('accounts_payable', p_id, 'AP_CANCELED',
          jsonb_build_object('status', v_ap.status),
          jsonb_build_object('status','CANCELED'), auth.uid(), p_reason);
END$$;

-- 5. RPC: cancelar parcela individual
CREATE OR REPLACE FUNCTION public.rpc_cancel_financial_installment(p_installment_id uuid, p_kind text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text; v_has_payment boolean; v_table text;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Motivo é obrigatório (mín. 5 caracteres).' USING ERRCODE='check_violation';
  END IF;
  IF p_kind NOT IN ('receivable','payable') THEN
    RAISE EXCEPTION 'Tipo inválido: %', p_kind USING ERRCODE='check_violation';
  END IF;

  IF p_kind = 'receivable' THEN
    SELECT status INTO v_status FROM accounts_receivable_installments WHERE id = p_installment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;
    IF v_status IN ('PAID','PARTIAL') THEN
      SELECT EXISTS (
        SELECT 1 FROM receivable_payments rp
        WHERE rp.installment_id = p_installment_id AND COALESCE(rp.is_reversal,false) = false
          AND NOT EXISTS (SELECT 1 FROM receivable_payments r2 WHERE r2.reversed_payment_id = rp.id)
      ) INTO v_has_payment;
      IF v_has_payment THEN
        RAISE EXCEPTION 'Parcela possui recebimentos não estornados.' USING ERRCODE='check_violation';
      END IF;
    END IF;
    IF v_status = 'CANCELED' THEN RAISE EXCEPTION 'Parcela já cancelada.'; END IF;
    UPDATE accounts_receivable_installments SET status='CANCELED' WHERE id = p_installment_id;
    v_table := 'accounts_receivable_installments';
  ELSE
    SELECT status INTO v_status FROM accounts_payable_installments WHERE id = p_installment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;
    IF v_status IN ('PAID','PARTIAL') THEN
      SELECT EXISTS (
        SELECT 1 FROM payable_payments pp
        WHERE pp.installment_id = p_installment_id AND COALESCE(pp.is_reversal,false) = false
          AND NOT EXISTS (SELECT 1 FROM payable_payments r2 WHERE r2.reversed_payment_id = pp.id)
      ) INTO v_has_payment;
      IF v_has_payment THEN
        RAISE EXCEPTION 'Parcela possui pagamentos não estornados.' USING ERRCODE='check_violation';
      END IF;
    END IF;
    IF v_status = 'CANCELED' THEN RAISE EXCEPTION 'Parcela já cancelada.'; END IF;
    UPDATE accounts_payable_installments SET status='CANCELED' WHERE id = p_installment_id;
    v_table := 'accounts_payable_installments';
  END IF;

  INSERT INTO financial_audit_log(entity_type, entity_id, action, old_data, new_data, performed_by, reason)
  VALUES (v_table, p_installment_id, 'INSTALLMENT_CANCELED',
          jsonb_build_object('status', v_status),
          jsonb_build_object('status','CANCELED'), auth.uid(), p_reason);
END$$;

REVOKE ALL ON FUNCTION public.rpc_desativar_financial_category(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_desativar_cost_center(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_desativar_bank_account(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_desativar_payment_method(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_cancel_accounts_receivable(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_cancel_accounts_payable(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_cancel_financial_installment(uuid,text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_desativar_financial_category(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_desativar_cost_center(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_desativar_bank_account(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_desativar_payment_method(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_accounts_receivable(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_accounts_payable(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_financial_installment(uuid,text,text) TO authenticated;
