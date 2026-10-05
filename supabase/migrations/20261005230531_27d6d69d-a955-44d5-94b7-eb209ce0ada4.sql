BEGIN;

GRANT INSERT ON public.saas_plan_versions TO authenticated;
GRANT INSERT ON public.saas_plan_version_features TO authenticated;

CREATE POLICY saas_plan_versions_platform_insert ON public.saas_plan_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())) AND created_by = (SELECT auth.uid()));
CREATE POLICY saas_plan_version_features_platform_insert ON public.saas_plan_version_features
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_superadmin((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.saas_plan_versions v
      WHERE v.id = saas_plan_version_features.plan_version_id
        AND v.created_by = (SELECT auth.uid())
    )
  );

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
  IF _action NOT IN ('start_trial','change_plan','mark_past_due','suspend','reactivate_manual','cancel','expire_trial') THEN
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
  IF _action='mark_past_due' AND v_sub.status <> 'ACTIVE' THEN RAISE EXCEPTION 'platform_conflict: transição inválida'; END IF;
  IF _action='suspend' AND v_sub.status NOT IN ('ACTIVE','PAST_DUE') THEN RAISE EXCEPTION 'platform_conflict: transição inválida'; END IF;
  IF _action='reactivate_manual' AND v_sub.status <> 'SUSPENDED' THEN RAISE EXCEPTION 'platform_conflict: transição inválida'; END IF;
  IF _action='cancel' AND v_sub.status NOT IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED') THEN RAISE EXCEPTION 'platform_conflict: transição inválida'; END IF;
  IF _action='expire_trial' AND (v_sub.status <> 'TRIAL' OR v_sub.trial_ends_at IS NULL OR v_sub.trial_ends_at > v_now) THEN RAISE EXCEPTION 'platform_conflict: trial não está vencido'; END IF;
  v_target := CASE _action
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

CREATE OR REPLACE FUNCTION public.expire_due_trials(_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_role text; v_count integer;
BEGIN
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''), nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF current_user <> 'postgres' AND v_role <> 'service_role' THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
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

CREATE OR REPLACE FUNCTION public.platform_create_organization(_nome text,_nome_fantasia text,_cnpj text,_email text,_plan_key text,_rascunho boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_id uuid; v_cnpj text; v_plan uuid; v_status text; v_version public.saas_plan_versions%ROWTYPE; v_now timestamptz:=now();
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING errcode='42501'; END IF;
  IF _nome IS NULL OR length(btrim(_nome))<2 OR length(_nome)>200 THEN RAISE EXCEPTION 'platform_invalid: nome/razão social obrigatório'; END IF;
  IF length(coalesce(_nome_fantasia,''))>200 THEN RAISE EXCEPTION 'platform_invalid: nome fantasia muito longo'; END IF;
  IF _email IS NULL OR length(_email)>255 OR btrim(_email)!~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'platform_invalid: e-mail corporativo inválido'; END IF;
  v_cnpj:=platform_private.cnpj_normalizar(_cnpj);
  IF v_cnpj IS NOT NULL AND NOT platform_private.cnpj_valido(v_cnpj) THEN RAISE EXCEPTION 'platform_invalid: CNPJ inválido (dígitos verificadores)'; END IF;
  IF v_cnpj IS NULL AND NOT coalesce(_rascunho,false) THEN RAISE EXCEPTION 'platform_invalid: sem CNPJ, crie como rascunho'; END IF;
  IF v_cnpj IS NOT NULL AND EXISTS(SELECT 1 FROM public.organizations WHERE cnpj_normalizado=v_cnpj) THEN RAISE EXCEPTION 'platform_duplicate: CNPJ já cadastrado' USING errcode='23505'; END IF;
  SELECT p.id INTO v_plan FROM public.saas_plans p WHERE p.key=_plan_key AND p.active;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'platform_invalid: plano inexistente ou inativo'; END IF;
  SELECT * INTO v_version FROM public.saas_plan_versions v
  WHERE v.plan_id=v_plan AND v.effective_from<=v_now AND (v.effective_to IS NULL OR v.effective_to>v_now)
  ORDER BY v.effective_from DESC,v.version_number DESC LIMIT 1;
  IF NOT FOUND OR v_version.price_amount IS NULL OR v_version.currency IS NULL OR v_version.billing_cycle IS NULL THEN
    RAISE EXCEPTION 'platform_conflict: plano sem versão comercial vigente';
  END IF;
  v_status:=CASE WHEN coalesce(_rascunho,false) THEN 'rascunho' ELSE 'aguardando_ativacao' END;
  PERFORM platform_private.issue_ticket('org_create','00000000-0000-0000-0000-000000000000'::uuid);
  INSERT INTO public.organizations(nome,razao_social,nome_fantasia,cnpj,cnpj_normalizado,email_corporativo,status,ativo)
  VALUES(btrim(_nome),btrim(_nome),nullif(btrim(coalesce(_nome_fantasia,'')),''),v_cnpj,v_cnpj,lower(btrim(_email)),v_status,true)
  RETURNING id INTO v_id;
  PERFORM set_config('app.saas_change_reason','trial de 14 dias iniciado na criação',true);
  PERFORM set_config('app.saas_change_action','start_trial',true);
  INSERT INTO public.organization_subscriptions(
    organization_id,plan_id,plan_version_id,status,started_at,trial_ends_at,
    price_snapshot,currency_snapshot,billing_cycle,billing_cycle_snapshot,
    limits_snapshot,features_snapshot,state_changed_at,created_by
  ) VALUES(
    v_id,v_plan,v_version.id,'TRIAL',v_now,v_now+interval '14 days',
    v_version.price_amount,v_version.currency,v_version.billing_cycle,v_version.billing_cycle,
    v_version.limits_snapshot,v_version.features_snapshot,v_now,auth.uid()
  );
  INSERT INTO public.organization_status_audit(organization_id,status_anterior,status_novo,ator_id,motivo)
  VALUES(v_id,NULL,v_status,auth.uid(),'criação pela plataforma');
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_create_organization(text,text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_organization(text,text,text,text,text,boolean) TO authenticated;

DO $$
DECLARE v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname='saas-expire-due-trials';
  IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
  PERFORM cron.schedule('saas-expire-due-trials','15 2 * * *',$job$SELECT public.expire_due_trials(100);$job$);
END $$;

COMMIT;