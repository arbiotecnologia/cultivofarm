DO $migration$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_salvar_aplicacao_v1' AND pg_get_function_identity_arguments(p.oid)='p_aplicacao_id uuid, p_payload jsonb, p_rectify_id uuid, p_evidencias jsonb, p_evidencias_manter uuid[]') THEN RAISE EXCEPTION 'STORAGE2_EXPECTED_CONTRACT_MISSING'; END IF;
 IF to_regprocedure('platform_private.storage2_salvar_aplicacao_legacy_closed(uuid,jsonb,uuid,jsonb,uuid[])') IS NULL THEN
  ALTER FUNCTION public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[]) SET SCHEMA platform_private;
  ALTER FUNCTION platform_private.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[]) RENAME TO storage2_salvar_aplicacao_legacy_closed;
 END IF;
END $migration$;
REVOKE ALL ON FUNCTION platform_private.storage2_salvar_aplicacao_legacy_closed(uuid,jsonb,uuid,jsonb,uuid[]) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION platform_private.storage2_salvar_aplicacao_legacy_closed(uuid,jsonb,uuid,jsonb,uuid[]) IS 'STORAGE2: unsafe historical implementation preserved, no caller EXECUTE. Never restore without complete actor/tenant/payload/evidence authorization and positive proofs.';
CREATE OR REPLACE FUNCTION public.rpc_salvar_aplicacao_v1(p_aplicacao_id uuid,p_payload jsonb,p_rectify_id uuid DEFAULT NULL,p_evidencias jsonb DEFAULT '[]'::jsonb,p_evidencias_manter uuid[] DEFAULT '{}'::uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
BEGIN
 RAISE EXCEPTION 'STORAGE2_APPLICATION_CONTRACT_UNAVAILABLE' USING ERRCODE='42501';
END $function$;
REVOKE ALL ON FUNCTION public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[]) TO authenticated,service_role;
COMMENT ON FUNCTION public.rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[]) IS 'STORAGE2 containment before identity/payload parsing/domain/replay/effects. Saving and rectification intentionally unavailable pending approved integrated preparation/finalization and unequivocal unit contract. No Storage grants relaxed.';