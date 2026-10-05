BEGIN;

CREATE OR REPLACE FUNCTION public.platform_extend_trial(_subscription_id uuid,_new_trial_end timestamptz,_reason text,_correlation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE v_sub public.organization_subscriptions%ROWTYPE; v_existing uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  IF _reason IS NULL OR length(btrim(_reason))<5 OR _correlation_id IS NULL THEN RAISE EXCEPTION 'platform_invalid: motivo e correlação obrigatórios' USING ERRCODE='22023'; END IF;
  SELECT h.subscription_id INTO v_existing FROM public.organization_subscription_history h WHERE h.correlation_id=_correlation_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  SELECT * INTO v_sub FROM public.organization_subscriptions WHERE id=_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: assinatura inexistente' USING ERRCODE='22023'; END IF;
  SELECT h.subscription_id INTO v_existing FROM public.organization_subscription_history h WHERE h.correlation_id=_correlation_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  IF v_sub.status<>'TRIAL' OR v_sub.plan_version_id IS NULL OR v_sub.trial_ends_at IS NULL OR _new_trial_end<=v_sub.trial_ends_at OR _new_trial_end>v_sub.trial_ends_at+interval '14 days' THEN RAISE EXCEPTION 'platform_conflict: extensão de trial inválida' USING ERRCODE='40001'; END IF;
  PERFORM platform_private.issue_ticket('saas_subscription_write',v_sub.organization_id);
  PERFORM set_config('app.saas_change_reason',btrim(_reason),true); PERFORM set_config('app.saas_change_action','extend_trial',true); PERFORM set_config('app.saas_correlation_id',_correlation_id::text,true);
  UPDATE public.organization_subscriptions SET trial_ends_at=_new_trial_end,state_changed_at=now(),last_correlation_id=_correlation_id WHERE id=_subscription_id;
  RETURN _subscription_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_extend_trial(uuid,timestamptz,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_extend_trial(uuid,timestamptz,text,uuid) TO authenticated;

COMMIT;