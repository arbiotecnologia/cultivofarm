-- =====================================================================
-- MOTOR B2B — FASE 1 (INTEGRACAO AUTORITATIVA) — HARNESS DE RUNTIME
--
-- NAO E MIGRATION OPERACIONAL. Verificacao explicita.
-- Ambiente permitido : STAGING ikaauvsflpmamgxmkhoq
-- Ambiente PROIBIDO  : PRODUCAO navfzbwgwzruipouyfnk
--
-- Todas as fixtures (planos sinteticos, regras de preco, pedidos) vivem
-- dentro de uma subtransacao que SEMPRE sofre ROLLBACK. As evidencias
-- sao acumuladas em variavel jsonb (nao transacional) e persistidas
-- apenas depois do rollback, em public._motor_b2b_fase1_int_evidence.
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

CREATE TABLE IF NOT EXISTS public._motor_b2b_fase1_int_evidence (
  id bigserial PRIMARY KEY,
  test_code text NOT NULL,
  descricao text NOT NULL,
  esperado text NOT NULL,
  obtido text NOT NULL,
  passou boolean NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);
DELETE FROM public._motor_b2b_fase1_int_evidence;

DO $main$
DECLARE
  v_ev jsonb := '[]'::jsonb;
  v_partner uuid; v_prod uuid; v_lit numeric; v_dose numeric; v_dml numeric;
  v_plan_base uuid; v_disc numeric;
  v_plan_fix uuid := '0f13aaaa-0000-4000-8000-000000000001';
  v_plan_quo uuid := '0f13aaaa-0000-4000-8000-000000000002';
  v_rule uuid;
  v_r jsonb; v_cart jsonb; v_err text; v_bool boolean;
  t jsonb; v_fail int;
