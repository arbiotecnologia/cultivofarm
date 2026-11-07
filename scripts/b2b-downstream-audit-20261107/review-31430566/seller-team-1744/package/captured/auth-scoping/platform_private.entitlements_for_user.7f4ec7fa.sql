CREATE OR REPLACE FUNCTION platform_private.entitlements_for_user(_uid uuid)
 RETURNS TABLE(module_key text, feature_key text, limit_value numeric, config jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH actor AS (
    SELECT p.organization_id
    FROM public.profiles p
    JOIN public.organizations org
      ON org.id = p.organization_id
     AND org.ativo IS TRUE
    WHERE p.user_id = _uid
      AND p.ativo IS TRUE
      AND p.organization_id IS NOT NULL
    ORDER BY p.created_at, p.organization_id
    LIMIT 1
  ), current_subscription AS (
    SELECT s.organization_id, s.plan_version_id
    FROM public.organization_subscriptions s
    JOIN actor a ON a.organization_id = s.organization_id
    JOIN public.saas_plan_versions v
      ON v.id = s.plan_version_id
     AND v.status = 'PUBLISHED'
     AND v.effective_from <= now()
     AND (v.effective_to IS NULL OR v.effective_to > now())
    WHERE s.plan_version_id IS NOT NULL
      AND (
        s.status = 'ACTIVE'
        OR (s.status = 'TRIAL' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at > now())
      )
      AND (s.cancel_at IS NULL OR s.cancel_at > now())
    ORDER BY s.started_at DESC, s.id DESC
    LIMIT 1
  ), candidates AS (
    SELECT f.id AS feature_id, f.module_id, f.key AS feature_key,
           vf.enabled AS base_enabled, vf.limit_value AS base_limit, vf.config AS base_config
    FROM current_subscription s
    JOIN public.saas_plan_version_features vf ON vf.plan_version_id = s.plan_version_id
    JOIN public.saas_features f ON f.id = vf.feature_id AND f.active IS TRUE
    UNION
    SELECT f.id, f.module_id, f.key, false, NULL::numeric, NULL::jsonb
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
        WHEN o.mode = 'REVOKE' THEN NULL::numeric
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
$function$

