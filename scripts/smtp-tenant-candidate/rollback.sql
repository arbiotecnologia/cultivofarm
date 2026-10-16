-- REVIEW ONLY: contain access, preserve rows, audit and Vault. No global changes.
BEGIN;
UPDATE platform_private.communication_tenant_email_review_gate SET approved=false WHERE id=true;
REVOKE ALL ON FUNCTION public.tenant_email_settings_scope() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tenant_email_settings_get() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.tenant_email_settings_save(bigint,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform_private.tenant_email_actor_org() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON public.communication_tenant_email_settings,public.communication_tenant_email_audit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON platform_private.communication_tenant_email_secret_refs FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.communication_tenant_email_audit_id_seq FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
-- Keep the UI flag and handler reviewed=false. Remove only the installed candidate
-- function from routing if approved separately; never delete Vault data automatically.