BEGIN
  SELECT id INTO v_partner FROM public.partner_accounts ORDER BY created_at LIMIT 1;
  SELECT id, valor_litro_brl, valor_dose_brl, dose_ml_ha
    INTO v_prod, v_lit, v_dose, v_dml
    FROM public.produtos pr
   WHERE pr.valor_litro_brl > 0 AND pr.valor_dose_brl > 0 AND pr.dose_ml_ha > 0
     AND NOT EXISTS (SELECT 1 FROM public.partner_product_prices ppp
                      WHERE ppp.partner_id = v_partner AND ppp.product_id = pr.id)
   ORDER BY pr.created_at LIMIT 1;
  SELECT id, discount_percent INTO v_plan_base, v_disc
    FROM public.commercial_payment_plans
   WHERE active AND discount_percent > 0 AND COALESCE(pricing_mode,'discount_from_base')='discount_from_base'
   ORDER BY sort_order LIMIT 1;

  IF v_partner IS NULL OR v_prod IS NULL OR v_plan_base IS NULL THEN
    RAISE EXCEPTION 'FIXTURE_BASE_AUSENTE (partner=% prod=% plan=%)', v_partner, v_prod, v_plan_base;
  END IF;

  BEGIN -- ============== SUBTRANSACAO (sempre revertida) ==============

    INSERT INTO public.commercial_payment_plans
      (id, name, code, plan_type, max_days, months_count, installment_count,
       discount_percent, monthly_interest_percent, active, sort_order, pricing_mode)
    VALUES
      (v_plan_fix,'HARNESS FIXO','HARNESS_FIX','custom',0,0,1,0,0,true,9990,'fixed_item_price'),
      (v_plan_quo,'HARNESS COTACAO','HARNESS_QUO','custom',0,0,1,0,0,true,9991,'quote_only');

    -- T1 quote_only => QUOTE_REQUIRED sem preco
    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan_quo, v_prod, NULL, 'hectare', NULL, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','T1','d','plano quote_only nao precifica',
      'e','ok=false|QUOTE_REQUIRED|quote_required=true|unit_price=null',
      'o', format('ok=%s|%s|quote_required=%s|unit_price=%s',
                  v_r->>'ok', COALESCE(v_r->>'reason_code','-'), v_r->>'quote_required', COALESCE(v_r->>'unit_price','null')),
      'p', (v_r->>'ok')::boolean IS FALSE AND v_r->>'reason_code'='QUOTE_REQUIRED'
           AND (v_r->>'quote_required')::boolean AND (v_r->>'unit_price') IS NULL));

    -- T2 fixed_item_price sem regra => PRICE_RULE_MISSING (sem fallback de catalogo)
    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan_fix, v_prod, NULL, 'hectare', NULL, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','T2','d','fixed_item_price sem regra nao cai no catalogo',
      'e','ok=false|PRICE_RULE_MISSING|unit_price=null',
      'o', format('ok=%s|%s|unit_price=%s', v_r->>'ok', COALESCE(v_r->>'reason_code','-'), COALESCE(v_r->>'unit_price','null')),
      'p', (v_r->>'ok')::boolean IS FALSE AND v_r->>'reason_code'='PRICE_RULE_MISSING'
           AND (v_r->>'unit_price') IS NULL));

    -- T3 fixed_item_price com regra => preco da regra
    INSERT INTO public.commercial_price_rules
      (buyer_scope, partner_id, plan_id, product_id, unit_type, pricing_mode, condition_price, valid_from, active, motivo)
    VALUES ('partner', v_partner, v_plan_fix, v_prod, 'hectare','fixed_item_price', 123.45, current_date, true, 'harness')
    RETURNING id INTO v_rule;

    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan_fix, v_prod, NULL, 'hectare', NULL, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','T3','d','fixed_item_price usa preco da regra e ignora catalogo',
      'e','ok=true|123.45|condition_fixed_price|rule='||v_rule::text,
      'o', format('ok=%s|%s|%s|rule=%s', v_r->>'ok', v_r->>'unit_price', COALESCE(v_r->>'price_source','-'), COALESCE(v_r->>'rule_id','-')),
      'p', (v_r->>'ok')::boolean AND (v_r->>'unit_price')::numeric = 123.45
           AND v_r->>'price_source'='condition_fixed_price' AND (v_r->>'rule_id')::uuid = v_rule));

    -- T4 discount_from_base preserva catalogo + desconto do plano
    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan_base, v_prod, NULL, 'hectare', NULL, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','T4','d','discount_from_base preserva precedencia legada (catalogo)',
      'e', round((v_dml/100.0*v_dose) * (1 - v_disc/100.0), 2)::text || '|catalog_base_price',
      'o', COALESCE(v_r->>'unit_price','null') || '|' || COALESCE(v_r->>'price_source','null'),
      'p', (v_r->>'ok')::boolean AND (v_r->>'unit_price')::numeric = round((v_dml/100.0*v_dose) * (1 - v_disc/100.0), 2)
           AND v_r->>'price_source'='catalog_base_price'));

    -- T5 carrinho agregado no modo fixo
    v_cart := public.fn_resolve_b2b_cart(v_partner, v_plan_fix,
      jsonb_build_array(jsonb_build_object('item_id', v_prod, 'item_tipo','produto','quantidade',2,'unidade_medida','hectare')),
      current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','T5','d','fn_resolve_b2b_cart agrega 2 x 123.45 = 246.90',
      'e','quote_required=false|246.90',
      'o', format('quote_required=%s|%s', v_cart->>'quote_required', v_cart->>'table_amount'),
      'p', (v_cart->>'quote_required')::boolean IS FALSE AND (v_cart->>'table_amount')::numeric = 246.90));

    -- T6 carrinho sinaliza cotacao obrigatoria
    v_cart := public.fn_resolve_b2b_cart(v_partner, v_plan_quo,
      jsonb_build_array(jsonb_build_object('item_id', v_prod, 'item_tipo','produto','quantidade',2,'unidade_medida','hectare')),
      current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','T6','d','carrinho em quote_only sinaliza quote_required',
      'e','quote_required=true',
      'o', format('quote_required=%s', v_cart->>'quote_required'),
      'p', (v_cart->>'quote_required')::boolean IS TRUE));

    -- T7 guarda de conflito regra x plano
    v_err := NULL;
    BEGIN
      INSERT INTO public.commercial_price_rules
        (buyer_scope, partner_id, plan_id, product_id, unit_type, pricing_mode, condition_price, valid_from, active, motivo)
      VALUES ('partner', v_partner, v_plan_quo, v_prod, 'litro','fixed_item_price', 10, current_date, true, 'harness-conflito');
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','T7','d','regra com pricing_mode divergente do plano e bloqueada',
      'e','PRICE_RULE_MODE_CONFLICT', 'o', COALESCE(v_err,'sem erro'),
      'p', COALESCE(v_err,'') LIKE '%PRICE_RULE_MODE_CONFLICT%'));

    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'HARNESS_ROLLBACK' THEN
      v_ev := v_ev || jsonb_build_array(jsonb_build_object(
        'c','FATAL','d','excecao inesperada na subtransacao','e','sem excecao','o',SQLERRM,'p',false));
    END IF;
  END;

  -- T8 objetos estruturais presentes (fora da subtransacao)
  v_ev := v_ev || jsonb_build_array(jsonb_build_object(
    'c','T8','d','generate_b2b_receivable_secure_impl existe',
    'e','1','o',(SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='generate_b2b_receivable_secure_impl'),
    'p',(SELECT count(*)=1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='generate_b2b_receivable_secure_impl')));

  -- T9 anon/authenticated sem acesso direto a matriz de precos
  v_ev := v_ev || jsonb_build_array(jsonb_build_object(
    'c','T9','d','anon sem SELECT em commercial_price_rules',
    'e','false','o', has_table_privilege('anon','public.commercial_price_rules','SELECT')::text,
    'p', NOT has_table_privilege('anon','public.commercial_price_rules','SELECT')));

  FOR t IN SELECT * FROM jsonb_array_elements(v_ev) LOOP
    INSERT INTO public._motor_b2b_fase1_int_evidence(test_code, descricao, esperado, obtido, passou)
    VALUES (t->>'c', t->>'d', t->>'e', t->>'o', (t->>'p')::boolean);
  END LOOP;

  SELECT count(*) INTO v_fail FROM public._motor_b2b_fase1_int_evidence WHERE NOT passou;
  RAISE NOTICE 'HARNESS FASE1-INTEGRACAO: % falhas', v_fail;
END $main$;

SELECT test_code, descricao, esperado, obtido, passou
  FROM public._motor_b2b_fase1_int_evidence ORDER BY id;
