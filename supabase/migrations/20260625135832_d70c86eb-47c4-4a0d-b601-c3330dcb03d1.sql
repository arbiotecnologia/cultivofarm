DO $mig$
DECLARE
  fn_def text;
  fn record;
BEGIN
  FOR fn IN
    SELECT oid, proname FROM pg_proc
     WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
       AND proname IN ('get_financial_alerts','get_financial_dashboard_summary','fn_fin_dashboard_kpis')
  LOOP
    fn_def := pg_get_functiondef(fn.oid);
    -- Replace only when in the recurring_generation_log context
    fn_def := regexp_replace(fn_def, 'recurring_generation_log\s+WHERE status\s*=\s*''FAILED''\s+AND created_at', 'recurring_generation_log WHERE status = ''FAILED'' AND generated_at', 'gi');
    EXECUTE fn_def;
  END LOOP;
END
$mig$;