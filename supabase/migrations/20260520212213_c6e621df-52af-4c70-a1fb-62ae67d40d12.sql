
-- 1. Colunas de estorno
ALTER TABLE public.receivable_payments
  ADD COLUMN IF NOT EXISTS is_reversal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversed_payment_id uuid REFERENCES public.receivable_payments(id),
  ADD COLUMN IF NOT EXISTS reversal_reason text;

ALTER TABLE public.payable_payments
  ADD COLUMN IF NOT EXISTS is_reversal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversed_payment_id uuid REFERENCES public.payable_payments(id),
  ADD COLUMN IF NOT EXISTS reversal_reason text;

-- 2. RLS: bloquear DELETE p/ todos exceto administrador
DROP POLICY IF EXISTS "rp_delete_admin_only" ON public.receivable_payments;
CREATE POLICY "rp_delete_admin_only" ON public.receivable_payments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

DROP POLICY IF EXISTS "pp_delete_admin_only" ON public.payable_payments;
CREATE POLICY "pp_delete_admin_only" ON public.payable_payments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

-- 3. RPC de estorno
CREATE OR REPLACE FUNCTION public.fn_reverse_payment(_payment_id uuid, _kind text, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_id uuid;
  v_row record;
BEGIN
  IF NOT (public.has_role(v_uid, 'administrador'::app_role) OR public.has_role(v_uid, 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'Apenas administrador ou gestor podem estornar uma baixa.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Informe um motivo (mín. 5 caracteres) para o estorno.' USING ERRCODE='check_violation';
  END IF;

  IF _kind = 'receivable' THEN
    SELECT * INTO v_row FROM public.receivable_payments WHERE id = _payment_id;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;
    IF EXISTS (SELECT 1 FROM public.receivable_payments WHERE reversed_payment_id = _payment_id) THEN
      RAISE EXCEPTION 'Este pagamento já foi estornado.';
    END IF;
    INSERT INTO public.receivable_payments(
      installment_id, payment_date, payment_method_id, bank_account_id,
      amount_received, discount_amount, interest_amount, penalty_amount,
      notes, created_by, is_reversal, reversed_payment_id, reversal_reason
    ) VALUES (
      v_row.installment_id, CURRENT_DATE, v_row.payment_method_id, v_row.bank_account_id,
      -v_row.amount_received, -COALESCE(v_row.discount_amount,0), -COALESCE(v_row.interest_amount,0), -COALESCE(v_row.penalty_amount,0),
      '[ESTORNO] '||_reason, v_uid, true, _payment_id, _reason
    ) RETURNING id INTO v_new_id;
  ELSIF _kind = 'payable' THEN
    SELECT * INTO v_row FROM public.payable_payments WHERE id = _payment_id;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;
    IF EXISTS (SELECT 1 FROM public.payable_payments WHERE reversed_payment_id = _payment_id) THEN
      RAISE EXCEPTION 'Este pagamento já foi estornado.';
    END IF;
    INSERT INTO public.payable_payments(
      installment_id, payment_date, payment_method_id, bank_account_id,
      amount_paid, discount_amount, interest_amount, penalty_amount,
      notes, created_by, is_reversal, reversed_payment_id, reversal_reason
    ) VALUES (
      v_row.installment_id, CURRENT_DATE, v_row.payment_method_id, v_row.bank_account_id,
      -v_row.amount_paid, -COALESCE(v_row.discount_amount,0), -COALESCE(v_row.interest_amount,0), -COALESCE(v_row.penalty_amount,0),
      '[ESTORNO] '||_reason, v_uid, true, _payment_id, _reason
    ) RETURNING id INTO v_new_id;
  ELSE
    RAISE EXCEPTION 'Tipo inválido: %', _kind;
  END IF;

  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES (CASE WHEN _kind='receivable' THEN 'receivable_payments' ELSE 'payable_payments' END,
          v_new_id, 'PAYMENT_REVERSAL_CREATED',
          jsonb_build_object('reversed_payment_id', _payment_id, 'reason', _reason),
          v_uid);

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_reverse_payment(uuid, text, text) TO authenticated;

-- 4. Auditoria em financial_documents
CREATE OR REPLACE FUNCTION public.fn_audit_financial_documents()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
    VALUES ('financial_documents', NEW.id, 'FINANCIAL_DOCUMENT_UPLOADED', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, old_data, performed_by)
    VALUES ('financial_documents', OLD.id, 'FINANCIAL_DOCUMENT_DELETED', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_audit_findocs ON public.financial_documents;
CREATE TRIGGER trg_audit_findocs
  AFTER INSERT OR DELETE ON public.financial_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_financial_documents();

-- 5. Auditoria em fiscal_invoices (mudança de status)
CREATE OR REPLACE FUNCTION public.fn_audit_fiscal_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND COALESCE(OLD.status,'') IS DISTINCT FROM COALESCE(NEW.status,'') THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, old_data, new_data, performed_by)
    VALUES ('fiscal_invoices', NEW.id, 'FISCAL_STATUS_UPDATED',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status, 'invoice_number', NEW.invoice_number),
            auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_fiscal_status ON public.fiscal_invoices;
CREATE TRIGGER trg_audit_fiscal_status
  AFTER UPDATE ON public.fiscal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_fiscal_status();

-- 6. Índice
CREATE INDEX IF NOT EXISTS idx_findocs_owner ON public.financial_documents(owner_type, owner_id);
