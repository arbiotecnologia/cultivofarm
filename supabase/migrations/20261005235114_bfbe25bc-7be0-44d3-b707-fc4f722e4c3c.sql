BEGIN;

CREATE OR REPLACE FUNCTION public._saas_user_has_feature(_uid uuid, _feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH actor AS (
    SELECT p.organization_id
    FROM public.profiles p
    JOIN public.organizations org ON org.id = p.organization_id AND org.ativo IS TRUE
    WHERE p.user_id = _uid
      AND p.ativo IS TRUE
      AND p.organization_id IS NOT NULL
    LIMIT 1
  ), current_subscription AS (
    SELECT s.organization_id, s.plan_version_id
    FROM public.organization_subscriptions s
    JOIN actor a ON a.organization_id = s.organization_id
    WHERE s.plan_version_id IS NOT NULL
      AND (
        s.status = 'ACTIVE'
        OR (s.status = 'TRIAL' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at > now())
      )
    ORDER BY s.started_at DESC, s.id DESC
    LIMIT 1
  ), feature AS (
    SELECT f.id
    FROM public.saas_features f
    WHERE f.key = _feature_key AND f.active IS TRUE
    LIMIT 1
  ), base AS (
    SELECT vf.enabled
    FROM current_subscription s
    JOIN feature f ON true
    JOIN public.saas_plan_version_features vf
      ON vf.plan_version_id = s.plan_version_id
     AND vf.feature_id = f.id
  ), override AS (
    SELECT o.mode
    FROM current_subscription s
    JOIN feature f ON true
    JOIN public.organization_feature_overrides o
      ON o.organization_id = s.organization_id
     AND o.feature_id = f.id
    WHERE o.ended_at IS NULL
      AND o.starts_at <= now()
      AND (o.ends_at IS NULL OR o.ends_at > now())
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT 1
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM override WHERE mode = 'REVOKE') THEN false
    WHEN EXISTS (SELECT 1 FROM override WHERE mode = 'GRANT') THEN true
    ELSE COALESCE((SELECT enabled FROM base LIMIT 1), false)
  END
$$;
REVOKE ALL ON FUNCTION public._saas_user_has_feature(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._saas_user_has_feature(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS TABLE(module_key text, feature_key text, limit_value numeric, config jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH actor AS (
    SELECT p.organization_id
    FROM public.profiles p
    JOIN public.organizations org ON org.id = p.organization_id AND org.ativo IS TRUE
    WHERE p.user_id = auth.uid()
      AND p.ativo IS TRUE
      AND p.organization_id IS NOT NULL
    LIMIT 1
  ), current_subscription AS (
    SELECT s.organization_id, s.plan_version_id
    FROM public.organization_subscriptions s
    JOIN actor a ON a.organization_id = s.organization_id
    WHERE s.plan_version_id IS NOT NULL
      AND (
        s.status = 'ACTIVE'
        OR (s.status = 'TRIAL' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at > now())
      )
    ORDER BY s.started_at DESC, s.id DESC
    LIMIT 1
  ), candidates AS (
    SELECT f.id AS feature_id, f.module_id, f.key AS feature_key,
           vf.enabled AS base_enabled, vf.limit_value AS base_limit, vf.config AS base_config
    FROM current_subscription s
    JOIN public.saas_plan_version_features vf ON vf.plan_version_id = s.plan_version_id
    JOIN public.saas_features f ON f.id = vf.feature_id AND f.active IS TRUE
    UNION
    SELECT f.id, f.module_id, f.key, false, NULL::integer, NULL::jsonb
    FROM current_subscription s
    JOIN public.organization_feature_overrides o ON o.organization_id = s.organization_id
    JOIN public.saas_features f ON f.id = o.feature_id AND f.active IS TRUE
    WHERE o.ended_at IS NULL
      AND o.starts_at <= now()
      AND (o.ends_at IS NULL OR o.ends_at > now())
  ), effective AS (
    SELECT DISTINCT ON (c.feature_id)
      c.feature_id, c.module_id, c.feature_key,
      CASE
        WHEN o.mode = 'REVOKE' THEN false
        WHEN o.mode = 'GRANT' THEN true
        ELSE c.base_enabled
      END AS enabled,
      CASE
        WHEN o.mode = 'GRANT' THEN o.limit_value
        WHEN o.mode = 'REVOKE' THEN NULL::integer
        ELSE c.base_limit
      END AS effective_limit,
      c.base_config AS effective_config
    FROM candidates c
    CROSS JOIN current_subscription s
    LEFT JOIN LATERAL (
      SELECT x.mode, x.limit_value
      FROM public.organization_feature_overrides x
      WHERE x.organization_id = s.organization_id
        AND x.feature_id = c.feature_id
        AND x.ended_at IS NULL
        AND x.starts_at <= now()
        AND (x.ends_at IS NULL OR x.ends_at > now())
      ORDER BY x.created_at DESC, x.id DESC
      LIMIT 1
    ) o ON true
    ORDER BY c.feature_id
  )
  SELECT m.key::text, e.feature_key::text, e.effective_limit::numeric, e.effective_config
  FROM effective e
  JOIN public.saas_modules m ON m.id = e.module_id AND m.active IS TRUE
  WHERE e.enabled IS TRUE
  ORDER BY m.key, e.feature_key
$$;
REVOKE ALL ON FUNCTION public.get_my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_entitlement_context()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_status public.saas_subscription_status;
  v_version uuid;
  v_trial_end timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'saas_auth_required' USING ERRCODE='42501';
  END IF;
  IF public.is_platform_superadmin(v_uid) THEN
    RETURN 'platform_superadmin';
  END IF;
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  JOIN public.organizations org ON org.id=p.organization_id AND org.ativo IS TRUE
  WHERE p.user_id=v_uid AND p.ativo IS TRUE AND p.organization_id IS NOT NULL
  LIMIT 1;
  IF v_org IS NULL THEN RETURN 'no_context'; END IF;
  SELECT s.status, s.plan_version_id, s.trial_ends_at
    INTO v_status, v_version, v_trial_end
  FROM public.organization_subscriptions s
  WHERE s.organization_id=v_org
  ORDER BY s.started_at DESC, s.id DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN 'no_subscription'; END IF;
  IF v_version IS NULL THEN RETURN 'legacy_unversioned'; END IF;
  IF v_status='ACTIVE' THEN RETURN 'active'; END IF;
  IF v_status='TRIAL' AND v_trial_end IS NOT NULL AND v_trial_end>now() THEN RETURN 'trial_active'; END IF;
  IF v_status='TRIAL' THEN RETURN 'trial_expired'; END IF;
  RETURN 'blocked_status';
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_entitlement_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlement_context() TO authenticated;

COMMIT;