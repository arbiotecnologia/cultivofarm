-- REVIEW CANDIDATE ONLY. No data/body/policy changes. Do not auto-apply.
BEGIN;
-- POST-INSTALLATION preflight. Canonical swzpzcwiasxmjutrmvkm ONLY.
-- Operator must independently verify destination BEFORE execution; no GUC authority.
-- DO NOT use the old absence preflight or reinstall any applied candidate.
DO $preflight$
DECLARE e record; p record;
BEGIN
 FOR e IN SELECT * FROM (VALUES
 ('public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid)','a230865d20627d169db7e8398874d234',false,false),
 ('platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid)','fd44d88fe696f99b339a9f97c74d2911',true,false),
 ('public.b2b_finish_provisioning(uuid,uuid,uuid)','af0ba33b4a621e398323dc4fe6cc3dd6',true,false),
 ('public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid)','b20bf9b2fa0621b73efef95cd3c9140c',true,false),
 ('public.b2b_complete_provisioning_compensation(uuid,uuid,uuid)','68c1bb298b9f546866ac217c3c631011',true,false),
 ('public.b2b_claim_provisioning(uuid,uuid,text,text)','d084780b48d7ec4dcc26d3f3c4f279e9',false,false),
 ('platform_private.external_provisioning_scope(uuid,public.app_role,uuid,uuid[],uuid)','f29bbc265f995ec631f18032ffe9998b',true,false),
 ('public.producer_request_mutation_guard()','5618a1a45b96707373bca29a140b6499',true,false),
 ('platform_private.producer_commercial_client_scope(uuid)','49b8329ce232670c1560f0683b913a26',true,false),
 ('public.get_portal_cliente_b2b_order_detail_secure(uuid)','2eee9e9e357b13749513908904ab83c1',true,true),
 ('public.get_portal_cliente_b2b_orders_secure(uuid)','dd92f30f436bee47d1b714666986f8fc',true,true),
 ('public.get_portal_cliente_b2b_simulation_detail_secure(uuid)','e85c12bc847f7223b8bc8173ce444b63',true,true),
 ('public.get_portal_cliente_b2b_simulations_secure(uuid)','c0154e72104e9516acfa077eb274e432',true,true)) b(signature,hash,definer,authexec) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(e.signature);
  IF p.oid IS NULL OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM e.hash
   OR pg_get_userbyid(p.proowner) IS DISTINCT FROM 'postgres'
   OR p.prosecdef IS DISTINCT FROM e.definer
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
   OR has_function_privilege('authenticated',p.oid,'EXECUTE') IS DISTINCT FROM e.authexec
   OR has_function_privilege('anon',p.oid,'EXECUTE')
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
   OR (e.authexec IS FALSE AND has_function_privilege('service_role',p.oid,'EXECUTE'))
  THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_BASELINE_DRIFT %',e.signature USING ERRCODE='55000'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('platform_private.b2b_provisioning_receipts') AND relrowsecurity AND relowner='postgres'::regrole)
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='platform_private.b2b_provisioning_receipts'::regclass)
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_table_privilege(r,'platform_private.b2b_provisioning_receipts','SELECT,INSERT,UPDATE,DELETE'))
 THEN RAISE EXCEPTION 'EXTERNAL_RECEIPT_BASELINE_DRIFT'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.portal_solicitacoes'::regclass AND NOT tgisinternal AND tgenabled='O')<>6
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.portal_solicitacoes'::regclass AND tgname='a00_producer_request_mutation_guard' AND tgenabled='O' AND md5(pg_get_triggerdef(oid))='a5a7236749323454c94abe6b23bc932b')
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.platform_org_admin_invites'::regclass AND NOT tgisinternal AND tgenabled='O')<>3
 THEN RAISE EXCEPTION 'EXTERNAL_TRIGGER_BASELINE_DRIFT'; END IF;
END $preflight$;
-- BEGIN EXACT GRANTS
GRANT EXECUTE ON FUNCTION public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.b2b_finish_provisioning(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.b2b_complete_provisioning_compensation(uuid,uuid,uuid) TO service_role;
-- END EXACT GRANTS
DO $postconditions$
BEGIN
 IF NOT has_function_privilege('authenticated','public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_MISSING_GRANT'; END IF;
 IF NOT has_function_privilege('authenticated','platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_MISSING_GRANT'; END IF;
 IF NOT has_function_privilege('service_role','public.b2b_finish_provisioning(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_MISSING_GRANT'; END IF;
 IF NOT has_function_privilege('service_role','public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_MISSING_GRANT'; END IF;
 IF NOT has_function_privilege('service_role','public.b2b_complete_provisioning_compensation(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_MISSING_GRANT'; END IF;
 IF has_function_privilege('anon','public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_EXCESS_GRANT'; END IF;
 IF has_function_privilege('service_role','public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_EXCESS_GRANT'; END IF;
 IF has_function_privilege('anon','platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_EXCESS_GRANT'; END IF;
 IF has_function_privilege('service_role','platform_private.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role,uuid[],uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_EXCESS_GRANT'; END IF;
 IF has_function_privilege('anon','public.b2b_finish_provisioning(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_EXCESS_GRANT'; END IF;
 IF has_function_privilege('authenticated','public.b2b_finish_provisioning(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_EXCESS_GRANT'; END IF;
 IF has_function_privilege('anon','public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_EXCESS_GRANT'; END IF;
 IF has_function_privilege('authenticated','public.b2b_prepare_provisioning_compensation(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_EXCESS_GRANT'; END IF;
 IF has_function_privilege('anon','public.b2b_complete_provisioning_compensation(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_EXCESS_GRANT'; END IF;
 IF has_function_privilege('authenticated','public.b2b_complete_provisioning_compensation(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_ACTIVATION_EXCESS_GRANT'; END IF;
 IF has_function_privilege('authenticated','public.b2b_claim_provisioning(uuid,uuid,text,text)','EXECUTE') OR has_function_privilege('authenticated','platform_private.external_provisioning_scope(uuid,public.app_role,uuid,uuid[],uuid)','EXECUTE') THEN RAISE EXCEPTION 'EXTERNAL_HELPER_REOPENED'; END IF;
END $postconditions$;
COMMIT;
