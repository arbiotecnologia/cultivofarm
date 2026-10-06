BEGIN;
CREATE OR REPLACE FUNCTION public.saas_subscription_require_published_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_status text; v_trial_days integer;
BEGIN
  IF NEW.plan_version_id IS NULL THEN RETURN NEW; END IF;
  SELECT status,trial_days INTO v_status,v_trial_days FROM public.saas_plan_versions WHERE id=NEW.plan_version_id;
  IF v_status IS DISTINCT FROM 'PUBLISHED' THEN RAISE EXCEPTION 'platform_invalid: assinatura exige versão publicada' USING ERRCODE='22023'; END IF;
  IF NEW.status='TRIAL' AND (TG_OP='INSERT' OR OLD.plan_version_id IS DISTINCT FROM NEW.plan_version_id) THEN
    IF v_trial_days IS NULL THEN RAISE EXCEPTION 'platform_invalid: versão sem período de teste'; END IF;
    NEW.trial_ends_at:=coalesce(NEW.started_at,now())+make_interval(days=>v_trial_days);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.saas_subscription_require_published_version() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS saas_subscription_require_published_version_trg ON public.organization_subscriptions;
CREATE TRIGGER saas_subscription_require_published_version_trg BEFORE INSERT OR UPDATE OF plan_version_id,status,started_at ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_require_published_version();
COMMIT;