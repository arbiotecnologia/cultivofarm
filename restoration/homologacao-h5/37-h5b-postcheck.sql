-- =====================================================================
-- H5b — POSTCHECK ESTÁTICO (staging ikaauvsflpmamgxmkhoq)
-- Verifica as três correções: H5-B01 (lock na geração de OS),
-- H5-B02 (FOR UPDATE no envase) e H5-B03 (imutabilidade do CQ).
-- Somente leitura. Falha em qualquer item aborta com FAIL.
-- =====================================================================
\set ON_ERROR_STOP on

DO $post$
DECLARE
  v_fail int := 0;
  v_pass int := 0;
  v_src  text;
  v_ok   boolean;

  PROCEDURE_NOOP boolean;
BEGIN
  -- H5-B01
  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc
   WHERE proname = 'generate_production_orders_from_partner' LIMIT 1;
  v_ok := v_src ILIKE '%pg_advisory_xact_lock%'
      AND v_src ILIKE '%generate_production_orders_from_partner:%';
  IF v_ok THEN v_pass := v_pass+1; RAISE NOTICE 'PASS H5-B01 lock serializa geração de OS';
  ELSE v_fail := v_fail+1; RAISE WARNING 'FAIL H5-B01 advisory lock ausente'; END IF;

  v_ok := (SELECT p.proconfig::text ILIKE '%search_path%' FROM pg_proc p
            WHERE p.proname='generate_production_orders_from_partner' LIMIT 1);
  IF v_ok THEN v_pass := v_pass+1; RAISE NOTICE 'PASS H5-B01 search_path fixado';
  ELSE v_fail := v_fail+1; RAISE WARNING 'FAIL H5-B01 search_path ausente'; END IF;

  -- H5-B02
  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc
   WHERE proname = 'fn_validate_envase_volume' LIMIT 1;
  v_ok := v_src ILIKE '%FOR UPDATE%' AND v_src ILIKE '%FROM public.lotes%';
  IF v_ok THEN v_pass := v_pass+1; RAISE NOTICE 'PASS H5-B02 FOR UPDATE no lote antes da checagem de volume';
  ELSE v_fail := v_fail+1; RAISE WARNING 'FAIL H5-B02 sem FOR UPDATE'; END IF;

  v_ok := EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc  p ON p.oid = t.tgfoid
     WHERE c.relname='envase' AND p.proname='fn_validate_envase_volume' AND NOT t.tgisinternal);
  IF v_ok THEN v_pass := v_pass+1; RAISE NOTICE 'PASS H5-B02 gatilho ativo em envase';
  ELSE v_fail := v_fail+1; RAISE WARNING 'FAIL H5-B02 gatilho ausente em envase'; END IF;

  -- H5-B03
  v_ok := EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_proc  p ON p.oid = t.tgfoid
     WHERE c.relname='controle_qualidade' AND p.proname='fn_cq_resultado_imutavel'
       AND NOT t.tgisinternal);
  IF v_ok THEN v_pass := v_pass+1; RAISE NOTICE 'PASS H5-B03 gatilho de imutabilidade do CQ ativo';
  ELSE v_fail := v_fail+1; RAISE WARNING 'FAIL H5-B03 gatilho de CQ ausente'; END IF;

  SELECT pg_get_functiondef(oid) INTO v_src FROM pg_proc
   WHERE proname = 'fn_cq_resultado_imutavel' LIMIT 1;
  v_ok := v_src ILIKE '%app.cq_purge_fixture%' AND v_src ILIKE '%anon%';
  IF v_ok THEN v_pass := v_pass+1; RAISE NOTICE 'PASS H5-B03 bypass de manutenção fechado para anon/authenticated';
  ELSE v_fail := v_fail+1; RAISE WARNING 'FAIL H5-B03 bypass de manutenção não restrito'; END IF;

  -- Sem resíduos do harness
  v_ok := 0 = (SELECT count(*) FROM public.partner_orders WHERE observacoes LIKE 'H5B-%')
             + (SELECT count(*) FROM public.lotes WHERE codigo_lote LIKE 'H5B-%');
  IF v_ok THEN v_pass := v_pass+1; RAISE NOTICE 'PASS H5b sem resíduos de fixtures';
  ELSE v_fail := v_fail+1; RAISE WARNING 'FAIL H5b resíduos de fixtures presentes'; END IF;

  RAISE NOTICE 'H5B POSTCHECK: % PASS / % FAIL', v_pass, v_fail;
  IF v_fail > 0 THEN RAISE EXCEPTION 'FAIL_H5B_POSTCHECK'; END IF;
  RAISE NOTICE 'PASS_H5B_POSTCHECK';
END $post$;
