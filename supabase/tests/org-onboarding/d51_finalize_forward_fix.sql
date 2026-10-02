-- D51.2 — harness transacional do forward-fix.
-- Executar somente em banco isolado com service_role; ROLLBACK obrigatório.
BEGIN;

DO $test$
DECLARE
  v_definition text;
  v_acl text[];
BEGIN
  SELECT pg_get_functiondef(p.oid), p.proacl
    INTO v_definition, v_acl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'platform_finalize_org_admin_provisioning'
     AND pg_get_function_identity_arguments(p.oid) = 'p_job_id uuid, p_lease_token uuid, p_user_id uuid';

  IF v_definition IS NULL THEN RAISE EXCEPTION 'd51_missing_finalizer'; END IF;
  IF v_definition NOT LIKE '%SECURITY DEFINER%' OR v_definition NOT LIKE '%SET search_path TO %' THEN
    RAISE EXCEPTION 'd51_finalizer_security_contract';
  END IF;
  IF v_definition NOT LIKE '%p.organization_id IS NULL%'
     OR v_definition NOT LIKE '%p.organization_id = excluded.organization_id%'
     OR v_definition NOT LIKE '%organization_id = excluded.organization_id%' THEN
    RAISE EXCEPTION 'd51_null_profile_not_zipped_to_tenant';
  END IF;
  IF v_definition NOT LIKE '%p.organization_id <> j.organization_id%'
     OR v_definition NOT LIKE '%platform_profile_tenant_conflict%' THEN
    RAISE EXCEPTION 'd51_cross_tenant_guard_missing';
  END IF;
  IF v_definition NOT LIKE '%raw_app_meta_data->>''provisioning_request_id''%'
     OR v_definition NOT LIKE '%platform_auth_metadata_mismatch%'
     OR v_definition NOT LIKE '%platform_stale_lease%' THEN
    RAISE EXCEPTION 'd51_metadata_or_fencing_guard_missing';
  END IF;
  IF has_function_privilege('anon', 'public.platform_finalize_org_admin_provisioning(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.platform_finalize_org_admin_provisioning(uuid,uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.platform_finalize_org_admin_provisioning(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'd51_finalizer_acl_invalid';
  END IF;
END
$test$;

ROLLBACK;