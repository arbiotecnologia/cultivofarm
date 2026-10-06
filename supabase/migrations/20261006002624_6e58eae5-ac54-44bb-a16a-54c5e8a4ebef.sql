BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_entitlement_context()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_status public.saas_subscription_status;
  v_version uuid;
  v_trial_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'saas_auth_required' USING ERRCODE = '42501';
  END IF;

  IF public.is_platform_superadmin(auth.uid()) THEN
    RETURN 'platform_superadmin';
  END IF;

  SELECT p.organization_id
    INTO v_org
  FROM public.profiles p
  JOIN public.organizations org
    ON org.id = p.organization_id
   AND org.ativo IS TRUE
  WHERE p.user_id = auth.uid()
    AND p.ativo IS TRUE
    AND p.organization_id IS NOT NULL
  LIMIT 1;

  IF v_org IS NULL THEN
    RETURN 'no_context';
  END IF;

  SELECT s.status, s.plan_version_id, s.trial_ends_at
    INTO v_status, v_version, v_trial_end
  FROM public.organization_subscriptions s
  WHERE s.organization_id = v_org
  ORDER BY s.started_at DESC, s.id DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN 'no_subscription'; END IF;
  IF v_version IS NULL THEN RETURN 'legacy_unversioned'; END IF;
  IF v_status = 'ACTIVE' THEN RETURN 'active'; END IF;
  IF v_status = 'TRIAL' AND v_trial_end IS NOT NULL AND v_trial_end > now() THEN RETURN 'trial_active'; END IF;
  IF v_status = 'TRIAL' THEN RETURN 'trial_expired'; END IF;
  RETURN 'blocked_status';
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_entitlement_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlement_context() TO authenticated;

COMMIT;