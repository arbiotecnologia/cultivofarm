-- Canonical swzpzcwiasxmjutrmvkm only; no Auth/account changes or sends.
-- All inserts and preference/consent effects MUST roll back at the final P0001.
DO $proof$
DECLARE
  run_id uuid := gen_random_uuid();
  cross_client uuid := gen_random_uuid();
  cross_pref uuid := gen_random_uuid();
  cross_link uuid := gen_random_uuid();
  actor uuid;
  n bigint;
  result jsonb;
  positive integer := 0;
  denied integer := 0;
BEGIN
  -- Explicit temporary client, not a backfill of any real/unowned client.
  INSERT INTO public.clientes(id,nome,codigo_cliente,organization_id)
    VALUES(cross_client,'TEMPORARY_AUDIT_NOTIF3_PREF', 'AUD-'||run_id::text,'007bb519-cba0-4704-be2c-cb93ad010048');
  INSERT INTO public.comunicacao_preferencias(id,user_id,cliente_id,canal,source)
    VALUES(cross_pref,'cbdc4ef3-005a-4674-8ea3-4410c7d7d212',cross_client,'email','TEMPORARY_AUDIT_NOTIF3_PREF');
  INSERT INTO public.user_clientes(id,user_id,cliente_id)
    VALUES(cross_link,'cbdc4ef3-005a-4674-8ea3-4410c7d7d212',cross_client);
  FOREACH actor IN ARRAY ARRAY['cbdc4ef3-005a-4674-8ea3-4410c7d7d212'::uuid,'a7d45277-6dec-413d-bf6b-86620c1ef39f'::uuid] LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','iat',extract(epoch FROM clock_timestamp())::bigint)::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF public.h15_actor_organization() IS NULL THEN RAISE EXCEPTION 'positive actor not ready'; END IF;
    result := public.rpc_update_communication_preferences('in_app',false,NULL);
    IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'own RPC failed'; END IF;
    SELECT count(*) INTO n FROM public.comunicacao_preferencias WHERE user_id=actor AND canal='in_app' AND enabled=false;
    IF n<>1 THEN RAISE EXCEPTION 'own read failed'; END IF;
    positive:=positive+1;
    SELECT count(*) INTO n FROM public.comunicacao_preferencias WHERE user_id<>actor OR id=cross_pref;
    IF n<>0 THEN RAISE EXCEPTION 'cross user/client visible'; END IF;
    denied:=denied+1;
    -- No caller-supplied owner exists in the RPC contract; direct writes remain closed.
    BEGIN
      INSERT INTO public.comunicacao_preferencias(user_id,canal,source)
        VALUES(CASE WHEN actor='cbdc4ef3-005a-4674-8ea3-4410c7d7d212'::uuid THEN 'a7d45277-6dec-413d-bf6b-86620c1ef39f'::uuid ELSE 'cbdc4ef3-005a-4674-8ea3-4410c7d7d212'::uuid END,'whatsapp','TEMPORARY_AUDIT_NOTIF3_PREF');
      RAISE EXCEPTION 'forged owner allowed';
    EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
    EXECUTE 'RESET ROLE';
  END LOOP;
  -- Real existing inactive/no-org users; never mutate their profiles or roles.
  FOREACH actor IN ARRAY ARRAY['d856140b-26c9-4d6a-a5aa-8bea47e78fff'::uuid,'37303555-f734-4ba8-8d13-f8fa54603853'::uuid,NULL::uuid] LOOP
    PERFORM set_config('request.jwt.claims',CASE WHEN actor IS NULL THEN '{}' ELSE jsonb_build_object('sub',actor,'role','authenticated','iat',extract(epoch FROM clock_timestamp())::bigint)::text END,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    IF public.h15_actor_organization() IS NOT NULL THEN RAISE EXCEPTION 'negative actor unexpectedly ready'; END IF;
    BEGIN
      PERFORM public.rpc_update_communication_preferences('in_app',false,NULL);
      RAISE EXCEPTION 'invalid actor mutation allowed';
    EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
    SELECT count(*) INTO n FROM public.comunicacao_preferencias;
    IF n<>0 THEN RAISE EXCEPTION 'invalid actor read allowed'; END IF;
    denied:=denied+1;
    EXECUTE 'RESET ROLE';
  END LOOP;
  -- Exactly two own writes, two consent records, plus one explicit cross fixture.
  SELECT count(*) INTO n FROM public.comunicacao_preferencias WHERE canal='in_app' AND user_id=ANY(ARRAY['cbdc4ef3-005a-4674-8ea3-4410c7d7d212'::uuid,'a7d45277-6dec-413d-bf6b-86620c1ef39f'::uuid]);
  IF n<>2 THEN RAISE EXCEPTION 'positive writes mismatch'; END IF;
  SELECT count(*) INTO n FROM public.comunicacao_consent_log WHERE user_id=ANY(ARRAY['cbdc4ef3-005a-4674-8ea3-4410c7d7d212'::uuid,'a7d45277-6dec-413d-bf6b-86620c1ef39f'::uuid]) AND canal='in_app';
  IF n<>2 THEN RAISE EXCEPTION 'consent effects mismatch'; END IF;
  IF positive<>2 OR denied<>10 THEN RAISE EXCEPTION 'coverage mismatch'; END IF;
  RAISE EXCEPTION 'NOTIF3_PREFERENCES_ROLLBACK own=% denied=% run=% client=% preference=% link=%',positive,denied,run_id,cross_client,cross_pref,cross_link USING ERRCODE='P0001';
END $proof$;