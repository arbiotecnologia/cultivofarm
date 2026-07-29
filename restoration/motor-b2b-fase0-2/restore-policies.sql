-- =====================================================================
-- MOTOR B2B — ROLLBACK DE EMERGENCIA DA FASE 0.2
-- Restaura EXATAMENTE o baseline capturado ANTES da Fase 0.2
-- (docs/motor-b2b-fase0-2-security-baseline.md, secoes 1-4).
--
-- Ambiente permitido: STAGING ikaauvsflpmamgxmkhoq
-- Ambiente PROIBIDO : PRODUCAO navfzbwgwzruipouyfnk
--
--   psql "$PGURL_STAGING" --single-transaction -v ON_ERROR_STOP=1 \
--        -f restoration/motor-b2b-fase0-2/restore-policies.sql
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!! ATENCAO !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- ESTE SCRIPT REINTRODUZ VULNERABILIDADES CONHECIDAS:
--   * tecnico de parceiro (parceiro_b2b_tecnico) volta a LER condicoes e
--     cronogramas de pagamento e recebiveis B2B do parceiro;
--   * produtor (cliente_produtor) volta a LER titulo e parcelas de pedidos
--     B2B que carreguem o seu customer_id;
--   * anon e PUBLIC voltam a ter EXECUTE nas 4 RPCs sensiveis e privilegios
--     totais nas tabelas B2B.
-- Use SOMENTE em emergencia, SOMENTE no staging, e reaplique o hardening
-- (supabase/migrations/20260729010220_motor_b2b_fase0_2_hardening_rls.sql)
-- assim que a regressao funcional for resolvida.
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- =====================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'STAGING_GUARD: marker oficial ausente'; END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN RAISE EXCEPTION 'STAGING_GUARD: PRODUCAO recusada'; END IF;
  IF v_ref <> 'ikaauvsflpmamgxmkhoq' THEN RAISE EXCEPTION 'STAGING_GUARD: ref inesperado %', v_ref; END IF;
  RAISE NOTICE 'STAGING_GUARD OK (ref=%)', v_ref;
END;
$guard$;

-- ---------------------------------------------------------------------
-- 1. partner_order_payment_terms.popt_select (baseline)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS popt_select ON public.partner_order_payment_terms;
CREATE POLICY popt_select ON public.partner_order_payment_terms
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (EXISTS (
        SELECT 1 FROM partner_orders po
        JOIN partner_users pu ON pu.partner_id = po.partner_id
        WHERE po.id = partner_order_payment_terms.partner_order_id
          AND pu.user_id = auth.uid()))
);

-- ---------------------------------------------------------------------
-- 2. partner_order_payment_schedule.pops_select (baseline)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS pops_select ON public.partner_order_payment_schedule;
CREATE POLICY pops_select ON public.partner_order_payment_schedule
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (EXISTS (
        SELECT 1 FROM partner_orders po
        JOIN partner_users pu ON pu.partner_id = po.partner_id
        WHERE po.id = partner_order_payment_schedule.partner_order_id
          AND pu.user_id = auth.uid()))
);

-- ---------------------------------------------------------------------
-- 3. accounts_receivable (baseline)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS ar_producer_read ON public.accounts_receivable;
CREATE POLICY ar_producer_read ON public.accounts_receivable
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'cliente_produtor'::app_role)
  AND customer_id = ANY (get_cliente_ids_for_user(auth.uid()))
);

DROP POLICY IF EXISTS ar_partner_select_own_b2b ON public.accounts_receivable;
CREATE POLICY ar_partner_select_own_b2b ON public.accounts_receivable
FOR SELECT TO authenticated
USING (
  origin_type = 'B2B_ORDER'
  AND partner_id IN (SELECT partner_users.partner_id FROM partner_users WHERE partner_users.user_id = auth.uid())
);

-- ---------------------------------------------------------------------
-- 4. accounts_receivable_installments (baseline)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS ari_producer_read ON public.accounts_receivable_installments;
CREATE POLICY ari_producer_read ON public.accounts_receivable_installments
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'cliente_produtor'::app_role)
  AND EXISTS (
    SELECT 1 FROM accounts_receivable ar
    WHERE ar.id = accounts_receivable_installments.receivable_id
      AND ar.customer_id = ANY (get_cliente_ids_for_user(auth.uid())))
);

-- policy criada na Fase 0.2 (nao existia no baseline)
DROP POLICY IF EXISTS ari_partner_select_own_b2b ON public.accounts_receivable_installments;

-- ---------------------------------------------------------------------
-- 5. ACLs do baseline (RPCs sensiveis e tabelas)
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.approve_b2b_payment_terms_secure(uuid, text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_b2b_payment_terms_secure(uuid, text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_b2b_payment_terms_adjustment_secure(uuid, text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_b2b_payment_terms_note_secure(uuid, text) TO PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.partner_order_payment_terms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.partner_order_payment_schedule TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.partner_orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.partner_order_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.partner_users TO anon;

-- ---------------------------------------------------------------------
-- 6. Indice criado na Fase 0.2 (ausente no baseline)
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_ari_receivable;

COMMIT;
