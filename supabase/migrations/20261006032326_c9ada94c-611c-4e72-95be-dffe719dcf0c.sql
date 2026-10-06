CREATE OR REPLACE FUNCTION platform_private.issue_saas_plan_version_ticket(_scope text, _target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE = '42501';
  END IF;
  IF _scope NOT IN (
    'saas_plan_version_create',
    'saas_plan_version_write',
    'saas_plan_version_audit',
    'saas_plan_version_archive'
  ) THEN
    RAISE EXCEPTION 'platform_invalid: escopo de autorização inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.saas_plans p WHERE p.id = _target) THEN
    RAISE EXCEPTION 'platform_invalid: plano inexistente' USING ERRCODE = '22023';
  END IF;
  INSERT INTO platform_private.authz_tickets(txid, scope, target)
  VALUES (txid_current(), _scope, _target)
  ON CONFLICT DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION platform_private.issue_saas_plan_version_ticket(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.issue_saas_plan_version_ticket(text,uuid) TO authenticated, service_role;

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
SET search_path TO ''
AS $function$
DECLARE
  v_plan public.saas_plans%ROWTYPE;
  v_draft public.saas_plan_versions%ROWTYPE;
  v_id uuid;
  v_old jsonb;
  v_number integer;
  v_feature_keys jsonb;
  v_features_snapshot jsonb;
  v_existing uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501';
  END IF;
  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: chave idempotente obrigatória' USING ERRCODE='22023';
  END IF;
  IF length(btrim(coalesce(_reason,''))) < 5 THEN
    RAISE EXCEPTION 'platform_invalid: motivo obrigatório' USING ERRCODE='22023';
  END IF;
  IF _features IS NULL OR jsonb_typeof(_features) <> 'array' THEN
    RAISE EXCEPTION 'platform_invalid: funcionalidades inválidas' USING ERRCODE='22023';
  END IF;

  SELECT p.* INTO v_plan
  FROM public.saas_plans p
  WHERE p.key=_plan_key AND p.active
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_invalid: plano inexistente ou inativo' USING ERRCODE='22023';
  END IF;

  SELECT coalesce(jsonb_agg(DISTINCT btrim(item->>'feature_key')),'[]'::jsonb)
    INTO v_feature_keys
  FROM jsonb_array_elements(_features) item
  WHERE coalesce((item->>'enabled')::boolean,true)
    AND nullif(btrim(item->>'feature_key'),'') IS NOT NULL;

  PERFORM platform_private.validate_commercial_plan_payload(v_plan.id,_limits,v_feature_keys);

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v_feature_keys) selected(feature_key)
    LEFT JOIN public.saas_features f ON f.key=selected.feature_key AND f.active
    LEFT JOIN public.saas_plan_features pf ON pf.plan_id=v_plan.id AND pf.feature_id=f.id AND pf.enabled
    WHERE f.id IS NULL OR pf.plan_id IS NULL
  ) THEN
    RAISE EXCEPTION 'platform_invalid: funcionalidade inválida para o plano' USING ERRCODE='22023';
  END IF;

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
      currency=nullif(upper(btrim(coalesce(_currency,''))),''),
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
    btrim(_reason),'platform_rpc',auth.uid(),_idempotency_key
  );
  RETURN v_id;
END;
$function$;

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
SET search_path TO ''
AS $function$
DECLARE
  v public.saas_plan_versions%ROWTYPE;
  v_check jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501';
  END IF;
  IF _confirmation <> 'PUBLICAR' THEN
    RAISE EXCEPTION 'platform_invalid: confirmação inválida' USING ERRCODE='22023';
  END IF;
  IF _idempotency_key IS NULL OR length(btrim(coalesce(_reason,''))) < 5 THEN
    RAISE EXCEPTION 'platform_invalid: motivo e chave idempotente obrigatórios' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v FROM public.saas_plan_versions WHERE id=_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: rascunho inexistente' USING ERRCODE='22023'; END IF;
  IF v.status='PUBLISHED' AND v.publish_key=_idempotency_key THEN RETURN v.id; END IF;
  IF v.status <> 'DRAFT' THEN RAISE EXCEPTION 'platform_conflict: versão não está em rascunho' USING ERRCODE='40001'; END IF;

  v_check:=public.platform_validate_plan_version_draft(v.id);
  IF NOT coalesce((v_check->>'complete')::boolean,false) THEN
    RAISE EXCEPTION 'platform_invalid: rascunho incompleto' USING ERRCODE='22023';
  END IF;

  PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_write',v.plan_id);
  UPDATE public.saas_plan_versions SET status='PUBLISHED',published_at=now(),publication_reason=btrim(_reason),
    publish_key=_idempotency_key,updated_at=now() WHERE id=v.id;
  PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_audit',v.plan_id);
  INSERT INTO public.saas_plan_version_audit(plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key)
  VALUES(v.id,'published',to_jsonb(v),(SELECT to_jsonb(x) FROM public.saas_plan_versions x WHERE x.id=v.id),btrim(_reason),'platform_rpc',auth.uid(),_idempotency_key);
  RETURN v.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_publish_plan_version_draft(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_publish_plan_version_draft(uuid,text,uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_archive_plan_version(
  _version_id uuid,
  _reason text,
  _idempotency_key uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE v public.saas_plan_versions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501';
  END IF;
  IF _idempotency_key IS NULL OR length(btrim(coalesce(_reason,'')))<5 THEN
    RAISE EXCEPTION 'platform_invalid: motivo e chave idempotente obrigatórios' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v FROM public.saas_plan_versions WHERE id=_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: versão inexistente' USING ERRCODE='22023'; END IF;
  IF v.status='ARCHIVED' THEN RETURN v.id; END IF;
  IF v.status<>'PUBLISHED' THEN RAISE EXCEPTION 'platform_conflict: apenas publicada pode ser arquivada' USING ERRCODE='40001'; END IF;
  PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_archive',v.plan_id);
  UPDATE public.saas_plan_versions SET status='ARCHIVED',archived_at=now(),archived_by=auth.uid(),archive_reason=btrim(_reason),updated_at=now() WHERE id=v.id;
  PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_audit',v.plan_id);
  INSERT INTO public.saas_plan_version_audit(plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key)
  VALUES(v.id,'archived',to_jsonb(v),(SELECT to_jsonb(x) FROM public.saas_plan_versions x WHERE x.id=v.id),btrim(_reason),'platform_rpc',auth.uid(),_idempotency_key);
  RETURN v.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_archive_plan_version(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_archive_plan_version(uuid,text,uuid) TO authenticated, service_role;