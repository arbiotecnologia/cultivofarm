BEGIN;

CREATE TABLE public.saas_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.saas_plans(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  version_number integer NOT NULL,
  name_snapshot text NOT NULL,
  description_snapshot text NULL,
  price_amount numeric(14,2) NULL,
  currency text NULL,
  billing_cycle text NULL,
  limits_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  features_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_plan_versions_number_positive CHECK (version_number > 0),
  CONSTRAINT saas_plan_versions_price_nonnegative CHECK (price_amount IS NULL OR price_amount >= 0),
  CONSTRAINT saas_plan_versions_currency_format CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  CONSTRAINT saas_plan_versions_cycle_valid CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly','quarterly','semiannual','annual','custom')),
  CONSTRAINT saas_plan_versions_limits_object CHECK (jsonb_typeof(limits_snapshot) = 'object'),
  CONSTRAINT saas_plan_versions_features_array CHECK (jsonb_typeof(features_snapshot) = 'array'),
  CONSTRAINT saas_plan_versions_period_valid CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT saas_plan_versions_plan_number_unique UNIQUE(plan_id, version_number)
);
GRANT SELECT ON public.saas_plan_versions TO authenticated;
GRANT ALL ON public.saas_plan_versions TO service_role;
ALTER TABLE public.saas_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_plan_versions_platform_read ON public.saas_plan_versions
  FOR SELECT TO authenticated
  USING (public.is_platform_superadmin((SELECT auth.uid())));

CREATE INDEX idx_saas_plan_versions_plan_effective
  ON public.saas_plan_versions(plan_id, effective_from DESC);
CREATE UNIQUE INDEX uq_saas_plan_versions_effective_from
  ON public.saas_plan_versions(plan_id, effective_from);

CREATE TABLE public.saas_plan_version_features (
  plan_version_id uuid NOT NULL REFERENCES public.saas_plan_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  feature_id uuid NOT NULL REFERENCES public.saas_features(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  enabled boolean NOT NULL,
  limit_value numeric NULL,
  config jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(plan_version_id, feature_id),
  CONSTRAINT saas_plan_version_features_limit_nonnegative CHECK (limit_value IS NULL OR limit_value >= 0),
  CONSTRAINT saas_plan_version_features_config_object CHECK (config IS NULL OR jsonb_typeof(config) = 'object')
);
GRANT SELECT ON public.saas_plan_version_features TO authenticated;
GRANT ALL ON public.saas_plan_version_features TO service_role;
ALTER TABLE public.saas_plan_version_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_plan_version_features_platform_read ON public.saas_plan_version_features
  FOR SELECT TO authenticated
  USING (public.is_platform_superadmin((SELECT auth.uid())));
CREATE INDEX idx_saas_plan_version_features_feature ON public.saas_plan_version_features(feature_id);

ALTER TABLE public.organization_subscriptions
  ADD COLUMN plan_version_id uuid NULL REFERENCES public.saas_plan_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD COLUMN price_snapshot numeric(14,2) NULL,
  ADD COLUMN currency_snapshot text NULL,
  ADD COLUMN billing_cycle_snapshot text NULL,
  ADD COLUMN limits_snapshot jsonb NULL,
  ADD COLUMN features_snapshot jsonb NULL,
  ADD COLUMN state_changed_at timestamptz NULL,
  ADD COLUMN last_correlation_id uuid NULL;
ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT org_subscriptions_price_snapshot_nonnegative CHECK (price_snapshot IS NULL OR price_snapshot >= 0),
  ADD CONSTRAINT org_subscriptions_currency_snapshot_format CHECK (currency_snapshot IS NULL OR currency_snapshot ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT org_subscriptions_cycle_snapshot_valid CHECK (billing_cycle_snapshot IS NULL OR billing_cycle_snapshot IN ('monthly','quarterly','semiannual','annual','custom')),
  ADD CONSTRAINT org_subscriptions_limits_snapshot_object CHECK (limits_snapshot IS NULL OR jsonb_typeof(limits_snapshot) = 'object'),
  ADD CONSTRAINT org_subscriptions_features_snapshot_array CHECK (features_snapshot IS NULL OR jsonb_typeof(features_snapshot) = 'array');
CREATE INDEX idx_org_subscriptions_plan_version ON public.organization_subscriptions(plan_version_id);
CREATE INDEX idx_org_subscriptions_trial_due ON public.organization_subscriptions(status, trial_ends_at)
  WHERE status = 'TRIAL';

CREATE POLICY saas_plan_versions_tenant_read_current ON public.saas_plan_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_subscriptions s
      WHERE s.plan_version_id = saas_plan_versions.id
        AND s.organization_id = public.h15_actor_organization()
        AND public.has_role((SELECT auth.uid()), 'administrador'::public.app_role)
    )
  );
