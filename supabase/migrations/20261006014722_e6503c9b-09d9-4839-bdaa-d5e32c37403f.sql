BEGIN;
CREATE POLICY saas_billing_customers_service_only ON public.saas_billing_customers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY saas_billing_contracts_service_only ON public.saas_billing_contracts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY saas_payment_events_service_only ON public.saas_payment_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY saas_payment_outbox_service_only ON public.saas_payment_outbox FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY saas_payment_audit_service_only ON public.saas_payment_audit FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMIT;