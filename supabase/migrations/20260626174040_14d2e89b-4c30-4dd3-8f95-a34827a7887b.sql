
DO $$
DECLARE
  fn text;
  sig text;
BEGIN
  FOR fn, sig IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rpc_register_receivable_payment','rpc_register_payable_payment',
        'fn_generate_receivable_from_entrega','issue_financial_receipt','cancel_financial_receipt',
        'fn_reverse_payment','get_financial_dre_summary','get_financial_cashflow',
        'get_financial_dashboard_summary','get_financial_report_data',
        'register_financial_report_export','rpc_upsert_fiscal_invoice_manual',
        'generate_b2b_receivable_secure','cancel_b2b_receivable_secure'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, PUBLIC', fn, sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', fn, sig);
  END LOOP;
END$$;
