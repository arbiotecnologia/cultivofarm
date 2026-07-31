-- HOMOLOGAÇÃO B2B — CLEANUP FINAL IDEMPOTENTE (NÃO EXECUTAR NESTA RODADA)
-- Ambiente: SOMENTE staging ikaauvsflpmamgxmkhoq. Produção proibida.
-- Objetivo: remover toda a massa HML-B2B (planos, assignments, preços, políticas,
-- perfis fiscais sintéticos e registro de fixtures) quando a homologação for encerrada.
-- Pré-requisito: nenhum pedido/recebível transacional HML-B2B em aberto
-- (o harness supabase/functions/hml-b2b-runtime-harness já os remove ao final de cada execução).
\set ON_ERROR_STOP on

DO $cleanup$
DECLARE
  v_ref text;
  v_plans uuid[];
  v_open int;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente nao autorizado (%)', COALESCE(v_ref,'null');
  END IF;

  SELECT array_agg(id) INTO v_plans FROM public.commercial_payment_plans WHERE code LIKE 'HML-B2B-%';

  SELECT count(*) INTO v_open FROM public.partner_orders WHERE observacoes LIKE 'HML-B2B-%';
  IF v_open > 0 THEN
    RAISE EXCEPTION 'CLEANUP_ABORT: existem % pedidos HML-B2B transacionais; rode o harness antes', v_open;
  END IF;

  IF v_plans IS NOT NULL THEN
    DELETE FROM public.commercial_price_rules WHERE plan_id = ANY(v_plans);
    DELETE FROM public.commercial_condition_item_prices WHERE plan_id = ANY(v_plans);
    DELETE FROM public.commercial_payment_plan_assignments WHERE plan_id = ANY(v_plans);
    DELETE FROM public.commercial_payment_plans WHERE id = ANY(v_plans);
  END IF;

  -- perfis fiscais sinteticos criados exclusivamente para o adapter mock
  DELETE FROM public.product_fiscal_profiles
   WHERE accounting_notes LIKE 'HML-B2B:%';

  -- politica fiscal sintetica de homologacao (se marcada como tal)
  DELETE FROM public.fiscal_operation_policies
   WHERE notes LIKE 'HML-B2B%';

  -- infraestrutura staging-only do mock
  DROP FUNCTION IF EXISTS public.rpc_hml_fiscal_emit_mock(uuid);
  DROP TABLE IF EXISTS public.hml_b2b_e2e_evidence;

  UPDATE public.hml_fixture_registry SET classification = 'CLEANED' WHERE cleanup_group = 'HML-B2B';

  RAISE NOTICE 'CLEANUP_OK: massa HML-B2B removida em staging.';
END $cleanup$;
