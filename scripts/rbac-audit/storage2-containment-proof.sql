-- Canonical destination: swzpzcwiasxmjutrmvkm ONLY.
-- Domain/Storage metadata writes: zero. SQL claims are NOT real JWT/API proof.
-- Deliberate final exception rolls back all session-local state.
DO $proof$
DECLARE
 actor uuid; denied integer := 0; legacy_denied integer := 0;
 actors uuid[] := ARRAY['a7d45277-6dec-413d-bf6b-86620c1ef39f'::uuid,
   'cbdc4ef3-005a-4674-8ea3-4410c7d7d212'::uuid,
   '28c5f1ca-32a7-4826-b1ee-8fb93c5a5ab9'::uuid, NULL::uuid];
 run_id text := 'TEMPORARY_AUDIT_STORAGE2_AFTER_' || gen_random_uuid();
BEGIN
 SET LOCAL ROLE authenticated;
 FOREACH actor IN ARRAY actors LOOP
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,
     'role','authenticated','iat',extract(epoch from now())::bigint)::text,true);
   BEGIN
     PERFORM public.rpc_salvar_aplicacao_v1(gen_random_uuid(),'{}'::jsonb);
     RAISE EXCEPTION 'STORAGE2_PROOF_UNEXPECTED_SUCCESS';
   EXCEPTION WHEN insufficient_privilege THEN
     IF SQLERRM <> 'STORAGE2_APPLICATION_CONTRACT_UNAVAILABLE' THEN RAISE; END IF;
     denied := denied + 1;
   END;
   BEGIN
     PERFORM platform_private.storage2_salvar_aplicacao_legacy_closed(gen_random_uuid(),'{}'::jsonb);
     RAISE EXCEPTION 'STORAGE2_PROOF_LEGACY_REACHABLE';
   EXCEPTION WHEN insufficient_privilege THEN legacy_denied := legacy_denied + 1;
   END;
 END LOOP;
 SET LOCAL ROLE service_role;
 BEGIN
   PERFORM public.rpc_salvar_aplicacao_v1(NULL,NULL);
   RAISE EXCEPTION 'STORAGE2_PROOF_SERVICE_SUCCESS';
 EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM <> 'STORAGE2_APPLICATION_CONTRACT_UNAVAILABLE' THEN RAISE; END IF;
   denied := denied + 1;
 END;
 BEGIN
   PERFORM platform_private.storage2_salvar_aplicacao_legacy_closed(NULL,NULL);
   RAISE EXCEPTION 'STORAGE2_PROOF_SERVICE_LEGACY';
 EXCEPTION WHEN insufficient_privilege THEN legacy_denied := legacy_denied + 1;
 END;
 IF denied <> 5 OR legacy_denied <> 5 THEN RAISE EXCEPTION 'STORAGE2_PROOF_COUNT'; END IF;
 RAISE EXCEPTION 'STORAGE2_AFTER_EXPECTED_ROLLBACK blocked=% legacy_acl_denied=% metadata_writes=0 run_id=%',denied,legacy_denied,run_id;
END $proof$;