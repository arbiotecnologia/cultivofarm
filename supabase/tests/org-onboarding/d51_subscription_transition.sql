-- D51.2 — harness transacional da alteração de assinatura.
-- Executar somente no canônico controlado; ROLLBACK obrigatório.
BEGIN;

DO $test$
DECLARE
  v_super uuid;
  v_tenant uuid;
  v_org uuid := gen_random_uuid();
  v_sub uuid;
  v_plan uuid;
  v_history_before bigint;
BEGIN
  SELECT ur.user_id INTO v_super
    FROM public.user_roles ur
   WHERE ur.role = 'superadmin'
   ORDER BY ur.user_id LIMIT 1;
  SELECT ur.user_id INTO v_tenant
    FROM public.user_roles ur
   WHERE ur.role <> 'superadmin'
     AND NOT public.is_platform_superadmin(ur.user_id)
   ORDER BY ur.user_id LIMIT 1;
  SELECT id INTO v_plan FROM public.saas_plans WHERE key = 'completo' AND active;
  IF v_super IS NULL OR v_tenant IS NULL OR v_plan IS NULL THEN
    RAISE EXCEPTION 'd51_fixture_prerequisite_missing';
  END IF;

  INSERT INTO public.organizations(id, nome, status, ativo)
  VALUES (v_org, 'FIXTURE D51 SUBSCRIPTION', 'rascunho', true);
  INSERT INTO public.organization_subscriptions(organization_id, plan_id, status, started_at, created_by)
  VALUES (v_org, v_plan, 'TRIAL', now(), v_super)
  RETURNING id INTO v_sub;

  SELECT count(*) INTO v_history_before
    FROM public.organization_subscription_history WHERE subscription_id = v_sub;

  PERFORM set_config('request.jwt.claim.sub', v_super::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  PERFORM public.platform_change_subscription(v_org, 'completo', 'SUSPENDED', 'contenção fixture D51');
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_subscriptions
     WHERE id = v_sub AND status = 'SUSPENDED' AND suspended_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'd51_trial_suspend_failed'; END IF;
  IF (SELECT count(*) FROM public.organization_subscription_history WHERE subscription_id = v_sub)
     <> v_history_before + 1 THEN
    RAISE EXCEPTION 'd51_suspend_history_not_once';
  END IF;

  PERFORM public.platform_change_subscription(v_org, 'completo', 'TRIAL', 'reversão fixture D51');
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_subscriptions
     WHERE id = v_sub AND status = 'TRIAL' AND suspended_at IS NULL
  ) THEN RAISE EXCEPTION 'd51_suspend_reverse_failed'; END IF;

  BEGIN
    PERFORM public.platform_change_subscription(v_org, 'completo', 'ACTIVE', 'x');
    RAISE EXCEPTION 'd51_short_reason_was_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'd51_short_reason_was_accepted' OR SQLERRM NOT LIKE 'platform_invalid:%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.platform_change_subscription(v_org, 'plano-inexistente', 'ACTIVE', 'plano inválido fixture');
    RAISE EXCEPTION 'd51_invalid_plan_was_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'd51_invalid_plan_was_accepted' OR SQLERRM NOT LIKE 'platform_invalid:%' THEN RAISE; END IF;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_tenant::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.platform_change_subscription(v_org, 'completo', 'ACTIVE', 'tenant deve ser negado');
    RAISE EXCEPTION 'd51_tenant_admin_was_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'd51_tenant_admin_was_accepted' OR SQLSTATE <> '42501' THEN RAISE; END IF;
  END;
END
$test$;

ROLLBACK;