BEGIN;

ALTER TABLE public.organization_feature_overrides
  ADD COLUMN IF NOT EXISTS idempotency_key uuid NULL,
  ADD COLUMN IF NOT EXISTS end_idempotency_key uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_feature_overrides_idempotency
  ON public.organization_feature_overrides(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_feature_overrides_end_idempotency
  ON public.organization_feature_overrides(end_idempotency_key)
  WHERE end_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION platform_private.entitlements_for_user(_uid uuid)
RETURNS TABLE(module_key text, feature_key text, limit_value numeric, config jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
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
$$;
REVOKE ALL ON FUNCTION platform_private.entitlements_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_private.entitlements_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS TABLE(module_key text, feature_key text, limit_value numeric, config jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT * FROM platform_private.entitlements_for_user(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.get_my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.saas_has_feature(_feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform_private.entitlements_for_user(auth.uid()) e
    WHERE e.feature_key = _feature_key
  )
$$;
REVOKE ALL ON FUNCTION public.saas_has_feature(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saas_has_feature(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._saas_user_has_feature(_uid uuid, _feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform_private.entitlements_for_user(_uid) e
    WHERE e.feature_key = _feature_key
  )
$$;
REVOKE ALL ON FUNCTION public._saas_user_has_feature(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._saas_user_has_feature(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_set_feature_override(
  _organization_id uuid,
  _feature_key text,
  _mode text,
  _reason text,
  _ends_at timestamptz,
  _limit_value numeric,
  _idempotency_key uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_feature uuid;
  v_id uuid;
  v_existing public.organization_feature_overrides%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501';
  END IF;
  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: chave idempotente obrigatória' USING ERRCODE='22023';
  END IF;
  IF _mode NOT IN ('GRANT','REVOKE') THEN
    RAISE EXCEPTION 'platform_invalid: modo inválido' USING ERRCODE='22023';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'platform_invalid: motivo obrigatório' USING ERRCODE='22023';
  END IF;
  IF _limit_value IS NOT NULL AND _limit_value < 0 THEN
    RAISE EXCEPTION 'platform_invalid: limite inválido' USING ERRCODE='22023';
  END IF;
  IF _ends_at IS NOT NULL AND _ends_at <= now() THEN
    RAISE EXCEPTION 'platform_invalid: prazo no passado' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=_organization_id AND o.ativo) THEN
    RAISE EXCEPTION 'platform_invalid: empresa inexistente ou inativa' USING ERRCODE='22023';
  END IF;
  SELECT f.id INTO v_feature
  FROM public.saas_features f
  JOIN public.saas_modules m ON m.id=f.module_id AND m.active
  WHERE f.key=_feature_key AND f.active;
  IF v_feature IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: funcionalidade inexistente ou inativa' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.organization_feature_overrides o
  WHERE o.idempotency_key=_idempotency_key;
  IF FOUND THEN
    IF v_existing.organization_id=_organization_id
       AND v_existing.feature_id=v_feature
       AND v_existing.mode=_mode
       AND v_existing.reason=btrim(_reason)
       AND v_existing.ends_at IS NOT DISTINCT FROM _ends_at
       AND v_existing.limit_value IS NOT DISTINCT FROM _limit_value THEN
      RETURN v_existing.id;
    END IF;
    RAISE EXCEPTION 'platform_conflict: chave idempotente já utilizada' USING ERRCODE='40001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_feature_overrides o
    WHERE o.organization_id=_organization_id AND o.feature_id=v_feature AND o.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'platform_conflict: já existe exceção aberta para esta funcionalidade' USING ERRCODE='40001';
  END IF;

  INSERT INTO public.organization_feature_overrides(
    organization_id,feature_id,mode,limit_value,ends_at,reason,created_by,idempotency_key
  ) VALUES (
    _organization_id,v_feature,_mode,_limit_value,_ends_at,btrim(_reason),auth.uid(),_idempotency_key
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_set_feature_override(uuid,text,text,text,timestamptz,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_feature_override(uuid,text,text,text,timestamptz,numeric,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_set_feature_override(
  _organization_id uuid,
  _feature_key text,
  _mode text,
  _reason text,
  _ends_at timestamptz DEFAULT NULL,
  _limit_value numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT public.platform_set_feature_override(
    _organization_id,_feature_key,_mode,_reason,_ends_at,_limit_value,gen_random_uuid()
  )
$$;
REVOKE ALL ON FUNCTION public.platform_set_feature_override(uuid,text,text,text,timestamptz,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_feature_override(uuid,text,text,text,timestamptz,numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_end_feature_override(
  _override_id uuid,
  _reason text,
  _idempotency_key uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_existing public.organization_feature_overrides%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501';
  END IF;
  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: chave idempotente obrigatória' USING ERRCODE='22023';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'platform_invalid: motivo obrigatório' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.organization_feature_overrides o
  WHERE o.id=_override_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_invalid: exceção inexistente' USING ERRCODE='22023';
  END IF;
  IF v_existing.ended_at IS NOT NULL THEN
    IF v_existing.end_idempotency_key=_idempotency_key AND v_existing.end_reason=btrim(_reason) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'platform_conflict: exceção já encerrada' USING ERRCODE='40001';
  END IF;

  UPDATE public.organization_feature_overrides
  SET ended_at=now(),ended_by=auth.uid(),end_reason=btrim(_reason),end_idempotency_key=_idempotency_key
  WHERE id=_override_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_end_feature_override(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_end_feature_override(uuid,text,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_end_feature_override(_override_id uuid, _reason text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT public.platform_end_feature_override(_override_id,_reason,gen_random_uuid())
$$;
REVOKE ALL ON FUNCTION public.platform_end_feature_override(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_end_feature_override(uuid,text) TO authenticated, service_role;

REVOKE ALL ON TABLE public.saas_plan_versions FROM anon;
REVOKE ALL ON TABLE public.saas_plan_version_features FROM anon;
REVOKE ALL ON TABLE public.organization_feature_overrides FROM anon;

COMMIT;