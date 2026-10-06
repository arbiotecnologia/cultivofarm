CREATE OR REPLACE FUNCTION platform_private.validate_commercial_plan_payload(
  _plan_id uuid,
  _limits jsonb,
  _features jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  _entry record;
  _selected_keys text[];
  _legacy_catalog_cutoff constant timestamptz := '2026-10-06 02:42:42+00'::timestamptz;
BEGIN
  IF _limits IS NULL OR jsonb_typeof(_limits) <> 'object' THEN
    RAISE EXCEPTION 'saas_limits_invalid' USING ERRCODE = '22023';
  END IF;
  IF _features IS NULL OR jsonb_typeof(_features) <> 'array' THEN
    RAISE EXCEPTION 'saas_features_invalid' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_features) item
    WHERE jsonb_typeof(item) <> 'string' OR nullif(btrim(item #>> '{}'), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'saas_feature_key_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(feature_key ORDER BY feature_key), ARRAY[]::text[])
    INTO _selected_keys
  FROM (SELECT DISTINCT jsonb_array_elements_text(_features) AS feature_key) selected;

  IF cardinality(_selected_keys) <> jsonb_array_length(_features) THEN
    RAISE EXCEPTION 'saas_feature_duplicate' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(_selected_keys) feature_key
    LEFT JOIN public.saas_features f ON f.key = feature_key
    LEFT JOIN public.saas_plan_features pf
      ON pf.feature_id = f.id AND pf.plan_id = _plan_id AND pf.enabled IS TRUE
    WHERE f.id IS NULL
       OR f.active IS NOT TRUE
       OR pf.feature_id IS NULL
       OR (f.commercializable IS NOT TRUE AND f.created_at >= _legacy_catalog_cutoff)
  ) THEN
    RAISE EXCEPTION 'saas_feature_unavailable' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.saas_feature_dependencies d
    JOIN public.saas_features f ON f.id = d.feature_id
    JOIN public.saas_features required_f ON required_f.id = d.depends_on_feature_id
    WHERE f.key = ANY(_selected_keys)
      AND NOT (required_f.key = ANY(_selected_keys))
  ) THEN
    RAISE EXCEPTION 'saas_feature_dependency_missing' USING ERRCODE = '22023';
  END IF;

  FOR _entry IN SELECT key, value FROM jsonb_each(_limits)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.saas_limit_definitions ld
      JOIN public.saas_feature_limit_definitions fld ON fld.limit_definition_id = ld.id
      JOIN public.saas_features f ON f.id = fld.feature_id
      WHERE ld.key = _entry.key
        AND ld.active IS TRUE
        AND f.key = ANY(_selected_keys)
    ) THEN
      RAISE EXCEPTION 'saas_limit_unknown' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(_entry.value) <> 'object'
       OR NOT (_entry.value ? 'state')
       OR (_entry.value - 'state' - 'value') <> '{}'::jsonb
       OR (_entry.value->>'state') NOT IN ('not_included', 'limited', 'unlimited') THEN
      RAISE EXCEPTION 'saas_limit_state_invalid' USING ERRCODE = '22023';
    END IF;

    IF (_entry.value->>'state') = 'limited' THEN
      IF NOT (_entry.value ? 'value')
         OR jsonb_typeof(_entry.value->'value') <> 'number'
         OR ((_entry.value->>'value')::numeric < 0) THEN
        RAISE EXCEPTION 'saas_limit_value_invalid' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.saas_limit_definitions ld
        WHERE ld.key = _entry.key
          AND ld.value_type = 'integer'
          AND trunc((_entry.value->>'value')::numeric) <> ((_entry.value->>'value')::numeric)
      ) THEN
        RAISE EXCEPTION 'saas_limit_value_type_invalid' USING ERRCODE = '22023';
      END IF;
    ELSIF _entry.value ? 'value' THEN
      RAISE EXCEPTION 'saas_limit_value_unexpected' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.saas_feature_limit_definitions fld
    JOIN public.saas_limit_definitions ld ON ld.id = fld.limit_definition_id
    JOIN public.saas_features f ON f.id = fld.feature_id
    WHERE fld.required IS TRUE
      AND ld.active IS TRUE
      AND f.key = ANY(_selected_keys)
      AND (NOT (_limits ? ld.key) OR _limits->ld.key->>'state' = 'not_included')
  ) THEN
    RAISE EXCEPTION 'saas_required_limit_missing' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.validate_commercial_plan_payload(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.validate_commercial_plan_payload(uuid,jsonb,jsonb) TO authenticated, service_role;