-- ============================================================================
-- H6d — ROLLBACK integral para a baseline H6/H6b/H6c.
-- Restaura triggers/guards/policies exatamente como estavam antes do H6d.
-- SOMENTE staging. Nao apaga dados.
-- ============================================================================

BEGIN;

-- H6d-001 (reverter): append-only apenas BEFORE UPDATE + policy de delete admin
CREATE OR REPLACE FUNCTION public.fn_h6_payments_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Baixa financeira e imutavel: use estorno (fn_reverse_payment).'
    USING ERRCODE='check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_h6_rp_append_only ON public.receivable_payments;
CREATE TRIGGER trg_h6_rp_append_only
  BEFORE UPDATE ON public.receivable_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6_payments_append_only();

DROP TRIGGER IF EXISTS trg_h6_pp_append_only ON public.payable_payments;
CREATE TRIGGER trg_h6_pp_append_only
  BEFORE UPDATE ON public.payable_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6_payments_append_only();

GRANT DELETE ON public.receivable_payments TO authenticated;
GRANT DELETE ON public.payable_payments   TO authenticated;

DROP POLICY IF EXISTS rp_delete_admin_only ON public.receivable_payments;
CREATE POLICY rp_delete_admin_only ON public.receivable_payments
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'administrador'::app_role));
DROP POLICY IF EXISTS pp_delete_admin_only ON public.payable_payments;
CREATE POLICY pp_delete_admin_only ON public.payable_payments
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'administrador'::app_role));

-- H6d-002 (reverter): remover triggers de bloqueio de DELETE e restaurar policy ALL
DROP TRIGGER IF EXISTS trg_h6d_ar_no_delete  ON public.accounts_receivable;
DROP TRIGGER IF EXISTS trg_h6d_ap_no_delete  ON public.accounts_payable;
DROP TRIGGER IF EXISTS trg_h6d_ari_no_delete ON public.accounts_receivable_installments;
DROP TRIGGER IF EXISTS trg_h6d_api_no_delete ON public.accounts_payable_installments;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts_receivable','accounts_payable',
                           'accounts_receivable_installments','accounts_payable_installments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select_financial', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert_financial', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update_financial', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Financial staff full access', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_financial_staff(auth.uid())) WITH CHECK (public.is_financial_staff(auth.uid()))',
                   'Financial staff full access', t);
  END LOOP;
END $do$;

-- H6d-003 (reverter): guards de parcela na versao H6
CREATE OR REPLACE FUNCTION public.fn_h6_guard_ar_installment_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.receivable_id IS DISTINCT FROM OLD.receivable_id
     OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
     OR NEW.original_amount IS DISTINCT FROM OLD.original_amount THEN
    RAISE EXCEPTION 'Parcela imutavel: numero, titulo e valor original nao podem ser alterados.'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_h6_guard_ap_installment_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.payable_id IS DISTINCT FROM OLD.payable_id
     OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
     OR NEW.original_amount IS DISTINCT FROM OLD.original_amount THEN
    RAISE EXCEPTION 'Parcela imutavel: numero, titulo e valor original nao podem ser alterados.'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

-- H6d-004 (reverter): guard de titulo sem payment_method_id
CREATE OR REPLACE FUNCTION public.fn_h6_guard_title_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.installment_count IS DISTINCT FROM OLD.installment_count
     OR NEW.origin_type IS DISTINCT FROM OLD.origin_type
     OR NEW.origin_id IS DISTINCT FROM OLD.origin_id
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.first_due_date IS DISTINCT FROM OLD.first_due_date
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Snapshot financeiro imutavel: valor, parcelas, origem e datas de emissao nao podem ser alterados.'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP FUNCTION IF EXISTS public.fn_h6d_block_hard_delete();
DROP FUNCTION IF EXISTS public.fn_h6d_hard_delete_allowed();

COMMIT;
