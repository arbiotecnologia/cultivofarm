-- =====================================================================
-- FASE 1 (correcao consolidada final) — PRECHECK
-- Somente staging ikaauvsflpmamgxmkhoq. Producao recusada.
-- Read-only: nao altera nenhum dado.
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

DO $pre$
DECLARE v_missing text := '';
BEGIN
  IF to_regclass('public.commercial_price_rules') IS NULL THEN
    v_missing := v_missing || 'commercial_price_rules ';
  END IF;
  IF to_regclass('public.partner_order_items') IS NULL THEN
    v_missing := v_missing || 'partner_order_items ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='fn_resolve_b2b_cart') THEN
    v_missing := v_missing || 'fn_resolve_b2b_cart ';
  END IF;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'PRECHECK_FAIL: artefatos ausentes: %', v_missing;
  END IF;
  RAISE NOTICE 'PRECHECK OK — base da Fase 1 presente.';
END $pre$;

-- Inventario informativo (nenhuma alteracao)
SELECT 'pedidos_totais' AS metrica, count(*)::text AS valor FROM public.partner_orders
UNION ALL SELECT 'pedidos_aguardando_cotacao', count(*)::text FROM public.partner_orders WHERE status='aguardando_cotacao'
UNION ALL SELECT 'itens_pedido', count(*)::text FROM public.partner_order_items
UNION ALL SELECT 'regras_preco_ativas', count(*)::text FROM public.commercial_price_rules WHERE active
UNION ALL SELECT 'regras_preco_escopo_produtor', count(*)::text FROM public.commercial_price_rules WHERE buyer_scope='customer';
