-- Precheck Fase 4 (read-only). Aborta se algo impedir aplicação aditiva.
\set ON_ERROR_STOP on

DO $$
DECLARE v_count int;
BEGIN
  -- Fase 2 aplicada?
  IF to_regprocedure('public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'precheck: Fase 2 não aplicada (rpc_publish_communication_event_v2 ausente)';
  END IF;

  -- Duplicidades legadas que impediriam correlação inequívoca por
  -- (canal='whatsapp', provider_message_id).
  SELECT count(*) INTO v_count FROM (
    SELECT provider_message_id
      FROM public.comunicacao_outbox
     WHERE canal = 'whatsapp' AND provider_message_id IS NOT NULL
     GROUP BY provider_message_id
    HAVING count(*) > 1
  ) t;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'precheck: % provider_message_id duplicados em whatsapp — resolva antes de aplicar Fase 4', v_count;
  END IF;

  -- Fase 4 ainda NÃO deve ter sido aplicada (aplicação é aditiva idempotente,
  -- mas exigimos ambiente limpo para evitar drift).
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='comunicacao_provider_receipts'
  ) THEN
    RAISE EXCEPTION 'precheck: comunicacao_provider_receipts já existe — Fase 4 aparentemente aplicada';
  END IF;
  IF to_regprocedure('public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'precheck: rpc_record_whatsapp_delivery_status já existe';
  END IF;

  RAISE NOTICE 'precheck Fase 4 OK';
END$$;
