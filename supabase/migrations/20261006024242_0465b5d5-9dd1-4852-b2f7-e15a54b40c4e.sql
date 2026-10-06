DO $$
BEGIN
  IF current_database() IS NULL THEN
    RAISE EXCEPTION 'database_unavailable';
  END IF;
END $$;

ALTER TABLE public.saas_features
  ADD COLUMN IF NOT EXISTS commercializable boolean NOT NULL DEFAULT false;

CREATE TABLE public.saas_limit_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL,
  value_type text NOT NULL DEFAULT 'integer',
  application text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_limit_definitions_key_format CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT saas_limit_definitions_name_present CHECK (btrim(name) <> ''),
  CONSTRAINT saas_limit_definitions_description_present CHECK (btrim(description) <> ''),
  CONSTRAINT saas_limit_definitions_category_present CHECK (btrim(category) <> ''),
  CONSTRAINT saas_limit_definitions_unit_present CHECK (btrim(unit) <> ''),
  CONSTRAINT saas_limit_definitions_application_present CHECK (btrim(application) <> ''),
  CONSTRAINT saas_limit_definitions_value_type CHECK (value_type IN ('integer', 'decimal'))
);
GRANT SELECT ON public.saas_limit_definitions TO authenticated;
GRANT ALL ON public.saas_limit_definitions TO service_role;
ALTER TABLE public.saas_limit_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_limit_definitions_platform_read
  ON public.saas_limit_definitions FOR SELECT TO authenticated
  USING (public.is_platform_superadmin((SELECT auth.uid())));

CREATE TABLE public.saas_feature_limit_definitions (
  feature_id uuid NOT NULL REFERENCES public.saas_features(id) ON DELETE CASCADE,
  limit_definition_id uuid NOT NULL REFERENCES public.saas_limit_definitions(id) ON DELETE RESTRICT,
  required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_id, limit_definition_id)
);
GRANT SELECT ON public.saas_feature_limit_definitions TO authenticated;
GRANT ALL ON public.saas_feature_limit_definitions TO service_role;
ALTER TABLE public.saas_feature_limit_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_feature_limit_definitions_platform_read
  ON public.saas_feature_limit_definitions FOR SELECT TO authenticated
  USING (public.is_platform_superadmin((SELECT auth.uid())));

CREATE TABLE public.saas_feature_dependencies (
  feature_id uuid NOT NULL REFERENCES public.saas_features(id) ON DELETE CASCADE,
  depends_on_feature_id uuid NOT NULL REFERENCES public.saas_features(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_id, depends_on_feature_id),
  CONSTRAINT saas_feature_dependencies_not_self CHECK (feature_id <> depends_on_feature_id)
);
GRANT SELECT ON public.saas_feature_dependencies TO authenticated;
GRANT ALL ON public.saas_feature_dependencies TO service_role;
ALTER TABLE public.saas_feature_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_feature_dependencies_platform_read
  ON public.saas_feature_dependencies FOR SELECT TO authenticated
  USING (public.is_platform_superadmin((SELECT auth.uid())));

CREATE INDEX IF NOT EXISTS idx_saas_feature_limit_definitions_limit
  ON public.saas_feature_limit_definitions(limit_definition_id);
CREATE INDEX IF NOT EXISTS idx_saas_feature_dependencies_dependency
  ON public.saas_feature_dependencies(depends_on_feature_id);
CREATE INDEX IF NOT EXISTS idx_saas_limit_definitions_active_category
  ON public.saas_limit_definitions(active, category, name);

DROP TRIGGER IF EXISTS set_saas_limit_definitions_updated_at ON public.saas_limit_definitions;
CREATE TRIGGER set_saas_limit_definitions_updated_at
  BEFORE UPDATE ON public.saas_limit_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
