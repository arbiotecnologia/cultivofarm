BEGIN;
CREATE OR REPLACE FUNCTION public.saas_history_no_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  RAISE EXCEPTION 'saas_history_immutable: histórico não pode ser alterado' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION public.saas_history_no_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS organization_subscription_history_no_mutation_trg ON public.organization_subscription_history;
CREATE TRIGGER organization_subscription_history_no_mutation_trg BEFORE UPDATE OR DELETE ON public.organization_subscription_history FOR EACH ROW EXECUTE FUNCTION public.saas_history_no_mutation();
COMMIT;