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
  _next_revision integer;
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
    SELECT coalesce(max(revision),0)+1 INTO _next_revision
    FROM public.saas_plan_versions WHERE plan_id=_plan_id;
    INSERT INTO public.saas_plan_versions(plan_id,revision,status,price,currency,billing_cycle,trial_days,effective_from,limits_snapshot,features_snapshot,created_by)
    VALUES (_plan_id, _next_revision, 'DRAFT', _price, upper(_currency), _billing_cycle, _trial_days,
            _effective_from, _limits, '[]'::jsonb, _uid)
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