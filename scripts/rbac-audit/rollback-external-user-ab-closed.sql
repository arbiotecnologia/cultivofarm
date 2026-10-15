-- CANDIDATE ONLY. No remote execution. Use transaction ROLLBACK on failed install.
-- Hosted 19:56 baseline: ZERO non-internal invitation triggers and both helpers
-- absent. Exact inverse: removes only introduced triggers/functions, no restored grants.
BEGIN;
DROP TRIGGER a00_cf_invitation_gate ON public.platform_org_admin_invites;
DROP TRIGGER z90_cf_invitation_profile_stamp ON public.platform_org_admin_invites;
DROP TRIGGER a00_cf_invitation_no_truncate ON public.platform_org_admin_invites;
DROP FUNCTION cf_user_guards_v1.acquire_invitation_gate();
DROP FUNCTION cf_user_guards_v1.touch_invitation_profiles();
REVOKE ALL ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text),public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid),platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid),platform_private.external_provisioning_scope(uuid,public.app_role,uuid,uuid[],uuid),public.b2b_finish_provisioning(uuid,uuid,uuid),public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid),public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Preserve all receipts/Auth/links and function bodies for fenced reconciliation.
-- Existing cf_user_guards_v1.block_truncate and unrelated user triggers unchanged.
COMMIT;
