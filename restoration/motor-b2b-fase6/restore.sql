-- ==========================================================
-- FASE 6 — ROLLBACK (staging ikaauvsflpmamgxmkhoq)
-- Reverte a administração segura dos planos comerciais B2B.
-- NÃO remove dados legítimos de planos, pedidos ou snapshots.
-- Execute em transação única: psql --single-transaction -f restore.sql
-- ==========================================================
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public._fiscal_staging_marker
    WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq'
  ) THEN
    RAISE EXCEPTION 'ABORT: ambiente nao e o staging autorizado';
  END IF;
END
$guard$;

-- 1) Remove a validação de vigência injetada nas RPCs operacionais
DO $unpatch$
DECLARE r record; d text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('simulate_b2b_payment_plan_secure','create_partner_order_secure',
                        'convert_partner_simulation_to_order_secure','respond_b2b_order_quote_secure')
  LOOP
    d := pg_get_functiondef(r.oid);
    IF position('fn_b2b_plan_selectable' IN d) > 0 THEN
      d := replace(d,
        ' IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION ''plan_not_selectable''; END IF;',
        '');
      EXECUTE d;
    END IF;
  END LOOP;
END
$unpatch$;

-- 2) Triggers e funções administrativas
DROP TRIGGER IF EXISTS trg_cpp_guard_financial ON public.commercial_payment_plans;
DROP FUNCTION IF EXISTS public.tg_cpp_guard_financial_immutability();
DROP FUNCTION IF EXISTS public.rpc_admin_reorder_commercial_plans(jsonb);
DROP FUNCTION IF EXISTS public.rpc_admin_set_default_commercial_plan(uuid);
DROP FUNCTION IF EXISTS public.rpc_admin_set_commercial_plan_active(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.rpc_admin_update_commercial_plan_metadata(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.rpc_admin_version_commercial_plan(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.rpc_admin_create_commercial_plan(jsonb);
DROP FUNCTION IF EXISTS public.rpc_admin_list_commercial_plans(text, text, integer, integer);
DROP FUNCTION IF EXISTS public._cpp_audit(text, uuid, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public._cpp_validate_payload(jsonb);
DROP FUNCTION IF EXISTS public.fn_b2b_plan_referenced(uuid);
DROP FUNCTION IF EXISTS public.fn_b2b_plan_selectable(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.fn_b2b_can_admin_plans(uuid);

-- 3) Índices e constraints adicionados
DROP INDEX IF EXISTS public.uq_cpp_single_default;
DROP INDEX IF EXISTS public.idx_cpp_root_version;
DROP INDEX IF EXISTS public.idx_cpp_validity;
ALTER TABLE public.commercial_payment_plans DROP CONSTRAINT IF EXISTS cpp_validity_window_chk;
ALTER TABLE public.commercial_payment_plans DROP CONSTRAINT IF EXISTS cpp_nonnegative_chk;

-- 4) Colunas de versionamento (opcional — comente para preservar histórico)
ALTER TABLE public.commercial_payment_plans
  DROP COLUMN IF EXISTS version_reason,
  DROP COLUMN IF EXISTS is_default,
  DROP COLUMN IF EXISTS valid_until,
  DROP COLUMN IF EXISTS valid_from,
  DROP COLUMN IF EXISTS superseded_by_id,
  DROP COLUMN IF EXISTS root_plan_id,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS updated_by;

-- 5) Grants anteriores da tabela
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_payment_plans TO authenticated;
GRANT ALL ON public.commercial_payment_plans TO service_role;
