-- ============================================================================
-- FASE H6d — CORRECAO FOCADA POS-AUDITORIA INDEPENDENTE (staging ikaauvsflpmamgxmkhoq)
-- H6d-001 P1: baixas (receivable_payments/payable_payments) apagaveis por admin
-- H6d-002 P1: titulos AR/AP apagaveis por staff financeiro (cascade destroi parcelas)
-- H6d-003 P1: due_date/net_amount de parcelas editaveis por UPDATE direto
-- H6d-004    : payment_method_id do titulo AR fora do snapshot imutavel
-- Migration incremental NOVA. Idempotente. Nenhuma alteracao em producao.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Escotilha controlada APENAS para rotinas internas de staging (rollback/fixtures).
-- Fail-closed: exige papel de manutencao do banco E flag de sessao explicita.
-- Nao e alcancavel por anon/authenticated (PostgREST conecta como anon/authenticated).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_h6d_hard_delete_allowed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN current_user IN ('postgres', 'supabase_admin')
     AND COALESCE(current_setting('arbio.allow_financial_hard_delete', true), 'off') = 'on';
END $$;

REVOKE ALL ON FUNCTION public.fn_h6d_hard_delete_allowed() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- H6d-001 — Baixas append-only tambem contra DELETE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_h6_payments_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.fn_h6d_hard_delete_allowed() THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Baixa financeira nao pode ser excluida: use estorno (fn_reverse_payment).'
      USING ERRCODE='check_violation';
  END IF;
  RAISE EXCEPTION 'Baixa financeira e imutavel: use estorno (fn_reverse_payment).'
    USING ERRCODE='check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_h6_rp_append_only ON public.receivable_payments;
CREATE TRIGGER trg_h6_rp_append_only
  BEFORE UPDATE OR DELETE ON public.receivable_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6_payments_append_only();

DROP TRIGGER IF EXISTS trg_h6_pp_append_only ON public.payable_payments;
CREATE TRIGGER trg_h6_pp_append_only
  BEFORE UPDATE OR DELETE ON public.payable_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6_payments_append_only();

-- Policies de DELETE contrariam o modelo append-only.
DROP POLICY IF EXISTS rp_delete_admin_only ON public.receivable_payments;
DROP POLICY IF EXISTS pp_delete_admin_only ON public.payable_payments;

REVOKE DELETE ON public.receivable_payments FROM authenticated, anon;
REVOKE DELETE ON public.payable_payments   FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- H6d-002 — Titulos AR/AP e parcelas nao podem ser excluidos fisicamente
-- Cancelamento canonico: rpc_cancel_accounts_receivable / rpc_cancel_accounts_payable
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_h6d_block_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.fn_h6d_hard_delete_allowed() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Registro financeiro (%) nao pode ser excluido: cancele pelo fluxo formal (rpc_cancel_accounts_receivable / rpc_cancel_accounts_payable).', TG_TABLE_NAME
    USING ERRCODE='check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_h6d_ar_no_delete ON public.accounts_receivable;
CREATE TRIGGER trg_h6d_ar_no_delete
  BEFORE DELETE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6d_block_hard_delete();

DROP TRIGGER IF EXISTS trg_h6d_ap_no_delete ON public.accounts_payable;
CREATE TRIGGER trg_h6d_ap_no_delete
  BEFORE DELETE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6d_block_hard_delete();

-- Protege tambem contra cascade destrutivo (trigger de linha dispara na cascata).
DROP TRIGGER IF EXISTS trg_h6d_ari_no_delete ON public.accounts_receivable_installments;
CREATE TRIGGER trg_h6d_ari_no_delete
  BEFORE DELETE ON public.accounts_receivable_installments
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6d_block_hard_delete();

DROP TRIGGER IF EXISTS trg_h6d_api_no_delete ON public.accounts_payable_installments;
CREATE TRIGGER trg_h6d_api_no_delete
  BEFORE DELETE ON public.accounts_payable_installments
  FOR EACH ROW EXECUTE FUNCTION public.fn_h6d_block_hard_delete();

-- RLS: substituir policy ALL por SELECT/INSERT/UPDATE (sem DELETE).
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts_receivable','accounts_payable',
                           'accounts_receivable_installments','accounts_payable_installments']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Financial staff full access', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select_financial', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert_financial', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update_financial', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_financial_staff(auth.uid()))', t||'_select_financial', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_financial_staff(auth.uid()))', t||'_insert_financial', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_financial_staff(auth.uid())) WITH CHECK (public.is_financial_staff(auth.uid()))', t||'_update_financial', t);
    EXECUTE format('REVOKE DELETE ON public.%I FROM authenticated, anon', t);
  END LOOP;
END $do$;

-- ---------------------------------------------------------------------------
-- H6d-003 — Snapshot de parcelas: vencimento e valores de entrada imutaveis
-- Campos derivados de baixa/estorno seguem editaveis:
-- received_amount/paid_amount, discount_amount, interest_amount, penalty_amount,
-- status, paid_at.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_h6_guard_ar_installment_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.receivable_id IS DISTINCT FROM OLD.receivable_id
     OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
     OR NEW.original_amount IS DISTINCT FROM OLD.original_amount
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Parcela imutavel: titulo, numero, valor original, vencimento, valor liquido e data de criacao nao podem ser alterados.'
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
     OR NEW.original_amount IS DISTINCT FROM OLD.original_amount
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Parcela imutavel: titulo, numero, valor original, vencimento, valor liquido e data de criacao nao podem ser alterados.'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- H6d-004 — Metodo/condicao do titulo AR no snapshot imutavel
-- (nao afeta receivable_payments.payment_method_id, metodo da baixa individual)
-- Campos fiscais/administrativos continuam atualizaveis por integracoes.
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

  IF TG_TABLE_NAME = 'accounts_receivable'
     AND (to_jsonb(NEW)->>'payment_method_id') IS DISTINCT FROM (to_jsonb(OLD)->>'payment_method_id') THEN
    RAISE EXCEPTION 'Condicao/metodo do titulo e imutavel apos a criacao: use o metodo na baixa (receivable_payments).'
      USING ERRCODE='check_violation';
  END IF;

  RETURN NEW;
END $$;

COMMIT;
