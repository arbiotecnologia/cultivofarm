-- =====================================================================
-- ROLLBACK FIEL DA FASE 1 — Motor Comercial Unificado (staging apenas)
-- =====================================================================
-- Reverte EXCLUSIVAMENTE os objetos criados/alterados pela Fase 1:
--   * DROP das funcoes novas de resolucao de preco e exposicao de credito
--   * DROP da tabela canonica public.commercial_price_rules (matriz nova,
--     sem dados operacionais historicos)
--   * Restauracao byte-a-byte de rpc_b2b_partner_credit e
--     tg_partner_orders_credit_guard a partir do snapshot da Fase 0.1
--     (public._motor_b2b_pre_phase1_snapshot), com assert de checksum.
--
-- NUNCA remove pedidos, itens, snapshots, parcelas, recebiveis ou
-- qualquer dado operacional.
-- =====================================================================

\set ON_ERROR_STOP on

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'STAGING_GUARD: marker ausente'; END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN RAISE EXCEPTION 'STAGING_GUARD: PRODUCAO recusada'; END IF;
  IF v_ref <> 'ikaauvsflpmamgxmkhoq' THEN RAISE EXCEPTION 'STAGING_GUARD: ref inesperado %', v_ref; END IF;
END $guard$;

BEGIN;

-- 1. Funcoes novas da Fase 1 -------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_resolve_commercial_prices(jsonb, uuid, date, jsonb);
DROP FUNCTION IF EXISTS public.fn_resolve_commercial_price(text, uuid, uuid, uuid, uuid, uuid, text, numeric, date);
DROP FUNCTION IF EXISTS public.rpc_b2b_credit_exposure(uuid, numeric, uuid);
DROP FUNCTION IF EXISTS public.fn_b2b_credit_exposure(uuid, numeric, uuid);

-- 2. Auditoria/trigger da matriz --------------------------------------------
DROP TRIGGER IF EXISTS trg_commercial_price_rules_audit ON public.commercial_price_rules;
DROP TRIGGER IF EXISTS trg_commercial_price_rules_touch ON public.commercial_price_rules;
DROP FUNCTION IF EXISTS public.tg_commercial_price_rules_audit();
DROP FUNCTION IF EXISTS public.tg_commercial_price_rules_touch();

-- 3. Matriz canonica (objeto novo da Fase 1, sem dado operacional) -----------
DROP TABLE IF EXISTS public.commercial_price_rules;

-- 4. Restauracao byte-a-byte das 2 funcoes alteradas -------------------------
DO $restore$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN
    SELECT proname, definition, checksum_md5
    FROM public._motor_b2b_pre_phase1_snapshot
    WHERE proname IN ('rpc_b2b_partner_credit','tg_partner_orders_credit_guard')
  LOOP
    EXECUTE r.definition;
    SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = r.proname
    LIMIT 1;
    IF v_md5 IS DISTINCT FROM r.checksum_md5 THEN
      RAISE EXCEPTION 'ROLLBACK_CHECKSUM_MISMATCH: % (esperado %, obtido %)',
        r.proname, r.checksum_md5, v_md5;
    END IF;
    RAISE NOTICE 'restaurada % (md5 %)', r.proname, v_md5;
  END LOOP;
END $restore$;

COMMIT;
