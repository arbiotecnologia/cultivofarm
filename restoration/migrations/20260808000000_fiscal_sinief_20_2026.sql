-- =====================================================================
-- Fase SINIEF 4.0.2 — Ajuste SINIEF 20/2026 (INCREMENTAL, aditivo)
--
-- Arquivo residente em `restoration/migrations/` — segue o padrão das
-- migrations órfãs canônicas da fase fiscal. NÃO é aplicada automaticamente
-- pelo pipeline supabase; será registrada em supabase_migrations no mesmo
-- procedimento manual da 20260807000000 (documentado no README da Fase 4).
--
-- Não edita 20260807000000_fiscal_sinief_49_scaffolding.sql. Adiciona:
--   1. icms_due (bool) + icms_amount (numeric)  — ICMS SOMENTE quando devido.
--   2. original_recipient_snapshot (jsonb)      — snapshot IMUTÁVEL do grupo
--      XML <dest> da NF-e original, obrigatório para VALUE_QUANTITY_REDUCTION.
--   3. CHECKs restritivos + trigger de imutabilidade do snapshot.
--   4. Extensão do CHECK de fiscal_events.event_type com 2 novos tipos.
--
-- Aditivo, idempotente, sem GRANT/POLICY (herda de fiscal_invoices/fiscal_events).
-- canTransmit segue false. Nenhum emissor/provedor é configurado.
-- =====================================================================

BEGIN;

ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS icms_due boolean,
  ADD COLUMN IF NOT EXISTS icms_amount numeric(18,2),
  ADD COLUMN IF NOT EXISTS original_recipient_snapshot jsonb;

COMMENT ON COLUMN public.fiscal_invoices.icms_due IS
  'SINIEF 20/2026: TRUE quando há ICMS efetivamente devido; FALSE/NULL caso contrário.';
COMMENT ON COLUMN public.fiscal_invoices.icms_amount IS
  'SINIEF 20/2026: valor de ICMS somente quando icms_due=TRUE (>=0).';
COMMENT ON COLUMN public.fiscal_invoices.original_recipient_snapshot IS
  'SINIEF 20/2026: snapshot imutável do grupo XML <dest> da NF-e original. '
  'Chaves esperadas ao mapear <dest>: kind, cnpjCpf, ie, name, address{...}, '
  'capturedAt, source. Preparado — o preenchimento efetivo virá do mapeador XML.';

-- 1) ICMS somente quando devido -------------------------------------------
ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_sinief20_icms_conditional;
ALTER TABLE public.fiscal_invoices
  ADD CONSTRAINT chk_fi_sinief20_icms_conditional CHECK (
    icms_amount IS NULL
    OR (icms_due IS TRUE AND icms_amount >= 0)
  );

-- 2) Snapshot destinatário obrigatório para VALUE_QUANTITY_REDUCTION ------
ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_sinief20_reduction_dest_snapshot;
ALTER TABLE public.fiscal_invoices
  ADD CONSTRAINT chk_fi_sinief20_reduction_dest_snapshot CHECK (
    fiscal_operation_type IS DISTINCT FROM 'VALUE_QUANTITY_REDUCTION'
    OR (
      original_recipient_snapshot IS NOT NULL
      AND jsonb_typeof(original_recipient_snapshot) = 'object'
    )
  );

-- 3) Imutabilidade do snapshot depois de gravado --------------------------
CREATE OR REPLACE FUNCTION public.fiscal_sinief20_snapshot_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.original_recipient_snapshot IS NOT NULL
     AND NEW.original_recipient_snapshot IS DISTINCT FROM OLD.original_recipient_snapshot THEN
    RAISE EXCEPTION
      'SINIEF 20/2026: original_recipient_snapshot é imutável após persistência.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fi_sinief20_snapshot_immutable ON public.fiscal_invoices;
CREATE TRIGGER trg_fi_sinief20_snapshot_immutable
  BEFORE UPDATE OF original_recipient_snapshot ON public.fiscal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_sinief20_snapshot_immutable();

-- 4) Novos event types (aditivos) -----------------------------------------
-- A migration 20260807000000 mantém o CHECK completo (13 legados + 7 SINIEF49).
-- Aqui recriamos o CHECK como união total incluindo os 2 novos tipos SINIEF 20.
ALTER TABLE public.fiscal_events
  DROP CONSTRAINT IF EXISTS fiscal_events_event_type_check;
ALTER TABLE public.fiscal_events
  ADD CONSTRAINT fiscal_events_event_type_check CHECK (event_type IN (
    -- 13 legados
    'CREATED','MANUAL_UPDATED','DOCUMENT_ATTACHED','VALIDATION_REQUESTED',
    'VALIDATION_FAILED','READY_FOR_FUTURE_INTEGRATION',
    'RECONCILIATION_REQUIRED','RECONCILIATION_COMPLETED',
    'DOCUMENT_CANCELED_FINANCIAL_REVIEW_REQUIRED','TOTAL_MISMATCH',
    'CUSTOMER_MISMATCH','SOURCE_MISMATCH','REPLACEMENT_REQUIRED',
    -- 7 SINIEF 49
    'SINIEF_ADVANCE_PAYMENT_ISSUED','SINIEF_EFFECTIVE_SALE_ISSUED',
    'SINIEF_STOCK_LOSS_ISSUED','SINIEF_VALUE_QUANTITY_REDUCTION_ISSUED',
    'SINIEF_DELIVERY_REFUSAL_TOTAL_ISSUED',
    'SINIEF_DELIVERY_REFUSAL_PARTIAL_ISSUED',
    'SINIEF_RECIPIENT_NOT_FOUND_ISSUED',
    -- 2 SINIEF 20/2026
    'SINIEF20_ICMS_EVALUATED','SINIEF20_RECIPIENT_SNAPSHOT_CAPTURED'
  ));

COMMIT;
