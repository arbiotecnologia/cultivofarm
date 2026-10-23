-- READ ONLY block; embed in PRE/candidate/POST/rollback. No ACL mutation.
-- Canonical Supabase ref swzpzcwiasxmjutrmvkm must be checked by the operator.
DO $$
DECLARE target regprocedure := 'public.fn_b2b_order_billing_eligibility(uuid)'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=target AND prosecdef
    AND pg_get_userbyid(proowner)='postgres'
    AND md5(pg_get_functiondef(oid))='db977875e15ea49ce10fb3e5388d7dfb'
    AND proacl::text='{postgres=X/postgres,service_role=X/postgres}')
    OR has_function_privilege('authenticated',target,'EXECUTE')
    OR has_function_privilege('anon',target,'EXECUTE')
    OR NOT has_function_privilege('service_role',target,'EXECUTE') THEN
    RAISE EXCEPTION 'billing_eligibility_internal_acl_or_body_drift';
  END IF;
  -- Exact direct textual SQL call graph currently captured from all schemas.
  IF (SELECT array_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
    ORDER BY n.nspname,p.proname,p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prokind='f' AND p.prosrc ILIKE '%fn_b2b_order_billing_eligibility%')
    IS DISTINCT FROM ARRAY['public.generate_b2b_receivable_secure_impl(p_partner_order_id uuid)']::text[] THEN
    RAISE EXCEPTION 'billing_eligibility_call_graph_drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc
    WHERE oid='public.generate_b2b_receivable_secure_impl(uuid)'::regprocedure
      AND prosecdef AND pg_get_userbyid(proowner)='postgres') THEN
    RAISE EXCEPTION 'billing_eligibility_internal_caller_owner_drift';
  END IF;
END $$;