DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','fazendas','talhoes','ordens_servico','programacao_producao','lotes','envase','controle_qualidade',
    'accounts_receivable','accounts_payable','accounts_receivable_installments','accounts_payable_installments',
    'receivable_payments','payable_payments','financial_receipts','financial_report_exports','financial_documents',
    'fiscal_invoices','fiscal_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='tenant_isolation_d51_5' LOOP
        EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
      END LOOP;
      EXECUTE format('CREATE POLICY tenant_isolation_d51_5 ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (organization_id IS NOT NULL AND organization_id = public.h15_actor_organization()) WITH CHECK (organization_id IS NOT NULL AND organization_id = public.h15_actor_organization())',t);
    END IF;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_fin_cashflow(date,date,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_fin_dre_summary(date,date,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_financial_cashflow(date,date,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_financial_dre_summary(date,date,text,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_report_accountability(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_report_customer_statement(uuid,date,date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_report_delinquency(date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_report_deliveries_billing_status(date,date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_report_monthly_financial(date,date,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_report_nfe_pending(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_report_payables(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_report_receivables(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.register_financial_report_export(text,text,jsonb,text,text,text,text) FROM authenticated;
