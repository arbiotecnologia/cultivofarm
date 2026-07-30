-- ==========================================================
-- FASE 6 — VERIFY (read-only) — staging ikaauvsflpmamgxmkhoq
-- ==========================================================
\echo == ambiente ==
SELECT marker, project_ref FROM public._fiscal_staging_marker;

\echo == colunas de versionamento ==
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='commercial_payment_plans'
  AND column_name IN ('version','root_plan_id','superseded_by_id','valid_from','valid_until','is_default','version_reason','updated_by')
ORDER BY 1;

\echo == constraints e indices ==
SELECT conname FROM pg_constraint WHERE conrelid='public.commercial_payment_plans'::regclass
  AND conname IN ('cpp_validity_window_chk','cpp_nonnegative_chk');
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='commercial_payment_plans'
  AND indexname IN ('uq_cpp_single_default','idx_cpp_root_version','idx_cpp_validity');

\echo == trigger de imutabilidade ==
SELECT tgname FROM pg_trigger WHERE tgrelid='public.commercial_payment_plans'::regclass AND tgname='trg_cpp_guard_financial';

\echo == RPCs operacionais com validacao de vigencia ==
SELECT p.proname, position('fn_b2b_plan_selectable' IN pg_get_functiondef(p.oid)) > 0 AS patched
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
  ('simulate_b2b_payment_plan_secure','create_partner_order_secure',
   'convert_partner_simulation_to_order_secure','respond_b2b_order_quote_secure');

\echo == grants (esperado: anon false em tudo; authenticated select-only) ==
SELECT r.rolname,
       has_table_privilege(r.rolname,'public.commercial_payment_plans','select') AS sel,
       has_table_privilege(r.rolname,'public.commercial_payment_plans','insert') AS ins,
       has_table_privilege(r.rolname,'public.commercial_payment_plans','update') AS upd,
       has_table_privilege(r.rolname,'public.commercial_payment_plans','delete') AS del
FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role');

\echo == execute nas RPCs administrativas (anon deve ser false) ==
SELECT f,
       has_function_privilege('anon', f, 'execute') AS anon_exec,
       has_function_privilege('authenticated', f, 'execute') AS auth_exec
FROM unnest(ARRAY[
  'public.rpc_admin_list_commercial_plans(text, text, integer, integer)',
  'public.rpc_admin_create_commercial_plan(jsonb)',
  'public.rpc_admin_version_commercial_plan(uuid, jsonb, text)',
  'public.rpc_admin_update_commercial_plan_metadata(uuid, text, text, integer)',
  'public.rpc_admin_set_commercial_plan_active(uuid, boolean, text)',
  'public.rpc_admin_set_default_commercial_plan(uuid)',
  'public.rpc_admin_reorder_commercial_plans(jsonb)'
]) f;

\echo == unicidade do plano padrao ==
SELECT count(*) AS defaults FROM public.commercial_payment_plans WHERE is_default;
