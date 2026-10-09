-- Canonical read-only bodies captured 2026-10-09; executed only on disposable PG.
CREATE OR REPLACE FUNCTION public.platform_finalize_org_admin_provisioning(p_job_id uuid, p_lease_token uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$;
CREATE OR REPLACE FUNCTION public.platform_claim_admin_access(p_actor_id uuid, p_invite_id uuid, p_operation_id uuid, p_kind text, p_confirm_ambiguous boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$;

REVOKE ALL ON FUNCTION public.platform_finalize_org_admin_provisioning(uuid,uuid,uuid),public.platform_claim_admin_access(uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_finalize_org_admin_provisioning(uuid,uuid,uuid),public.platform_claim_admin_access(uuid,uuid,uuid,text,boolean) TO service_role;
