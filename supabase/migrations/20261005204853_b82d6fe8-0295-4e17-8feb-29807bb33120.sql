DO $audit$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname IN (
       'tenant_isolation_d51_5',
       'd51_5_catalog_global_mutation',
       'd51_5_microorganism_global_mutation',
       'd51_5_system_config_global_mutation',
       'd51_5_financial_settings_global_mutation',
       'd51_5_onfarm_tenant_guard',
       'd51_5_partner_accounts_tenant_guard',
       'd51_5_production_planning_tenant_guard'
     )
     AND permissive = 'RESTRICTIVE';
  IF v_bad < 28 THEN
    RAISE EXCEPTION 'd51_5_live_restrictive_policy_regression:%', v_bad;
  END IF;

  IF has_function_privilege('authenticated', 'public.get_financial_cashflow(date,date,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_financial_dre_summary(date,date,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_report_receivables(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_report_payables(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'd51_5_financial_fail_closed_regression';
  END IF;
END
$audit$;