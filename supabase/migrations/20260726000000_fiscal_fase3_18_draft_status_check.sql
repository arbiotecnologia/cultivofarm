-- ============================================================================
-- Fase Fiscal 3.18 — Correção incremental do domínio de status de rascunho.
-- ----------------------------------------------------------------------------
-- Migrations 20260721000000..20260725000000 já aplicadas em staging (AR-Bio-TEMP).
-- Evidência runtime: fiscal_invoices_status_check aceita apenas
--   { PENDING, ISSUED, CANCELED, ERROR }
-- e a Fase 3.16 grava status='DRAFT' via rpc_fiscal_draft_save, causando
-- SQLSTATE 23514.
--
-- Esta migration:
--   1. Audita fiscal_invoices.status e ABORTA se houver valor fora do
--      conjunto legado { PENDING, ISSUED, CANCELED, ERROR }. Nenhum dado
--      é limpo, apagado ou reescrito.
--   2. Substitui SOMENTE a CHECK fiscal_invoices_status_check preservando
--      os quatro valores legados e adicionando 'DRAFT'.
--   3. Não toca em normalized_status, homologation_validation_status,
--      RPCs, RLS, GRANTs ou qualquer outro objeto.
--
-- Sem provedor, sem emissão, sem produção, sem segredos.
-- ============================================================================

BEGIN;

DO $mig_318$
DECLARE
  v_bad_count integer;
  v_conname   text;
BEGIN
  IF to_regclass('public.fiscal_invoices') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_318_ABORT: tabela public.fiscal_invoices ausente.';
  END IF;

  SELECT count(*) INTO v_bad_count
    FROM public.fiscal_invoices
   WHERE status IS NOT NULL
     AND status NOT IN ('PENDING','ISSUED','CANCELED','ERROR');
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION
      'FISCAL_318_ABORT: % linhas com status fora do conjunto legado. Corrija manualmente antes de reaplicar.',
      v_bad_count;
  END IF;

  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.fiscal_invoices'::regclass
     AND contype = 'c'
     AND conname = 'fiscal_invoices_status_check'
   LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.fiscal_invoices DROP CONSTRAINT IF EXISTS fiscal_invoices_status_check';
  END IF;

  ALTER TABLE public.fiscal_invoices
    ADD CONSTRAINT fiscal_invoices_status_check
    CHECK (status IN ('DRAFT','PENDING','ISSUED','CANCELED','ERROR'));

  RAISE NOTICE 'FISCAL_318 OK: fiscal_invoices_status_check agora aceita DRAFT + legados.';
END
$mig_318$;

COMMIT;
