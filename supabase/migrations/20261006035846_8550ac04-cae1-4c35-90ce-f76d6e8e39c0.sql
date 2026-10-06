CREATE OR REPLACE FUNCTION platform_private.normalize_commercial_reason(_reason text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_reason text := btrim(coalesce(_reason, ''));
BEGIN
  IF char_length(v_reason) < 2 THEN
    RAISE EXCEPTION 'platform_invalid: motivo deve ter pelo menos 2 caracteres' USING ERRCODE = '22023';
  END IF;
  RETURN v_reason;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.normalize_commercial_reason(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.normalize_commercial_reason(text) TO authenticated, service_role;

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
  IF NOT EXISTS (SELECT 1 FROM public.saas_plans p WHERE p.id = _plan_id AND p.active IS TRUE) THEN
    RAISE EXCEPTION 'saas_plan_unavailable' USING ERRCODE = '22023';
  END IF;
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
    LEFT JOIN public.saas_modules m ON m.id = f.module_id
    WHERE f.id IS NULL
       OR f.active IS NOT TRUE
       OR m.id IS NULL
       OR m.active IS NOT TRUE
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

CREATE OR REPLACE FUNCTION public.platform_save_plan_version_draft(
  _draft_id uuid,
  _plan_key text,
  _price_amount numeric,
  _currency text,
  _billing_cycle text,
  _trial_days integer,
  _limits jsonb,
  _effective_from timestamptz,
  _features jsonb,
  _reason text,
  _idempotency_key uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan public.saas_plans%ROWTYPE;
  v_draft public.saas_plan_versions%ROWTYPE;
  v_id uuid;
  v_old jsonb;
  v_number integer;
  v_feature_keys jsonb;
  v_features_snapshot jsonb;
  v_existing uuid;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501';
  END IF;
  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: chave idempotente obrigatória' USING ERRCODE='22023';
  END IF;
  v_reason := platform_private.normalize_commercial_reason(_reason);
  IF _features IS NULL OR jsonb_typeof(_features) <> 'array' THEN
    RAISE EXCEPTION 'platform_invalid: funcionalidades inválidas' USING ERRCODE='22023';
  END IF;

  SELECT p.* INTO v_plan
  FROM public.saas_plans p
  WHERE p.key=_plan_key AND p.active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_invalid: plano inexistente ou inativo' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('saas_plan_version:' || v_plan.id::text,0));

  SELECT coalesce(jsonb_agg(DISTINCT btrim(item->>'feature_key')),'[]'::jsonb)
    INTO v_feature_keys
  FROM jsonb_array_elements(_features) item
  WHERE coalesce((item->>'enabled')::boolean,true)
    AND nullif(btrim(item->>'feature_key'),'') IS NOT NULL;

  PERFORM platform_private.validate_commercial_plan_payload(v_plan.id,_limits,v_feature_keys);

  SELECT a.plan_version_id INTO v_existing
  FROM public.saas_plan_version_audit a
  JOIN public.saas_plan_versions pv ON pv.id=a.plan_version_id
  WHERE a.idempotency_key=_idempotency_key
    AND a.actor_user_id=auth.uid()
    AND a.action IN ('draft_created','draft_updated')
    AND pv.plan_id=v_plan.id
  ORDER BY a.created_at DESC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF _draft_id IS NULL THEN
    SELECT id INTO v_id FROM public.saas_plan_versions
    WHERE plan_id=v_plan.id AND status='DRAFT'
    FOR UPDATE;
    IF v_id IS NOT NULL THEN
      RAISE EXCEPTION 'platform_conflict: já existe rascunho para este plano' USING ERRCODE='40001';
    END IF;
    SELECT coalesce(max(version_number),0)+1 INTO v_number
    FROM public.saas_plan_versions WHERE plan_id=v_plan.id;
    v_id:=gen_random_uuid();
    PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_create',v_plan.id);
    INSERT INTO public.saas_plan_versions(
      id,plan_id,version_number,name_snapshot,description_snapshot,price_amount,currency,
      billing_cycle,trial_days,limits_snapshot,features_snapshot,effective_from,status,
      revision,draft_key,created_by,updated_at
    ) VALUES (
      v_id,v_plan.id,v_number,v_plan.name,v_plan.description,_price_amount,
      nullif(upper(btrim(coalesce(_currency,''))),''),nullif(_billing_cycle,''),_trial_days,
      _limits,'[]'::jsonb,_effective_from,'DRAFT',1,_idempotency_key,auth.uid(),now()
    );
  ELSE
    SELECT * INTO v_draft
    FROM public.saas_plan_versions
    WHERE id=_draft_id AND plan_id=v_plan.id
    FOR UPDATE;
    IF NOT FOUND OR v_draft.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'platform_invalid: rascunho inexistente' USING ERRCODE='22023';
    END IF;
    v_id:=v_draft.id;
    v_old:=to_jsonb(v_draft);
    PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_write',v_plan.id);
    UPDATE public.saas_plan_versions SET
      price_amount=_price_amount,
      currency=nullif(upper(btrim(coalesce(_currency,''))),'') ,
      billing_cycle=nullif(_billing_cycle,''),
      trial_days=_trial_days,
      limits_snapshot=_limits,
      effective_from=_effective_from,
      revision=revision+1,
      updated_at=now()
    WHERE id=v_id;
  END IF;

  PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_write',v_plan.id);
  DELETE FROM public.saas_plan_version_features WHERE plan_version_id=v_id;
  INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled,limit_value,config)
  SELECT v_id,f.id,true,NULL,'{}'::jsonb
  FROM jsonb_array_elements_text(v_feature_keys) selected(feature_key)
  JOIN public.saas_features f ON f.key=selected.feature_key;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'feature_id',vf.feature_id,
    'feature_key',f.key,
    'feature_name',f.name,
    'module_key',m.key,
    'module_name',m.name,
    'enabled',vf.enabled,
    'limit_value',vf.limit_value,
    'config',vf.config
  ) ORDER BY m.key,f.key),'[]'::jsonb)
  INTO v_features_snapshot
  FROM public.saas_plan_version_features vf
  JOIN public.saas_features f ON f.id=vf.feature_id
  JOIN public.saas_modules m ON m.id=f.module_id
  WHERE vf.plan_version_id=v_id;

  PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_write',v_plan.id);
  UPDATE public.saas_plan_versions
  SET features_snapshot=v_features_snapshot,updated_at=now()
  WHERE id=v_id;

  PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_audit',v_plan.id);
  INSERT INTO public.saas_plan_version_audit(
    plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key
  ) VALUES (
    v_id,CASE WHEN _draft_id IS NULL THEN 'draft_created' ELSE 'draft_updated' END,
    v_old,(SELECT to_jsonb(current_version) FROM public.saas_plan_versions current_version WHERE current_version.id=v_id),
    v_reason,'platform_rpc',auth.uid(),_idempotency_key
  );
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_save_plan_version_draft(uuid,text,numeric,text,text,integer,jsonb,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_save_plan_version_draft(uuid,text,numeric,text,text,integer,jsonb,timestamptz,jsonb,text,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_publish_plan_version_draft(
  _draft_id uuid,
  _reason text,
  _idempotency_key uuid,
  _confirmation text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v public.saas_plan_versions%ROWTYPE;
  v_check jsonb;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501';
  END IF;
  IF _confirmation <> 'PUBLICAR' THEN
    RAISE EXCEPTION 'platform_invalid: confirmação inválida' USING ERRCODE='22023';
  END IF;
  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: chave idempotente obrigatória' USING ERRCODE='22023';
  END IF;
  v_reason := platform_private.normalize_commercial_reason(_reason);

  SELECT * INTO v FROM public.saas_plan_versions WHERE id=_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: rascunho inexistente' USING ERRCODE='22023'; END IF;
  IF v.status='PUBLISHED' AND v.publish_key=_idempotency_key THEN RETURN v.id; END IF;
  IF v.status <> 'DRAFT' THEN RAISE EXCEPTION 'platform_conflict: versão não está em rascunho' USING ERRCODE='40001'; END IF;

  v_check:=public.platform_validate_plan_version_draft(v.id);
  IF NOT coalesce((v_check->>'complete')::boolean,false)
     OR NOT coalesce((v_check->>'valid')::boolean,false) THEN
    RAISE EXCEPTION 'platform_invalid: rascunho incompleto ou inválido' USING ERRCODE='22023';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.saas_plan_versions existing
    WHERE existing.plan_id=v.plan_id
      AND existing.status='PUBLISHED'
      AND existing.effective_from<=v.effective_from
      AND (existing.effective_to IS NULL OR existing.effective_to>v.effective_from)
  ) THEN
    RAISE EXCEPTION 'platform_conflict: vigência sobreposta' USING ERRCODE='40001';
  END IF;

  PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_write',v.plan_id);
  UPDATE public.saas_plan_versions SET status='PUBLISHED',published_at=now(),publication_reason=v_reason,
    publish_key=_idempotency_key WHERE id=v.id;
  PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_audit',v.plan_id);
  INSERT INTO public.saas_plan_version_audit(plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key)
  VALUES(v.id,'published',to_jsonb(v),(SELECT to_jsonb(x) FROM public.saas_plan_versions x WHERE x.id=v.id),v_reason,'platform_rpc',auth.uid(),_idempotency_key);
  RETURN v.id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_publish_plan_version_draft(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_publish_plan_version_draft(uuid,text,uuid,text) TO authenticated, service_role;