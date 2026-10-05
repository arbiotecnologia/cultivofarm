BEGIN;
CREATE OR REPLACE FUNCTION public.saas_no_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  RAISE EXCEPTION 'saas_history_immutable: dados de assinatura não podem ser apagados' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION public.saas_no_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS organization_subscriptions_no_delete_trg ON public.organization_subscriptions;
CREATE TRIGGER organization_subscriptions_no_delete_trg BEFORE DELETE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
DROP TRIGGER IF EXISTS organization_subscription_history_no_delete_trg ON public.organization_subscription_history;
CREATE TRIGGER organization_subscription_history_no_delete_trg BEFORE DELETE ON public.organization_subscription_history FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
COMMIT;