BEGIN
  IF _limits IS NULL OR jsonb_typeof(_limits) <> 'object' THEN
    RAISE EXCEPTION 'saas_limits_invalid' USING ERRCODE = '22023';
  END IF;
  IF _features IS NULL OR jsonb_typeof(_features) <> 'array' THEN
    RAISE EXCEPTION 'saas_features_invalid' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_features) item
    WHERE jsonb_typeof(item) <> 'string'
  ) THEN
    RAISE EXCEPTION 'saas_feature_key_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(v ORDER BY v), ARRAY[]::text[])
  INTO _selected_keys
  FROM (SELECT DISTINCT jsonb_array_elements_text(_features) AS v) d;

  IF cardinality(_selected_keys) <> jsonb_array_length(_features) THEN
    RAISE EXCEPTION 'saas_feature_duplicate' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(_selected_keys) feature_key
    LEFT JOIN public.saas_features f ON f.key = feature_key
    LEFT JOIN public.saas_plan_features pf
      ON pf.feature_id = f.id AND pf.plan_id = _plan_id AND pf.enabled IS TRUE
    WHERE f.id IS NULL OR f.active IS NOT TRUE OR f.commercializable IS NOT TRUE OR pf.feature_id IS NULL
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
      AND NOT (_limits ? ld.key)
  ) THEN
    RAISE EXCEPTION 'saas_required_limit_missing' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.validate_commercial_plan_payload(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.validate_commercial_plan_payload(uuid, jsonb, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_save_plan_version_draft(
  _plan_id uuid,
  _version_id uuid,
  _price numeric,
  _currency text,
  _billing_cycle text,
  _trial_days integer,
  _effective_from timestamptz,
  _limits jsonb,
  _features jsonb,
  _reason text,
  _idempotency_key uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _old jsonb;
  _snapshot jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_platform_superadmin(_uid) THEN
    RAISE EXCEPTION 'platform_superadmin_required' USING ERRCODE='42501';
  END IF;
  IF _idempotency_key IS NULL OR nullif(btrim(_reason),'') IS NULL THEN
    RAISE EXCEPTION 'saas_reason_and_idempotency_required' USING ERRCODE='22023';
  END IF;
  IF _price IS NULL OR _price <= 0 OR _currency IS NULL OR _currency !~ '^[A-Z]{3}$'
     OR _billing_cycle NOT IN ('MONTHLY','ANNUAL') OR _trial_days IS NULL OR _trial_days < 0
     OR _effective_from IS NULL THEN
    RAISE EXCEPTION 'saas_commercial_fields_invalid' USING ERRCODE='22023';
  END IF;

  PERFORM platform_private.validate_commercial_plan_payload(_plan_id, _limits, _features);

  SELECT version_id INTO _id FROM public.saas_plan_version_audit
  WHERE idempotency_key=_idempotency_key AND action IN ('draft_created','draft_updated') LIMIT 1;
  IF _id IS NOT NULL THEN RETURN _id; END IF;

  IF _version_id IS NULL THEN
    SELECT coalesce(max(revision),0)+1 INTO STRICT _trial_days
    FROM public.saas_plan_versions WHERE plan_id=_plan_id;
    INSERT INTO public.saas_plan_versions(plan_id,revision,status,price,currency,billing_cycle,trial_days,effective_from,limits_snapshot,features_snapshot,created_by)
    SELECT _plan_id, coalesce(max(v.revision),0)+1, 'DRAFT', _price, upper(_currency), _billing_cycle, public.platform_save_plan_version_draft._trial_days,
           _effective_from, _limits, '[]'::jsonb, _uid
    FROM public.saas_plan_versions v WHERE v.plan_id=_plan_id
    RETURNING id INTO _id;
  ELSE
    SELECT to_jsonb(v) INTO _old FROM public.saas_plan_versions v WHERE v.id=_version_id AND v.plan_id=_plan_id FOR UPDATE;
    IF _old IS NULL OR (_old->>'status') <> 'DRAFT' THEN RAISE EXCEPTION 'saas_draft_required' USING ERRCODE='23514'; END IF;
    PERFORM platform_private.issue_ticket('saas_plan_version_mutation', _version_id, _uid, _reason, _idempotency_key);
    UPDATE public.saas_plan_versions SET price=_price,currency=upper(_currency),billing_cycle=_billing_cycle,trial_days=_trial_days,
      effective_from=_effective_from,limits_snapshot=_limits,features_snapshot='[]'::jsonb,updated_at=now() WHERE id=_version_id;
    _id := _version_id;
  END IF;

  PERFORM platform_private.issue_ticket('saas_plan_version_features_mutation', _id, _uid, _reason, _idempotency_key);
  DELETE FROM public.saas_plan_version_features WHERE plan_version_id=_id;
  INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled,limit_value,config)
  SELECT _id,f.id,true,NULL,'{}'::jsonb
  FROM jsonb_array_elements_text(_features) x(feature_key)
  JOIN public.saas_features f ON f.key=x.feature_key;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'feature_id',vf.feature_id,'feature_key',f.key,'feature_name',f.name,
    'module_key',m.key,'module_name',m.name,'enabled',vf.enabled,
    'limit_value',vf.limit_value,'config',vf.config) ORDER BY m.key,f.key),'[]'::jsonb)
  INTO _snapshot
  FROM public.saas_plan_version_features vf
  JOIN public.saas_features f ON f.id=vf.feature_id
  JOIN public.saas_modules m ON m.id=f.module_id
  WHERE vf.plan_version_id=_id;
  UPDATE public.saas_plan_versions SET features_snapshot=_snapshot WHERE id=_id;

  INSERT INTO public.saas_plan_version_audit(version_id,action,actor_user_id,old_values,new_values,reason,idempotency_key)
  SELECT _id,CASE WHEN _version_id IS NULL THEN 'draft_created' ELSE 'draft_updated' END,_uid,_old,to_jsonb(v),_reason,_idempotency_key
  FROM public.saas_plan_versions v WHERE v.id=_id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_save_plan_version_draft(uuid,uuid,numeric,text,text,integer,timestamptz,jsonb,jsonb,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_save_plan_version_draft(uuid,uuid,numeric,text,text,integer,timestamptz,jsonb,jsonb,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_validate_plan_version_draft(_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _v public.saas_plan_versions%ROWTYPE;
  _missing text[] := ARRAY[]::text[];
BEGIN
  IF _uid IS NULL OR NOT public.is_platform_superadmin(_uid) THEN
    RAISE EXCEPTION 'platform_superadmin_required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO _v FROM public.saas_plan_versions WHERE id=_draft_id;
  IF NOT FOUND OR _v.status <> 'DRAFT' THEN RAISE EXCEPTION 'saas_draft_required' USING ERRCODE='23514'; END IF;
  IF _v.price IS NULL OR _v.price <= 0 THEN _missing:=array_append(_missing,'price'); END IF;
  IF _v.currency IS NULL OR _v.currency !~ '^[A-Z]{3}$' THEN _missing:=array_append(_missing,'currency'); END IF;
  IF _v.billing_cycle IS NULL THEN _missing:=array_append(_missing,'billing_cycle'); END IF;
  IF _v.trial_days IS NULL OR _v.trial_days < 0 THEN _missing:=array_append(_missing,'trial_days'); END IF;
  IF _v.effective_from IS NULL THEN _missing:=array_append(_missing,'effective_from'); END IF;
  IF _v.limits_snapshot IS NULL OR jsonb_typeof(_v.limits_snapshot) <> 'object' THEN _missing:=array_append(_missing,'limits'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.saas_plan_version_features WHERE plan_version_id=_draft_id AND enabled) THEN _missing:=array_append(_missing,'features'); END IF;
  IF cardinality(_missing)=0 THEN
    BEGIN
      PERFORM platform_private.validate_commercial_plan_payload(
        _v.plan_id,
        _v.limits_snapshot,
        (SELECT coalesce(jsonb_agg(f.key ORDER BY f.key),'[]'::jsonb)
         FROM public.saas_plan_version_features vf JOIN public.saas_features f ON f.id=vf.feature_id
         WHERE vf.plan_version_id=_draft_id AND vf.enabled)
      );
    EXCEPTION WHEN OTHERS THEN
      _missing:=array_append(_missing,'commercial_payload');
    END;
  END IF;
  RETURN jsonb_build_object('valid',cardinality(_missing)=0,'missing',to_jsonb(_missing));
END;
$$;
REVOKE ALL ON FUNCTION public.platform_validate_plan_version_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_validate_plan_version_draft(uuid) TO authenticated;