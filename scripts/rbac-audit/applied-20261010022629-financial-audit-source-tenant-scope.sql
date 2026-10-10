-- Restrict audit reads to server-proven current-tenant source records.
-- Existing financial staff policy still applies; no grant, write or history rewrite.
-- Unknown, deleted or unowned sources fail closed until individually reconciled.
CREATE POLICY financial_audit_source_tenant_scope
ON public.financial_audit_log AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  (SELECT public.h15_actor_organization()) IS NOT NULL
  AND CASE
    WHEN financial_audit_log.entity_type IN ('accounts_receivable') THEN EXISTS (
      SELECT 1 FROM public.accounts_receivable AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    WHEN financial_audit_log.entity_type IN ('accounts_payable') THEN EXISTS (
      SELECT 1 FROM public.accounts_payable AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    WHEN financial_audit_log.entity_type IN ('accounts_receivable_installments') THEN EXISTS (
      SELECT 1 FROM public.accounts_receivable_installments AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    WHEN financial_audit_log.entity_type IN ('accounts_payable_installments') THEN EXISTS (
      SELECT 1 FROM public.accounts_payable_installments AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    WHEN financial_audit_log.entity_type IN ('receivable_payments') THEN EXISTS (
      SELECT 1 FROM public.receivable_payments AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    WHEN financial_audit_log.entity_type IN ('payable_payments') THEN EXISTS (
      SELECT 1 FROM public.payable_payments AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    WHEN financial_audit_log.entity_type IN ('financial_documents') THEN EXISTS (
      SELECT 1 FROM public.financial_documents AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    WHEN financial_audit_log.entity_type IN ('financial_receipts') THEN EXISTS (
      SELECT 1 FROM public.financial_receipts AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    WHEN financial_audit_log.entity_type IN ('financial_report_exports') THEN EXISTS (
      SELECT 1 FROM public.financial_report_exports AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    WHEN financial_audit_log.entity_type IN ('fiscal_invoices') THEN EXISTS (
      SELECT 1 FROM public.fiscal_invoices AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    WHEN financial_audit_log.entity_type IN ('recurring_financial_templates', 'RECURRING_TEMPLATE') THEN EXISTS (
      SELECT 1 FROM public.recurring_financial_templates AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    WHEN financial_audit_log.entity_type IN ('entrega', 'entregas') THEN EXISTS (
      SELECT 1 FROM public.entregas AS source
      WHERE source.id = financial_audit_log.entity_id
        AND source.organization_id = (SELECT public.h15_actor_organization())
    )
    ELSE false
  END
);
