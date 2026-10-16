-- REVIEW ONLY, read-only. Run on swzpzcwiasxmjutrmvkm after proving the ref externally.
SELECT
 to_regclass('platform_private.tenant_smtp_test_receipts') IS NOT NULL AS f23_receipts,
 to_regnamespace('tenant_smtp_executor') IS NOT NULL AS executor_schema,
 NOT has_schema_privilege('service_role','platform_private','USAGE') AS private_closed_to_service,
 has_schema_privilege('service_role','tenant_smtp_executor','USAGE') AS executor_open_to_service,
 to_regclass('platform_private.tenant_smtp_f4_gate') IS NULL AS f4_not_applied_yet,
 (SELECT count(*) FROM platform_private.tenant_smtp_test_receipts WHERE state<>'complete') AS pending_receipts,
 (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.communication_tenant_email_settings'::regclass AND NOT tgisinternal) AS settings_triggers;
-- Expected: true,true,true,true,true,0,(T1 count; F4 adds exactly one).
