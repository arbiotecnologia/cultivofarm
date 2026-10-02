CREATE OR REPLACE FUNCTION public.platform_change_subscription(
  _organization_id uuid, _plan_key text, _status text, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_plan uuid;
  v_id uuid;
  v_status public.saas_subscription_status;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'platform_invalid: motivo obrigatório';
  END IF;
  IF _status NOT IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED') THEN
    RAISE EXCEPTION 'platform_invalid: situação inválida';
  END IF;

  v_status := _status::public.saas_subscription_status;

  SELECT p.id
    INTO v_plan
    FROM public.saas_plans p
   WHERE p.key = _plan_key
     AND p.active;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: plano inexistente ou inativo';
  END IF;

  PERFORM set_config('app.saas_change_reason', btrim(_reason), true);

  SELECT s.id
    INTO v_id
    FROM public.organization_subscriptions s
   WHERE s.organization_id = _organization_id
     AND s.status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')
   ORDER BY s.started_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.organizations o
       WHERE o.id = _organization_id
    ) THEN
      RAISE EXCEPTION 'platform_invalid: empresa inexistente';
    END IF;

    INSERT INTO public.organization_subscriptions(
      organization_id, plan_id, status, started_at, suspended_at, cancelled_at, created_by
    )
    VALUES (
      _organization_id,
      v_plan,
      v_status,
      now(),
      CASE WHEN v_status = 'SUSPENDED' THEN now() ELSE NULL END,
      CASE WHEN v_status = 'CANCELLED' THEN now() ELSE NULL END,
      auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.organization_subscriptions
       SET plan_id = v_plan,
           status = v_status,
           suspended_at = CASE
             WHEN v_status = 'SUSPENDED' THEN COALESCE(suspended_at, now())
             ELSE NULL
           END,
           cancelled_at = CASE
             WHEN v_status = 'CANCELLED' THEN COALESCE(cancelled_at, now())
             ELSE NULL
           END
     WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_change_subscription(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_change_subscription(uuid,text,text,text) TO authenticated, service_role;