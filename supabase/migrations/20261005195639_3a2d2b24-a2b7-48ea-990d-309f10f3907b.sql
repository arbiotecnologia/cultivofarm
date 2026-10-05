DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','fazendas','talhoes','ordens_servico','programacao_producao','lotes','envase','controle_qualidade',
    'accounts_receivable','accounts_payable','accounts_receivable_installments','accounts_payable_installments',
    'receivable_payments','payable_payments','financial_receipts','financial_report_exports','financial_documents',
    'fiscal_invoices','fiscal_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id)', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id)', t || '_organization_id_idx', t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guard_tenant_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  v_org := public.h15_actor_organization();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'tenant_context_required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.organization_id IS NULL THEN
    NEW.organization_id := v_org;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'tenant_scope_violation' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'tenant_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','fazendas','talhoes','ordens_servico','programacao_producao','lotes','envase','controle_qualidade',
    'accounts_receivable','accounts_payable','accounts_receivable_installments','accounts_payable_installments',
    'receivable_payments','payable_payments','financial_receipts','financial_report_exports','financial_documents',
    'fiscal_invoices','fiscal_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tenant_organization_guard ON public.%I', t);
      EXECUTE format('CREATE TRIGGER tenant_organization_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_organization_id()', t);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.guard_tenant_organization_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_tenant_organization_id() TO service_role;
