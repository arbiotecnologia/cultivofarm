-- =============================================================================
-- FASE H7g — Rollback do endurecimento de vínculo e do motor de eventos SEFAZ.
--
-- Escopo: remove APENAS o que a Fase H7g acrescentou (RPCs de evento, trigger
-- de vínculo, view de estado e colunas auxiliares). Não remove o transporte
-- H7f nem toca em `fiscal_events` com histórico registrado — dado fiscal é
-- append-only e não é apagado por rollback.
-- =============================================================================
BEGIN;

DO $$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM public.fiscal_events
   WHERE sefaz_event_code IS NOT NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'H7G ROLLBACK ABORT: % eventos SEFAZ registrados', v_n;
  END IF;

  IF to_regclass('public.fiscal_sefaz_transmissions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.fiscal_sefaz_transmissions
              WHERE fiscal_event_id IS NOT NULL' INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'H7G ROLLBACK ABORT: % transmissoes de evento registradas', v_n;
    END IF;
  END IF;
END $$;

-- Motor de eventos SEFAZ (H7G-002)
DROP FUNCTION IF EXISTS public.rpc_fiscal_event_sefaz_reconcile_v1(uuid,uuid,text,text,text,timestamptz);
DROP FUNCTION IF EXISTS public.rpc_fiscal_event_sefaz_mark_signed_v1(uuid,text,text,uuid);
DROP FUNCTION IF EXISTS public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid);
DROP VIEW     IF EXISTS public.v_fiscal_sefaz_event_state;

ALTER TABLE public.fiscal_events
  DROP COLUMN IF EXISTS sefaz_event_code,
  DROP COLUMN IF EXISTS sefaz_seq_evento,
  DROP COLUMN IF EXISTS sefaz_access_key,
  DROP COLUMN IF EXISTS sefaz_reason,
  DROP COLUMN IF EXISTS signed_xml_path,
  DROP COLUMN IF EXISTS signed_xml_sha256,
  DROP COLUMN IF EXISTS sefaz_c_stat,
  DROP COLUMN IF EXISTS sefaz_n_prot;

-- Vínculo canônico (H7G-001) e semântica de resultado (H7G-004)
DROP TRIGGER  IF EXISTS trg_fiscal_sefaz_tx_link_guard ON public.fiscal_sefaz_transmissions;
DROP FUNCTION IF EXISTS public.fn_fiscal_sefaz_tx_link_guard();

ALTER TABLE public.fiscal_sefaz_transmissions
  DROP CONSTRAINT IF EXISTS chk_fiscal_sefaz_tx_outcome,
  DROP COLUMN IF EXISTS outcome,
  DROP COLUMN IF EXISTS fiscal_event_id;

-- Assinatura anterior (H7f) da RPC de abertura, sem `_event_id`.
DROP FUNCTION IF EXISTS public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid,uuid);

COMMIT;
