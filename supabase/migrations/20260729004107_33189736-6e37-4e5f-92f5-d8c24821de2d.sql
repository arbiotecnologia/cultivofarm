DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente nao comprovado como staging (ref=%)', COALESCE(v_ref,'null');
  END IF;
END;
$guard$;

CREATE TABLE IF NOT EXISTS public._motor_b2b_pre_phase1_snapshot (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT now(),
  project_ref text NOT NULL,
  proname text NOT NULL,
  identity_args text NOT NULL,
  result_type text NOT NULL,
  owner_name text NOT NULL,
  security_definer boolean NOT NULL,
  proconfig text,
  acl text,
  obj_comment text,
  definition text NOT NULL,
  checksum_md5 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public._motor_b2b_pre_phase1_snapshot TO service_role;
GRANT SELECT ON public._motor_b2b_pre_phase1_snapshot TO authenticated;

ALTER TABLE public._motor_b2b_pre_phase1_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS motor_b2b_snapshot_admin_read ON public._motor_b2b_pre_phase1_snapshot;
CREATE POLICY motor_b2b_snapshot_admin_read
  ON public._motor_b2b_pre_phase1_snapshot
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

INSERT INTO public._motor_b2b_pre_phase1_snapshot (
  project_ref, proname, identity_args, result_type, owner_name,
  security_definer, proconfig, acl, obj_comment, definition, checksum_md5
)
SELECT
  'ikaauvsflpmamgxmkhoq',
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  pg_get_function_result(p.oid),
  pg_get_userbyid(p.proowner),
  p.prosecdef,
  array_to_string(p.proconfig, ','),
  array_to_string(p.proacl::text[], ' '),
  obj_description(p.oid, 'pg_proc'),
  pg_get_functiondef(p.oid),
  md5(pg_get_functiondef(p.oid))
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'simulate_b2b_payment_plan_secure',
    'create_partner_order_secure',
    'generate_b2b_receivable_secure',
    'convert_partner_simulation_to_order_secure',
    'approve_b2b_payment_terms_secure',
    'reject_b2b_payment_terms_secure',
    'request_b2b_payment_terms_adjustment_secure',
    'add_b2b_payment_terms_note_secure',
    'approve_b2b_credit',
    'rpc_b2b_partner_credit',
    'cancel_b2b_receivable_secure',
    'tg_partner_orders_credit_guard',
    'tg_auto_b2b_receivable',
    'tg_partner_orders_require_items',
    'archive_partner_simulation_secure',
    'audit_partner_order_payment_terms',
    'auto_reject_partner_orders_no_items'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public._motor_b2b_pre_phase1_snapshot s
    WHERE s.proname = p.proname
      AND s.identity_args = pg_get_function_identity_arguments(p.oid)
  );