CREATE POLICY saas_plan_version_features_tenant_read_current ON public.saas_plan_version_features
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_subscriptions s
      WHERE s.plan_version_id = saas_plan_version_features.plan_version_id
        AND s.organization_id = public.h15_actor_organization()
        AND public.has_role((SELECT auth.uid()), 'administrador'::public.app_role)
    )
  );

ALTER TABLE public.organization_subscription_history
  ADD COLUMN action text NULL,
  ADD COLUMN correlation_id uuid NULL,
  ADD COLUMN previous_status public.saas_subscription_status NULL,
  ADD COLUMN new_status public.saas_subscription_status NULL,
  ADD COLUMN previous_plan_id uuid NULL REFERENCES public.saas_plans(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD COLUMN new_plan_id uuid NULL REFERENCES public.saas_plans(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD COLUMN previous_plan_version_id uuid NULL REFERENCES public.saas_plan_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD COLUMN new_plan_version_id uuid NULL REFERENCES public.saas_plan_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD COLUMN price_snapshot numeric(14,2) NULL,
  ADD COLUMN currency_snapshot text NULL,
  ADD COLUMN billing_cycle_snapshot text NULL,
  ADD COLUMN limits_snapshot jsonb NULL,
  ADD COLUMN payment_event_id text NULL;
ALTER TABLE public.organization_subscription_history
  ADD CONSTRAINT org_sub_history_action_length CHECK (action IS NULL OR length(action) BETWEEN 2 AND 80),
  ADD CONSTRAINT org_sub_history_limits_snapshot_object CHECK (limits_snapshot IS NULL OR jsonb_typeof(limits_snapshot) = 'object'),
  ADD CONSTRAINT org_sub_history_price_nonnegative CHECK (price_snapshot IS NULL OR price_snapshot >= 0);
CREATE UNIQUE INDEX uq_org_sub_history_correlation
  ON public.organization_subscription_history(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE UNIQUE INDEX uq_org_sub_history_payment_event
  ON public.organization_subscription_history(payment_event_id) WHERE payment_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.saas_plan_version_no_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'saas_version_immutable: versões publicadas não podem ser alteradas';
END;
$$;
REVOKE ALL ON FUNCTION public.saas_plan_version_no_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER saas_plan_version_no_mutation
  BEFORE UPDATE OR DELETE ON public.saas_plan_versions
  FOR EACH ROW EXECUTE FUNCTION public.saas_plan_version_no_mutation();
CREATE TRIGGER saas_plan_version_features_no_mutation
  BEFORE UPDATE OR DELETE ON public.saas_plan_version_features
  FOR EACH ROW EXECUTE FUNCTION public.saas_plan_version_no_mutation();

CREATE OR REPLACE FUNCTION public.saas_subscription_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_reason text;
  v_action text;
  v_correlation uuid;
BEGIN
  v_new := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    IF v_old = v_new THEN RETURN NEW; END IF;
  END IF;
  v_reason := nullif(current_setting('app.saas_change_reason', true), '');
  v_action := nullif(current_setting('app.saas_change_action', true), '');
  BEGIN
    v_correlation := nullif(current_setting('app.saas_correlation_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_correlation := NULL;
  END;
  INSERT INTO public.organization_subscription_history(
    subscription_id, organization_id, actor_user_id, source, reason,
    old_values, new_values, action, correlation_id,
    previous_status, new_status, previous_plan_id, new_plan_id,
    previous_plan_version_id, new_plan_version_id,
    price_snapshot, currency_snapshot, billing_cycle_snapshot, limits_snapshot
  ) VALUES (
    NEW.id, NEW.organization_id, auth.uid(),
    CASE WHEN v_action = 'expire_trial' THEN 'system' ELSE 'rpc' END,
    COALESCE(v_reason, CASE WHEN TG_OP = 'INSERT' THEN 'subscription_created' ELSE 'subscription_updated' END),
    v_old, v_new, COALESCE(v_action, lower(TG_OP)), v_correlation,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.plan_id ELSE NULL END,
    NEW.plan_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.plan_version_id ELSE NULL END,
    NEW.plan_version_id,
    NEW.price_snapshot, NEW.currency_snapshot, NEW.billing_cycle_snapshot, NEW.limits_snapshot
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.saas_subscription_audit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_publish_plan_version(
  _plan_key text,
  _price_amount numeric,
  _currency text,
  _billing_cycle text,
  _limits jsonb,
  _effective_from timestamptz,
  _reason text,
  _correlation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_plan public.saas_plans%ROWTYPE;
  v_id uuid;
  v_version integer;
  v_features jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 OR _correlation_id IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: motivo e correlação obrigatórios';
  END IF;
  IF _price_amount IS NULL OR _price_amount < 0 OR upper(btrim(coalesce(_currency,''))) !~ '^[A-Z]{3}$'
     OR _billing_cycle NOT IN ('monthly','quarterly','semiannual','annual','custom')
     OR _limits IS NULL OR jsonb_typeof(_limits) <> 'object'
     OR _effective_from IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: versão comercial incompleta';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_subscription_history h WHERE h.correlation_id = _correlation_id) THEN
    RAISE EXCEPTION 'platform_conflict: correlação já utilizada';
  END IF;
  SELECT p.* INTO v_plan FROM public.saas_plans p WHERE p.key = _plan_key AND p.active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: plano inexistente ou inativo'; END IF;
  SELECT COALESCE(max(v.version_number),0)+1 INTO v_version
  FROM public.saas_plan_versions v WHERE v.plan_id = v_plan.id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'feature_id', pf.feature_id, 'enabled', pf.enabled,
    'limit_value', pf.limit_value, 'config', pf.config
  ) ORDER BY pf.feature_id::text), '[]'::jsonb)
  INTO v_features
  FROM public.saas_plan_features pf WHERE pf.plan_id = v_plan.id;
  INSERT INTO public.saas_plan_versions(
    plan_id, version_number, name_snapshot, description_snapshot,
    price_amount, currency, billing_cycle, limits_snapshot, features_snapshot,
    effective_from, created_by
  ) VALUES (
    v_plan.id, v_version, v_plan.name, v_plan.description,
    _price_amount, upper(btrim(_currency)), _billing_cycle, _limits, v_features,
    _effective_from, auth.uid()
  ) RETURNING id INTO v_id;
  INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled,limit_value,config)
  SELECT v_id,pf.feature_id,pf.enabled,pf.limit_value,pf.config
  FROM public.saas_plan_features pf WHERE pf.plan_id=v_plan.id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_publish_plan_version(text,numeric,text,text,jsonb,timestamptz,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_publish_plan_version(text,numeric,text,text,jsonb,timestamptz,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_transition_subscription(
  _organization_id uuid,
  _action text,
  _reason text,
  _correlation_id uuid,
  _plan_version_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_sub public.organization_subscriptions%ROWTYPE;
  v_version public.saas_plan_versions%ROWTYPE;
  v_now timestamptz := now();
  v_target public.saas_subscription_status;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 OR _correlation_id IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: motivo e correlação obrigatórios';
  END IF;
  IF _action NOT IN ('start_trial','activate_manual','change_plan','mark_past_due','suspend','reactivate_manual','cancel','expire_trial') THEN
    RAISE EXCEPTION 'platform_invalid: ação inválida';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_subscription_history h WHERE h.correlation_id = _correlation_id) THEN
    SELECT h.subscription_id INTO v_sub.id FROM public.organization_subscription_history h WHERE h.correlation_id=_correlation_id;
    RETURN v_sub.id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id=_organization_id) THEN
    RAISE EXCEPTION 'platform_invalid: empresa inexistente';
  END IF;
  SELECT * INTO v_sub FROM public.organization_subscriptions s
  WHERE s.organization_id=_organization_id
    AND s.status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')
  ORDER BY s.started_at DESC LIMIT 1 FOR UPDATE;
  IF _plan_version_id IS NOT NULL THEN
    SELECT * INTO v_version FROM public.saas_plan_versions v
    WHERE v.id=_plan_version_id AND v.effective_from <= v_now
      AND (v.effective_to IS NULL OR v.effective_to > v_now);
    IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: versão inexistente ou fora de vigência'; END IF;
  END IF;
  IF _action='start_trial' THEN
    IF v_sub.id IS NOT NULL OR _plan_version_id IS NULL THEN
      RAISE EXCEPTION 'platform_conflict: trial exige empresa sem assinatura corrente e versão vigente';
    END IF;
    PERFORM set_config('app.saas_change_reason',btrim(_reason),true);
    PERFORM set_config('app.saas_change_action',_action,true);
    PERFORM set_config('app.saas_correlation_id',_correlation_id::text,true);
    INSERT INTO public.organization_subscriptions(
      organization_id,plan_id,plan_version_id,status,started_at,trial_ends_at,
      price_snapshot,currency_snapshot,billing_cycle,billing_cycle_snapshot,
      limits_snapshot,features_snapshot,state_changed_at,last_correlation_id,created_by
    ) VALUES (
      _organization_id,v_version.plan_id,v_version.id,'TRIAL',v_now,v_now+interval '14 days',
      v_version.price_amount,v_version.currency,v_version.billing_cycle,v_version.billing_cycle,
      v_version.limits_snapshot,v_version.features_snapshot,v_now,_correlation_id,auth.uid()
    ) RETURNING * INTO v_sub;
    RETURN v_sub.id;
  END IF;
  IF v_sub.id IS NULL THEN RAISE EXCEPTION 'platform_invalid: assinatura corrente inexistente'; END IF;
  IF v_sub.plan_version_id IS NULL THEN RAISE EXCEPTION 'platform_conflict: assinatura legada exige regularização explícita'; END IF;
  IF _action='change_plan' AND _plan_version_id IS NULL THEN RAISE EXCEPTION 'platform_invalid: versão obrigatória'; END IF;
  IF _action='change_plan' AND v_sub.status NOT IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED') THEN RAISE EXCEPTION 'platform_conflict: transição inválida'; END IF;
  IF _action='activate_manual' AND v_sub.status <> 'TRIAL' THEN RAISE EXCEPTION 'platform_conflict: transição inválida'; END IF;
  IF _action='mark_past_due' AND v_sub.status <> 'ACTIVE' THEN RAISE EXCEPTION 'platform_conflict: transição inválida'; END IF;
  IF _action='suspend' AND v_sub.status NOT IN ('ACTIVE','PAST_DUE') THEN RAISE EXCEPTION 'platform_conflict: transição inválida'; END IF;
  IF _action='reactivate_manual' AND v_sub.status <> 'SUSPENDED' THEN RAISE EXCEPTION 'platform_conflict: transição inválida'; END IF;
  IF _action='cancel' AND v_sub.status NOT IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED') THEN RAISE EXCEPTION 'platform_conflict: transição inválida'; END IF;
  IF _action='expire_trial' AND (v_sub.status <> 'TRIAL' OR v_sub.trial_ends_at IS NULL OR v_sub.trial_ends_at > v_now) THEN RAISE EXCEPTION 'platform_conflict: trial não está vencido'; END IF;
  v_target := CASE _action
    WHEN 'activate_manual' THEN 'ACTIVE'::public.saas_subscription_status
    WHEN 'mark_past_due' THEN 'PAST_DUE'::public.saas_subscription_status
    WHEN 'suspend' THEN 'SUSPENDED'::public.saas_subscription_status
    WHEN 'reactivate_manual' THEN 'ACTIVE'::public.saas_subscription_status
    WHEN 'cancel' THEN 'CANCELLED'::public.saas_subscription_status
    WHEN 'expire_trial' THEN 'EXPIRED'::public.saas_subscription_status
    ELSE v_sub.status END;
  PERFORM set_config('app.saas_change_reason',btrim(_reason),true);
  PERFORM set_config('app.saas_change_action',_action,true);
  PERFORM set_config('app.saas_correlation_id',_correlation_id::text,true);
  UPDATE public.organization_subscriptions s SET
    plan_id=CASE WHEN _action='change_plan' THEN v_version.plan_id ELSE s.plan_id END,
    plan_version_id=CASE WHEN _action='change_plan' THEN v_version.id ELSE s.plan_version_id END,
    status=v_target,
    price_snapshot=CASE WHEN _action='change_plan' THEN v_version.price_amount ELSE s.price_snapshot END,
    currency_snapshot=CASE WHEN _action='change_plan' THEN v_version.currency ELSE s.currency_snapshot END,
    billing_cycle=CASE WHEN _action='change_plan' THEN v_version.billing_cycle ELSE s.billing_cycle END,
    billing_cycle_snapshot=CASE WHEN _action='change_plan' THEN v_version.billing_cycle ELSE s.billing_cycle_snapshot END,
    limits_snapshot=CASE WHEN _action='change_plan' THEN v_version.limits_snapshot ELSE s.limits_snapshot END,
    features_snapshot=CASE WHEN _action='change_plan' THEN v_version.features_snapshot ELSE s.features_snapshot END,
    suspended_at=CASE WHEN v_target='SUSPENDED' THEN COALESCE(s.suspended_at,v_now) ELSE NULL END,
    cancelled_at=CASE WHEN v_target='CANCELLED' THEN COALESCE(s.cancelled_at,v_now) ELSE NULL END,
    state_changed_at=v_now,
    last_correlation_id=_correlation_id
  WHERE s.id=v_sub.id;
  RETURN v_sub.id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_transition_subscription(uuid,text,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_transition_subscription(uuid,text,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_extend_trial(
  _subscription_id uuid,
  _new_trial_end timestamptz,
  _reason text,
  _correlation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE v_sub public.organization_subscriptions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 OR _correlation_id IS NULL THEN RAISE EXCEPTION 'platform_invalid: motivo e correlação obrigatórios'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_subscription_history h WHERE h.correlation_id=_correlation_id) THEN RETURN _subscription_id; END IF;
  SELECT * INTO v_sub FROM public.organization_subscriptions WHERE id=_subscription_id FOR UPDATE;
  IF NOT FOUND OR v_sub.status <> 'TRIAL' OR v_sub.plan_version_id IS NULL
     OR v_sub.trial_ends_at IS NULL OR _new_trial_end <= v_sub.trial_ends_at THEN
    RAISE EXCEPTION 'platform_conflict: extensão de trial inválida';
  END IF;
  PERFORM set_config('app.saas_change_reason',btrim(_reason),true);
  PERFORM set_config('app.saas_change_action','extend_trial',true);
  PERFORM set_config('app.saas_correlation_id',_correlation_id::text,true);
  UPDATE public.organization_subscriptions SET trial_ends_at=_new_trial_end,
    state_changed_at=now(),last_correlation_id=_correlation_id WHERE id=_subscription_id;
  RETURN _subscription_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_extend_trial(uuid,timestamptz,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_extend_trial(uuid,timestamptz,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_due_trials(_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_role text; v_count integer;
BEGIN
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''), nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role <> 'service_role' THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  IF _limit < 1 OR _limit > 500 THEN RAISE EXCEPTION 'platform_invalid: limite inválido'; END IF;
  PERFORM set_config('app.saas_change_reason','trial expirado automaticamente',true);
  PERFORM set_config('app.saas_change_action','expire_trial',true);
  WITH due AS (
    SELECT id FROM public.organization_subscriptions
    WHERE status='TRIAL' AND plan_version_id IS NOT NULL AND trial_ends_at IS NOT NULL AND trial_ends_at <= now()
    ORDER BY trial_ends_at FOR UPDATE SKIP LOCKED LIMIT _limit
  )
  UPDATE public.organization_subscriptions s SET status='EXPIRED',state_changed_at=now()
  FROM due WHERE s.id=due.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_due_trials(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_due_trials(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS TABLE(module_key text, feature_key text, limit_value numeric, config jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH my_org AS (
    SELECT pr.organization_id
    FROM public.profiles pr
    JOIN public.organizations o ON o.id=pr.organization_id AND o.ativo
    WHERE pr.user_id=auth.uid() AND pr.ativo AND pr.organization_id IS NOT NULL
    ORDER BY pr.created_at LIMIT 1
  ),
  my_sub AS (
    SELECT s.id,s.organization_id,s.plan_version_id
    FROM public.organization_subscriptions s
    WHERE s.organization_id=(SELECT organization_id FROM my_org)
      AND s.plan_version_id IS NOT NULL
      AND s.status IN ('TRIAL','ACTIVE')
      AND (s.status <> 'TRIAL' OR (s.trial_ends_at IS NOT NULL AND s.trial_ends_at > now()))
      AND (s.cancel_at IS NULL OR s.cancel_at > now())
    ORDER BY s.started_at DESC LIMIT 1
  ),
  ov AS (
    SELECT x.feature_id,x.mode,x.limit_value
    FROM public.organization_feature_overrides x
    WHERE x.organization_id=(SELECT organization_id FROM my_org)
      AND x.ended_at IS NULL AND x.starts_at<=now() AND (x.ends_at IS NULL OR x.ends_at>now())
  ),
  base AS (
    SELECT vf.feature_id,vf.limit_value,vf.config
    FROM my_sub
    JOIN public.saas_plan_version_features vf ON vf.plan_version_id=my_sub.plan_version_id AND vf.enabled
  ),
  eff AS (
    SELECT b.feature_id,coalesce(o.limit_value,b.limit_value) limit_value,b.config
    FROM base b LEFT JOIN ov o ON o.feature_id=b.feature_id
    WHERE coalesce(o.mode,'GRANT') <> 'REVOKE'
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
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT _uid IS NOT NULL AND _uid=auth.uid() AND EXISTS(
    SELECT 1 FROM public.get_my_entitlements() e WHERE e.feature_key=_feature_key
  );
$$;
REVOKE ALL ON FUNCTION public._saas_user_has_feature(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._saas_user_has_feature(uuid,text) TO authenticated;

DROP FUNCTION IF EXISTS public.platform_change_subscription(uuid,text,text,text);

COMMIT;