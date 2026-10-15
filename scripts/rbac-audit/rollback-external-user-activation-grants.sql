-- Restrictive activation rollback ONLY; retains guards/readers/receipts/data.
BEGIN;
REVOKE ALL ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform_private.external_provisioning_scope(uuid,public.app_role,uuid,uuid[],uuid) FROM PUBLIC,anon,authenticated,service_role;
-- No DROP trigger/table/function; never execute the older installation rollback.
COMMIT;
