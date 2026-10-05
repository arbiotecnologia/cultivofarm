BEGIN;
CREATE OR REPLACE FUNCTION public.saas_trial_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.status='TRIAL' AND NEW.plan_version_id IS NOT NULL AND (NEW.started_at IS NULL OR NEW.trial_ends_at IS NULL OR NEW.trial_ends_at<>NEW.started_at+interval '14 days') THEN
    RAISE EXCEPTION 'platform_invalid: trial novo deve ter exatamente 14 dias' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.saas_trial_validate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS saas_trial_validate_trg ON public.organization_subscriptions;
CREATE TRIGGER saas_trial_validate_trg BEFORE INSERT ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION public.saas_trial_validate();
COMMIT;