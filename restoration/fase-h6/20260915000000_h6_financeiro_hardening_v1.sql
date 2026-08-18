-- ============================================================================
-- FASE H6 — HARDENING FINANCEIRO AR BIO (staging ikaauvsflpmamgxmkhoq)
-- H6-001 P1: baixas gravaveis diretamente por qualquer staff financeiro (bypass RPC)
-- H6-002 P1: ausencia de chave de idempotencia em baixas (duplo clique = baixa dupla)
-- H6-003 P1: snapshot financeiro mutavel (valor, parcelas, origem, datas)
-- H6-004 P2: GRANT residual a anon em recurring_financial_templates
-- H6-005 P2: geracao recorrente sem unicidade de competencia
-- Idempotente: pode ser reaplicada.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- H6-002 — Idempotencia de baixas
-- ---------------------------------------------------------------------------
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.payable_payments   ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_rp_idempotency
  ON public.receivable_payments (installment_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_pp_idempotency
  ON public.payable_payments (installment_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- H6-001 — Razao de baixas append-only
-- ---------------------------------------------------------------------------
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

-- RLS: leitura para staff financeiro; escrita apenas via RPC SECURITY DEFINER
DROP POLICY IF EXISTS "Financial staff full access" ON public.receivable_payments;
DROP POLICY IF EXISTS "Financial staff full access" ON public.payable_payments;

DROP POLICY IF EXISTS rp_select_financial ON public.receivable_payments;
CREATE POLICY rp_select_financial ON public.receivable_payments
  FOR SELECT TO authenticated USING (public.is_financial_staff(auth.uid()));

DROP POLICY IF EXISTS pp_select_financial ON public.payable_payments;
CREATE POLICY pp_select_financial ON public.payable_payments
  FOR SELECT TO authenticated USING (public.is_financial_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- H6-003 — Imutabilidade do snapshot de titulos e parcelas
-- ---------------------------------------------------------------------------
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

DROP TRIGGER IF EXISTS trg_h6_ar_snapshot ON public.accounts_receivable;
CREATE TRIGGER trg_h6_ar_snapshot
  BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6_guard_title_snapshot();

DROP TRIGGER IF EXISTS trg_h6_ap_snapshot ON public.accounts_payable;
CREATE TRIGGER trg_h6_ap_snapshot
  BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6_guard_title_snapshot();

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

DROP TRIGGER IF EXISTS trg_h6_ari_snapshot ON public.accounts_receivable_installments;
CREATE TRIGGER trg_h6_ari_snapshot
  BEFORE UPDATE ON public.accounts_receivable_installments
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6_guard_ar_installment_snapshot();

DROP TRIGGER IF EXISTS trg_h6_api_snapshot ON public.accounts_payable_installments;
CREATE TRIGGER trg_h6_api_snapshot
  BEFORE UPDATE ON public.accounts_payable_installments
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6_guard_ap_installment_snapshot();

-- ---------------------------------------------------------------------------
-- H6-004 — Revogar GRANT residual a anon
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.recurring_financial_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_financial_templates TO authenticated;
GRANT ALL ON public.recurring_financial_templates TO service_role;

-- ---------------------------------------------------------------------------
-- H6-005 — Unicidade de competencia gerada
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_recurring_generation_success
  ON public.recurring_generation_log (template_id, reference_date)
  WHERE status = 'SUCCESS';

COMMIT;
