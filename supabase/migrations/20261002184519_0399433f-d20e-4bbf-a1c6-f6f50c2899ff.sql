DO $validation$
DECLARE
  v_fn text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'platform_change_subscription'
     AND pg_get_function_identity_arguments(p.oid) = '_organization_id uuid, _plan_key text, _status text, _reason text';

  IF v_fn IS NULL
     OR v_fn LIKE '%SECURITY DEFINER%'
     OR v_fn NOT LIKE '%SET search_path TO %'
     OR v_fn NOT LIKE '%v_status public.saas_subscription_status%'
     OR v_fn NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'd51_subscription_rpc_contract_invalid';
  END IF;

  IF has_function_privilege('anon', 'public.platform_change_subscription(uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('public', 'public.platform_change_subscription(uuid,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.platform_change_subscription(uuid,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'd51_subscription_rpc_acl_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'organization_subscriptions'
       AND policyname = 'Superadmin lê assinaturas'
       AND cmd = 'SELECT'
       AND roles = ARRAY['authenticated']::name[]
       AND qual LIKE '%is_platform_superadmin%'
  ) THEN
    RAISE EXCEPTION 'd51_subscription_superadmin_select_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'organization_subscription_history'
       AND policyname = 'Superadmin lê histórico de assinaturas'
       AND cmd = 'SELECT'
       AND roles = ARRAY['authenticated']::name[]
       AND qual LIKE '%is_platform_superadmin%'
  ) THEN
    RAISE EXCEPTION 'd51_subscription_history_superadmin_select_missing';
  END IF;
END
$validation$;