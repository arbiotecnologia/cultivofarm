CREATE OR REPLACE FUNCTION public.d51_5_validate_financial_tenant_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_org uuid;
  v_parent_id uuid;
BEGIN
  BEGIN
    v_org := NULLIF(v_new->>'organization_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_INVALID' USING ERRCODE = '23514';
  END;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'accounts_receivable' THEN
    v_parent_id := NULLIF(v_new->>'customer_id', '')::uuid;
    IF v_parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.clientes c WHERE c.id = v_parent_id AND c.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_CUSTOMER_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'accounts_receivable_installments' THEN
    v_parent_id := NULLIF(v_new->>'receivable_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_receivable ar WHERE ar.id = v_parent_id AND ar.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIVABLE_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'accounts_payable_installments' THEN
    v_parent_id := NULLIF(v_new->>'payable_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_payable ap WHERE ap.id = v_parent_id AND ap.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_PAYABLE_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'receivable_payments' THEN
    v_parent_id := NULLIF(v_new->>'installment_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_receivable_installments ari WHERE ari.id = v_parent_id AND ari.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIVABLE_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'payable_payments' THEN
    v_parent_id := NULLIF(v_new->>'installment_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.accounts_payable_installments api WHERE api.id = v_parent_id AND api.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_PAYABLE_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'financial_receipts' THEN
    v_parent_id := NULLIF(v_new->>'customer_id', '')::uuid;
    IF v_parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.clientes c WHERE c.id = v_parent_id AND c.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIPT_CUSTOMER_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
    v_parent_id := NULLIF(v_new->>'payment_id', '')::uuid;
    IF v_parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.receivable_payments rp WHERE rp.id = v_parent_id AND rp.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'FINANCIAL_RECEIPT_PAYMENT_TENANT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.d51_5_validate_financial_tenant_links() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.d51_5_validate_financial_tenant_links() TO service_role;