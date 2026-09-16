-- Testes SQL do motor de reducao da base de calculo.
-- Executar com: psql -v ON_ERROR_STOP=1 -f test_base_reduction.sql
-- Tudo roda dentro de uma transacao revertida ao final: nao grava dados.
BEGIN;

CREATE TEMP TABLE t_result(nome text, ok boolean, detalhe text);

CREATE OR REPLACE FUNCTION pg_temp.mk_rule(_mode text, _pct numeric, _rate numeric)
RETURNS public.fiscal_tax_rules LANGUAGE plpgsql AS $$
DECLARE r public.fiscal_tax_rules;
BEGIN
  r.id := gen_random_uuid(); r.rule_key := 'TST-'||_mode; r.version := 1;
  r.tax_kind := 'ICMS'; r.calc_mode := 'PERCENT'; r.crt := '3'; r.cst := '20';
  r.rate := _rate; r.base_reduction_pct := _pct; r.base_reduction_mode := _mode;
  r.priority := 1; r.valid_from := current_date; r.status := 'PUBLISHED';
  r.credit_own_icms := true; r.base_components := '["PRODUTO"]'::jsonb;
  r.created_at := now(); r.updated_at := now();
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.chk(_nome text, _cond boolean, _detalhe text DEFAULT '')
RETURNS void LANGUAGE sql AS $$ INSERT INTO t_result VALUES (_nome, _cond, _detalhe) $$;

DO $$
DECLARE ctx jsonb := jsonb_build_object('produto', 10000); res jsonb; erro text;
BEGIN
  -- Fixture obrigatoria: 10000 / 60% / 18% => base 4000, tributo 720
  res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('FIXED', 60, 18), ctx);
  PERFORM pg_temp.chk('FIXED 60% base 4000',  (res->>'base')::numeric = 4000, res->>'base');
  PERFORM pg_temp.chk('FIXED 60% valor 720',  (res->>'value')::numeric = 720, res->>'value');
  PERFORM pg_temp.chk('FIXED baseOriginal',   (res->>'baseOriginal')::numeric = 10000, res->>'baseOriginal');
  PERFORM pg_temp.chk('FIXED source',         res->>'baseReductionSource' = 'FIXED', res->>'baseReductionSource');

  -- NONE: sem reducao
  res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('NONE', NULL, 18), ctx);
  PERFORM pg_temp.chk('NONE base 10000', (res->>'base')::numeric = 10000, res->>'base');
  PERFORM pg_temp.chk('NONE valor 1800', (res->>'value')::numeric = 1800, res->>'value');
  PERFORM pg_temp.chk('NONE pct 0',      (res->>'baseReductionPct')::numeric = 0, res->>'baseReductionPct');

  -- MANUAL 0 / 25 / 60 / 100
  res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('MANUAL', NULL, 18), ctx || jsonb_build_object('manualBaseReductionPct','0'));
  PERFORM pg_temp.chk('MANUAL 0% valor 1800', (res->>'value')::numeric = 1800, res->>'value');
  res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('MANUAL', NULL, 18), ctx || jsonb_build_object('manualBaseReductionPct','25'));
  PERFORM pg_temp.chk('MANUAL 25% base 7500', (res->>'base')::numeric = 7500, res->>'base');
  PERFORM pg_temp.chk('MANUAL 25% valor 1350',(res->>'value')::numeric = 1350, res->>'value');
  res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('MANUAL', NULL, 18), ctx || jsonb_build_object('manualBaseReductionPct','60','manualBy','u1','manualAt','2026-01-01T00:00:00Z'));
  PERFORM pg_temp.chk('MANUAL 60% valor 720', (res->>'value')::numeric = 720, res->>'value');
  PERFORM pg_temp.chk('MANUAL autoria',       res->>'baseReductionAppliedBy' = 'u1', res->>'baseReductionAppliedBy');
  PERFORM pg_temp.chk('MANUAL source',        res->>'baseReductionSource' = 'MANUAL', res->>'baseReductionSource');
  res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('MANUAL', NULL, 18), ctx || jsonb_build_object('manualBaseReductionPct','100'));
  PERFORM pg_temp.chk('MANUAL 100% valor 0',  (res->>'value')::numeric = 0, res->>'value');

  -- Arredondamento HALF_UP 2 casas: 10000 * (1-33.333/100) = 6666.70 ; 6666.70*18% = 1200.01
  res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('MANUAL', NULL, 18), ctx || jsonb_build_object('manualBaseReductionPct','33.333'));
  PERFORM pg_temp.chk('MANUAL arredondamento', (res->>'base')::numeric = 6666.70, res->>'base');

  -- Limites bloqueados
  BEGIN
    res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('MANUAL', NULL, 18), ctx || jsonb_build_object('manualBaseReductionPct','-1'));
    PERFORM pg_temp.chk('MANUAL -1% bloqueado', false, 'nao lancou excecao');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
    PERFORM pg_temp.chk('MANUAL -1% bloqueado', erro LIKE 'FISCAL_BASE_REDUCTION_OUT_OF_RANGE%', erro);
  END;
  BEGIN
    res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('MANUAL', NULL, 18), ctx || jsonb_build_object('manualBaseReductionPct','100.01'));
    PERFORM pg_temp.chk('MANUAL 100.01% bloqueado', false, 'nao lancou excecao');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
    PERFORM pg_temp.chk('MANUAL 100.01% bloqueado', erro LIKE 'FISCAL_BASE_REDUCTION_OUT_OF_RANGE%', erro);
  END;
  BEGIN
    res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('MANUAL', NULL, 18), ctx);
    PERFORM pg_temp.chk('MANUAL sem percentual bloqueado', false, 'nao lancou excecao');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
    PERFORM pg_temp.chk('MANUAL sem percentual bloqueado', erro LIKE 'FISCAL_BASE_REDUCTION_INPUT_REQUIRED%', erro);
  END;
  BEGIN
    res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('FIXED', 60, 18), ctx || jsonb_build_object('manualBaseReductionPct','10'));
    PERFORM pg_temp.chk('FIXED nao aceita manual', false, 'nao lancou excecao');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
    PERFORM pg_temp.chk('FIXED nao aceita manual', erro LIKE 'FISCAL_BASE_REDUCTION_NOT_EDITABLE%', erro);
  END;
  BEGIN
    res := public.fn_fiscal_apply_tax_v2(pg_temp.mk_rule('NONE', NULL, 18), ctx || jsonb_build_object('manualBaseReductionPct','10'));
    PERFORM pg_temp.chk('NONE nao aceita manual', false, 'nao lancou excecao');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
    PERFORM pg_temp.chk('NONE nao aceita manual', erro LIKE 'FISCAL_BASE_REDUCTION_NOT_ALLOWED%', erro);
  END;
