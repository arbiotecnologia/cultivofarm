-- FASE H7f — Rollback do transporte SEFAZ-MG homologação.
-- Aborta se existir qualquer transmissão registrada (evidência de homologação).
BEGIN;

DO $$
DECLARE v_n bigint;
BEGIN
  IF to_regclass('public.fiscal_sefaz_transmissions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.fiscal_sefaz_transmissions' INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'H7F ROLLBACK ABORT: % transmissoes registradas', v_n;
    END IF;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.rpc_fiscal_sefaz_transmission_status_v1(uuid);
DROP FUNCTION IF EXISTS public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb);
DROP FUNCTION IF EXISTS public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid);
DROP TRIGGER  IF EXISTS trg_fiscal_sefaz_tx_guard ON public.fiscal_sefaz_transmissions;
DROP FUNCTION IF EXISTS public.fn_fiscal_sefaz_tx_guard();
DROP TABLE    IF EXISTS public.fiscal_sefaz_transmissions;

COMMIT;
