CREATE OR REPLACE FUNCTION public.cliente_storage_object_permitted(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_parts text[];
  v_cliente uuid;
BEGIN
  v_org := public.h15_actor_organization();
  v_parts := storage.foldername(_name);
  IF v_org IS NULL
     OR array_length(v_parts, 1) < 3
     OR v_parts[1] <> v_org::text
     OR v_parts[2] <> 'clientes' THEN
    RETURN false;
  END IF;
  BEGIN
    v_cliente := v_parts[3]::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1
      FROM public.clientes c
     WHERE c.id = v_cliente
       AND c.organization_id = v_org
       AND public.can_user_access_cliente(c.id)
  );
END
$$;
REVOKE ALL ON FUNCTION public.cliente_storage_object_permitted(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_storage_object_permitted(text) TO authenticated, service_role;

DROP POLICY IF EXISTS tenant_isolation_d51_5 ON public.cliente_documentos;
CREATE POLICY tenant_isolation_d51_5
ON public.cliente_documentos
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clientes c
     WHERE c.id = cliente_documentos.cliente_id
       AND c.organization_id IS NOT NULL
       AND c.organization_id = public.h15_actor_organization()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clientes c
     WHERE c.id = cliente_documentos.cliente_id
       AND c.organization_id IS NOT NULL
       AND c.organization_id = public.h15_actor_organization()
  )
);

CREATE OR REPLACE FUNCTION public.d51_5_validate_financial_tenant_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'accounts_receivable' AND NEW.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id = NEW.customer_id AND c.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_CUSTOMER_TENANT_MISMATCH' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'accounts_receivable_installments' AND NOT EXISTS (
    SELECT 1 FROM public.accounts_receivable ar WHERE ar.id = NEW.receivable_id AND ar.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_RECEIVABLE_TENANT_MISMATCH' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'accounts_payable_installments' AND NOT EXISTS (
    SELECT 1 FROM public.accounts_payable ap WHERE ap.id = NEW.payable_id AND ap.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_PAYABLE_TENANT_MISMATCH' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'receivable_payments' AND NOT EXISTS (
    SELECT 1 FROM public.accounts_receivable_installments ari WHERE ari.id = NEW.installment_id AND ari.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_RECEIVABLE_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'payable_payments' AND NOT EXISTS (
    SELECT 1 FROM public.accounts_payable_installments api WHERE api.id = NEW.installment_id AND api.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_PAYABLE_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'financial_receipts' THEN
    IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.clientes c WHERE c.id = NEW.customer_id AND c.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIPT_CUSTOMER_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.receivable_payments rp WHERE rp.id = NEW.payment_id AND rp.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIPT_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.d51_5_validate_financial_tenant_links() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.d51_5_validate_financial_tenant_links() TO service_role;

DROP TRIGGER IF EXISTS d51_5_validate_tenant_links ON public.accounts_receivable;
CREATE TRIGGER d51_5_validate_tenant_links BEFORE INSERT OR UPDATE OF organization_id, customer_id ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.d51_5_validate_financial_tenant_links();
DROP TRIGGER IF EXISTS d51_5_validate_tenant_links ON public.accounts_receivable_installments;
CREATE TRIGGER d51_5_validate_tenant_links BEFORE INSERT OR UPDATE OF organization_id, receivable_id ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION public.d51_5_validate_financial_tenant_links();
DROP TRIGGER IF EXISTS d51_5_validate_tenant_links ON public.accounts_payable_installments;
CREATE TRIGGER d51_5_validate_tenant_links BEFORE INSERT OR UPDATE OF organization_id, payable_id ON public.accounts_payable_installments FOR EACH ROW EXECUTE FUNCTION public.d51_5_validate_financial_tenant_links();
DROP TRIGGER IF EXISTS d51_5_validate_tenant_links ON public.receivable_payments;
CREATE TRIGGER d51_5_validate_tenant_links BEFORE INSERT OR UPDATE OF organization_id, installment_id ON public.receivable_payments FOR EACH ROW EXECUTE FUNCTION public.d51_5_validate_financial_tenant_links();
DROP TRIGGER IF EXISTS d51_5_validate_tenant_links ON public.payable_payments;
CREATE TRIGGER d51_5_validate_tenant_links BEFORE INSERT OR UPDATE OF organization_id, installment_id ON public.payable_payments FOR EACH ROW EXECUTE FUNCTION public.d51_5_validate_financial_tenant_links();
DROP TRIGGER IF EXISTS d51_5_validate_tenant_links ON public.financial_receipts;
CREATE TRIGGER d51_5_validate_tenant_links BEFORE INSERT OR UPDATE OF organization_id, customer_id, payment_id ON public.financial_receipts FOR EACH ROW EXECUTE FUNCTION public.d51_5_validate_financial_tenant_links();