END $$;

-- Validador de entradas do operador
DO $$
BEGIN
  PERFORM pg_temp.chk('input valido', public.fn_fiscal_tax_input_valid('{"ICMS":{"baseReductionPct":60}}'::jsonb));
  PERFORM pg_temp.chk('input vazio valido', public.fn_fiscal_tax_input_valid('{}'::jsonb));
  PERFORM pg_temp.chk('input tributo desconhecido rejeitado', NOT public.fn_fiscal_tax_input_valid('{"XPTO":{"baseReductionPct":10}}'::jsonb));
  PERFORM pg_temp.chk('input chave calculada rejeitada', NOT public.fn_fiscal_tax_input_valid('{"ICMS":{"vBC":4000}}'::jsonb));
  PERFORM pg_temp.chk('input chave extra rejeitada', NOT public.fn_fiscal_tax_input_valid('{"ICMS":{"baseReductionPct":10,"vICMS":1}}'::jsonb));
  PERFORM pg_temp.chk('input fora de faixa rejeitado', NOT public.fn_fiscal_tax_input_valid('{"ICMS":{"baseReductionPct":101}}'::jsonb));
  PERFORM pg_temp.chk('input negativo rejeitado', NOT public.fn_fiscal_tax_input_valid('{"ICMS":{"baseReductionPct":-1}}'::jsonb));
  PERFORM pg_temp.chk('input texto rejeitado', NOT public.fn_fiscal_tax_input_valid('{"ICMS":{"baseReductionPct":"60"}}'::jsonb));
  PERFORM pg_temp.chk('input array rejeitado', NOT public.fn_fiscal_tax_input_valid('[]'::jsonb));
END $$;

-- Constraint de coerencia da regra
DO $$
DECLARE erro text;
BEGIN
  BEGIN
    INSERT INTO public.fiscal_tax_rules (rule_key, version, tax_kind, calc_mode, base_components, priority, valid_from, status, base_reduction_mode, base_reduction_pct, rate, crt, cst)
    VALUES ('TST-INVALID', 1, 'ICMS', 'PERCENT', '["PRODUTO"]'::jsonb, 1, current_date, 'DRAFT', 'MANUAL', 60, 18, '3', '20');
    PERFORM pg_temp.chk('MANUAL com pct fixo rejeitado', false, 'insert aceito');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
    PERFORM pg_temp.chk('MANUAL com pct fixo rejeitado', erro LIKE '%ftr_base_reduction_mode_coherent%', erro);
  END;
  BEGIN
    INSERT INTO public.fiscal_tax_rules (rule_key, version, tax_kind, calc_mode, base_components, priority, valid_from, status, base_reduction_mode, base_reduction_pct, rate, crt, cst)
    VALUES ('TST-INVALID2', 1, 'ICMS', 'PERCENT', '["PRODUTO"]'::jsonb, 1, current_date, 'DRAFT', 'ABC', NULL, 18, '3', '20');
    PERFORM pg_temp.chk('modo desconhecido rejeitado', false, 'insert aceito');
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS erro = MESSAGE_TEXT;
    PERFORM pg_temp.chk('modo desconhecido rejeitado', erro LIKE '%ftr_base_reduction_mode_%', erro);
  END;
END $$;

SELECT nome, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, detalhe FROM t_result ORDER BY ok, nome;
SELECT count(*) FILTER (WHERE ok) AS passou, count(*) FILTER (WHERE NOT ok) AS falhou FROM t_result;

ROLLBACK;
