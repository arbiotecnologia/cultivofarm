BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS TABLE(module_key text, feature_key text, limit_value numeric, config jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  WITH my_org AS (
    SELECT pr.organization_id
    FROM public.profiles pr
    JOIN public.organizations o ON o.id=pr.organization_id AND o.ativo
    WHERE pr.user_id=auth.uid() AND pr.ativo AND pr.organization_id IS NOT NULL
    ORDER BY pr.created_at LIMIT 1
  ),
  my_sub AS (
    SELECT s.plan_id FROM public.organization_subscriptions s
    WHERE s.organization_id=(SELECT organization_id FROM my_org)
      AND s.status IN ('TRIAL','ACTIVE','PAST_DUE')
      AND NOT (s.status='TRIAL' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at<=now())
      AND (s.cancel_at IS NULL OR s.cancel_at>now())
    ORDER BY s.started_at DESC LIMIT 1
  ),
  ov AS (
    SELECT x.feature_id,x.mode,x.limit_value FROM public.organization_feature_overrides x
    WHERE x.organization_id=(SELECT organization_id FROM my_org)
      AND x.ended_at IS NULL AND x.starts_at<=now() AND (x.ends_at IS NULL OR x.ends_at>now())
  ),
  base AS (
    SELECT pf.feature_id,pf.limit_value,pf.config FROM my_sub
    JOIN public.saas_plan_features pf ON pf.plan_id=my_sub.plan_id AND pf.enabled
  ),
  eff AS (
    SELECT b.feature_id,coalesce(o.limit_value,b.limit_value) limit_value,b.config
    FROM base b LEFT JOIN ov o ON o.feature_id=b.feature_id
    WHERE coalesce(o.mode,'GRANT')<>'REVOKE'
    UNION ALL
    SELECT o.feature_id,o.limit_value,NULL::jsonb FROM ov o
    WHERE o.mode='GRANT' AND EXISTS(SELECT 1 FROM my_sub)
      AND NOT EXISTS(SELECT 1 FROM base b WHERE b.feature_id=o.feature_id)
  )
  SELECT m.key,f.key,eff.limit_value,eff.config
  FROM eff JOIN public.saas_features f ON f.id=eff.feature_id AND f.active
  JOIN public.saas_modules m ON m.id=f.module_id AND m.active;
$$;
REVOKE ALL ON FUNCTION public.get_my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated;

CREATE OR REPLACE FUNCTION public._saas_user_has_feature(_uid uuid,_feature_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  WITH my_org AS (
    SELECT pr.organization_id FROM public.profiles pr
    JOIN public.organizations o ON o.id=pr.organization_id AND o.ativo
    WHERE pr.user_id=_uid AND pr.ativo AND pr.organization_id IS NOT NULL
    ORDER BY pr.created_at LIMIT 1
  ),
  my_sub AS (
    SELECT s.plan_id FROM public.organization_subscriptions s
    WHERE s.organization_id=(SELECT organization_id FROM my_org)
      AND s.status IN ('TRIAL','ACTIVE','PAST_DUE')
      AND NOT (s.status='TRIAL' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at<=now())
      AND (s.cancel_at IS NULL OR s.cancel_at>now())
    ORDER BY s.started_at DESC LIMIT 1
  ),
  feat AS (
    SELECT f.id FROM public.saas_features f JOIN public.saas_modules m ON m.id=f.module_id AND m.active
    WHERE f.key=_feature_key AND f.active
  ),
  ov AS (
    SELECT x.mode FROM public.organization_feature_overrides x
    WHERE x.organization_id=(SELECT organization_id FROM my_org) AND x.feature_id=(SELECT id FROM feat)
      AND x.ended_at IS NULL AND x.starts_at<=now() AND (x.ends_at IS NULL OR x.ends_at>now()) LIMIT 1
  )
  SELECT exists(SELECT 1 FROM my_sub) AND exists(SELECT 1 FROM feat) AND CASE
    WHEN (SELECT mode FROM ov)='REVOKE' THEN false
    WHEN (SELECT mode FROM ov)='GRANT' THEN true
    ELSE exists(SELECT 1 FROM public.saas_plan_features pf,my_sub WHERE pf.plan_id=my_sub.plan_id AND pf.enabled AND pf.feature_id=(SELECT id FROM feat))
  END;
$$;
REVOKE ALL ON FUNCTION public._saas_user_has_feature(uuid,text) FROM PUBLIC, anon, authenticated;

COMMIT;