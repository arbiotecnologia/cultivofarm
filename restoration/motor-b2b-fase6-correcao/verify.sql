-- ==========================================================
-- FASE 6 — CORREÇÃO CONSOLIDADA · VERIFY (read-only)
-- Prova o ESTADO APLICADO. Para provar o estado restaurável, execute
-- restore.sql dentro de BEGIN; ... ROLLBACK; e reexecute este script.
-- ==========================================================
\echo == ambiente ==
SELECT marker, project_ref FROM public._fiscal_staging_marker;

\echo == C1/C2 grants da tabela (aplicado: authenticated e anon sem nada) ==
SELECT r.rolname,
       has_table_privilege(r.rolname,'public.commercial_payment_plans','select') AS sel,
       has_table_privilege(r.rolname,'public.commercial_payment_plans','insert') AS ins,
       has_table_privilege(r.rolname,'public.commercial_payment_plans','update') AS upd,
       has_table_privilege(r.rolname,'public.commercial_payment_plans','delete') AS del
FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role');

\echo == policies remanescentes (aplicado: nenhuma) ==
SELECT polname FROM pg_policy WHERE polrelid = 'public.commercial_payment_plans'::regclass;

\echo == C8 helpers internos (aplicado: authenticated/anon false) ==
SELECT f,
       has_function_privilege('anon', f, 'execute') AS anon_x,
       has_function_privilege('authenticated', f, 'execute') AS auth_x
FROM unnest(ARRAY[
  'public.fn_b2b_can_admin_plans(uuid)',
  'public.fn_b2b_plan_selectable(uuid, timestamptz)',
  'public.fn_b2b_plan_referenced(uuid)'
]) f;

\echo == RPC operacional de planos selecionaveis (aplicado: authenticated true, anon false) ==
SELECT has_function_privilege('anon','public.rpc_b2b_list_selectable_payment_plans()','execute') AS anon_x,
       has_function_privilege('authenticated','public.rpc_b2b_list_selectable_payment_plans()','execute') AS auth_x;

\echo == C9 guard declarativo por assinatura + checksums das 4 RPCs ==
SELECT tgname, tgrelid::regclass::text
FROM pg_trigger
WHERE tgname IN ('trg_b2b_plan_selectable_orders','trg_b2b_plan_selectable_terms');

SELECT p.oid::regprocedure::text AS assinatura, md5(pg_get_functiondef(p.oid)) AS checksum
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid::regprocedure::text IN (
    'simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)',
    'create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)',
    'convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean)',
    'respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)')
ORDER BY 1;

\echo == C13 integridade historica (planos, pedidos e terms preservados) ==
SELECT (SELECT count(*) FROM public.commercial_payment_plans) AS planos,
       (SELECT count(*) FROM public.partner_orders) AS pedidos,
       (SELECT count(*) FROM public.partner_order_payment_terms) AS terms,
       (SELECT count(*) FROM public.commercial_payment_plans WHERE is_default) AS defaults;

\echo == C11 residuais de probe (esperado zero) ==
SELECT (SELECT count(*) FROM public.commercial_payment_plans WHERE code LIKE 'PROBE-%') AS planos_probe,
       (SELECT count(*) FROM public.partner_orders WHERE observacoes LIKE 'PROBE-F6%') AS pedidos_probe;
