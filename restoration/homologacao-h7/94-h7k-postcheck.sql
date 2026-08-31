-- FASE H7k — Postcheck estrutural (read-only, idempotente).
\set ON_ERROR_STOP on
\pset pager off

SELECT 'H7K-01 constraints itens' AS check,
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL ('||count(*)||'/3)' END AS result
  FROM pg_constraint
 WHERE conrelid = 'public.fiscal_invoice_items'::regclass
   AND conname IN ('h7k_fii_quantity_positive','h7k_fii_values_non_negative','h7k_fii_commercial_unit_present')
   AND convalidated;

SELECT 'H7K-02 preflight versionado' AS check,
       CASE WHEN position('h7k-v1' in prosrc) > 0
             AND position('fn_fiscal_environment_gate_v1' in prosrc) > 0
             AND position('fn_fiscal_recipient_pendencies_row' in prosrc) > 0
             AND position('fn_fiscal_emitter_pendencies_row' in prosrc) > 0
            THEN 'PASS' ELSE 'FAIL' END AS result
  FROM pg_proc WHERE proname = 'rpc_fiscal_preflight_v1';

SELECT 'H7K-03 preflight security definer + search_path' AS check,
       CASE WHEN prosecdef AND array_to_string(proconfig,',') LIKE '%search_path=public%'
            THEN 'PASS' ELSE 'FAIL' END AS result
  FROM pg_proc WHERE proname = 'rpc_fiscal_preflight_v1';

SELECT 'H7K-04 preflight sem EXECUTE para anon' AS check,
       CASE WHEN has_function_privilege('anon', oid, 'EXECUTE') THEN 'FAIL' ELSE 'PASS' END AS result
  FROM pg_proc WHERE proname = 'rpc_fiscal_preflight_v1';

SELECT 'H7K-05 marcador de ambiente sem EXECUTE publico' AS check,
       CASE WHEN bool_or(has_function_privilege('authenticated', oid, 'EXECUTE'))
             OR bool_or(has_function_privilege('anon', oid, 'EXECUTE'))
            THEN 'FAIL' ELSE 'PASS' END AS result
  FROM pg_proc WHERE proname = 'fn_fiscal_assert_staging_marker';

SELECT 'H7K-06 producao fiscal bloqueada' AS check,
       CASE WHEN environment_label = 'STAGING' AND production_emission_allowed = false
            THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.fiscal_environment_marker;

SELECT 'H7K-07 emitente em homologacao (tpAmb=2)' AS check,
       CASE WHEN coalesce(nfe_environment_code,'') = '2' THEN 'PASS' ELSE 'FAIL' END AS result
  FROM public.company_fiscal_settings WHERE is_active LIMIT 1;

SELECT 'H7K-08 buckets fiscais privados' AS check,
       CASE WHEN count(*) FILTER (WHERE public) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
  FROM storage.buckets WHERE id LIKE 'fiscal%';
