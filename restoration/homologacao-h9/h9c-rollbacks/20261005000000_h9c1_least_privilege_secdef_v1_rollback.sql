-- H9-C1 — ROLLBACK nominal: restaura o EXECUTE de authenticated exatamente como estava
-- antes de 20261005000000 (ACL original observada em homologação):
--   check_partner_order_sla        -> {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   rpc_fiscal_xml_record_v1       -> {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}
-- Uso exclusivo em homologação ikaauvsflpmamgxmkhoq. Produção PROIBIDA.
BEGIN;

GRANT EXECUTE ON FUNCTION public.check_partner_order_sla() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_xml_record_v1(uuid, text, jsonb) TO authenticated;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005000000';

COMMIT;
