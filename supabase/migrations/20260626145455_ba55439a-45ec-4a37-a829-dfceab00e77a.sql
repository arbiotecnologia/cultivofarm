
-- =========================================================================
-- Auditoria Financeira — Fase 1+2
-- Corrige divergências entre permissions.ts (frontend) e RLS,
-- e reforça defesa em profundidade revogando acesso de anon.
-- Idempotente. Não altera dados.
-- =========================================================================

-- 1) Revogar acesso de anon em tabelas financeiras (defesa em profundidade).
--    RLS já bloqueia, mas mantemos o princípio de privilégio mínimo.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'financial_categories','financial_cost_centers','payment_methods','bank_accounts','financial_settings',
    'accounts_receivable','accounts_receivable_installments','receivable_payments',
    'accounts_payable','accounts_payable_installments','payable_payments',
    'financial_documents','financial_receipts','financial_report_exports','financial_audit_log',
    'fiscal_invoices','partner_financial_settings','partner_order_financial_links',
    'financial_governance_rules','financial_governance_audit_log'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- 2) Leitura B2B para gestor_comercial e administrativo.
--    Escopo restrito: apenas linhas com origin_type='B2B_ORDER'.

DROP POLICY IF EXISTS ar_b2b_readers ON public.accounts_receivable;
CREATE POLICY ar_b2b_readers ON public.accounts_receivable
FOR SELECT TO authenticated
USING (
  origin_type = 'B2B_ORDER'
  AND (has_role(auth.uid(),'gestor_comercial'::app_role)
       OR has_role(auth.uid(),'administrativo'::app_role))
);

DROP POLICY IF EXISTS ari_b2b_readers ON public.accounts_receivable_installments;
CREATE POLICY ari_b2b_readers ON public.accounts_receivable_installments
FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(),'gestor_comercial'::app_role)
   OR has_role(auth.uid(),'administrativo'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.accounts_receivable ar
    WHERE ar.id = accounts_receivable_installments.receivable_id
      AND ar.origin_type = 'B2B_ORDER'
  )
);

-- 3) Tabelas auxiliares B2B: leitura para gestor_comercial e administrativo.

DROP POLICY IF EXISTS pfs_b2b_readers ON public.partner_financial_settings;
CREATE POLICY pfs_b2b_readers ON public.partner_financial_settings
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'gestor_comercial'::app_role)
  OR has_role(auth.uid(),'administrativo'::app_role)
);

DROP POLICY IF EXISTS pofl_b2b_readers ON public.partner_order_financial_links;
CREATE POLICY pofl_b2b_readers ON public.partner_order_financial_links
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'gestor_comercial'::app_role)
  OR has_role(auth.uid(),'administrativo'::app_role)
);

DROP POLICY IF EXISTS fgr_b2b_readers ON public.financial_governance_rules;
CREATE POLICY fgr_b2b_readers ON public.financial_governance_rules
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'gestor_comercial'::app_role)
  OR has_role(auth.uid(),'administrativo'::app_role)
);

DROP POLICY IF EXISTS fgal_b2b_readers ON public.financial_governance_audit_log;
CREATE POLICY fgal_b2b_readers ON public.financial_governance_audit_log
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'gestor_comercial'::app_role)
  OR has_role(auth.uid(),'administrativo'::app_role)
);
