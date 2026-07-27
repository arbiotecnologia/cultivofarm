-- Rollback Fase 4 — remove exclusivamente objetos criados pela Fase 4.
-- NÃO toca em nada da Fase 1 ou Fase 2.
-- TRANSACTION-NEUTRAL: o caller (rollback-staging.sh) usa
-- psql --single-transaction para atomicidade real. Não abrir BEGIN/COMMIT aqui.
\set ON_ERROR_STOP on

DROP FUNCTION IF EXISTS public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text);

DROP TRIGGER IF EXISTS trg_comunicacao_provider_receipts_noupd
  ON public.comunicacao_provider_receipts;
DROP FUNCTION IF EXISTS public.comunicacao_provider_receipts_no_mutation();

DROP TABLE IF EXISTS public.comunicacao_provider_receipts;

DROP INDEX IF EXISTS public.ix_comunicacao_outbox_wa_provider_msgid;

ALTER TABLE public.comunicacao_outbox
  DROP CONSTRAINT IF EXISTS comunicacao_outbox_provider_delivery_status_chk;

ALTER TABLE public.comunicacao_outbox
  DROP COLUMN IF EXISTS provider_delivery_status,
  DROP COLUMN IF EXISTS provider_status_at,
  DROP COLUMN IF EXISTS delivered_at,
  DROP COLUMN IF EXISTS read_at,
  DROP COLUMN IF EXISTS provider_failed_at;
