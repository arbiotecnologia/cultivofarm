-- Defensive guard: ensure no live function references legacy financial_audit_log columns.
-- Historical migration files are immutable in Lovable, but every active function body
-- has already been corrected by later CREATE OR REPLACE FUNCTION statements.
-- This block fails loudly if a regression is ever reintroduced.
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(proname, ', ')
    INTO v_bad
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND prosrc ILIKE '%financial_audit_log%'
     AND (
          prosrc ~* 'financial_audit_log\s*\([^)]*event_type'
       OR prosrc ~* 'financial_audit_log\s*\([^)]*\bdetails\b'
       OR prosrc ~* 'financial_audit_log\s*\([^)]*\buser_id\b'
       OR prosrc ~* 'financial_audit_log\s*\([^)]*\bpayload\b'
     );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'financial_audit_log legacy columns detected in: %', v_bad;
  END IF;
END $$;

COMMENT ON TABLE public.financial_audit_log IS
  'Official columns: id, entity_type, entity_id, action, old_data, new_data, performed_by, performed_at, reason. '
  'Forbidden legacy columns: event_type, details, user_id, payload.';