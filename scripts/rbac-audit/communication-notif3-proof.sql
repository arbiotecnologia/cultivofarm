-- Canonical swzpzcwiasxmjutrmvkm only. No sends, Auth changes or secrets.
-- Execute as one transaction; final exception MUST roll back all fixtures.
DO $proof$
DECLARE
  run_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  audit_id bigint := -(1000000000000 + floor(random()*1000000000000)::bigint);
  actor uuid;
  t text;
  n bigint;
  denied integer := 0;
  hidden integer := 0;
  result jsonb;
BEGIN
  INSERT INTO public.comunicacao_audit_log(id,acao,entidade,entity_id,actor_id)
    VALUES(audit_id,'TEMPORARY_AUDIT_NOTIF3','TEMPORARY_AUDIT_NOTIF3',run_id,'a7d45277-6dec-413d-bf6b-86620c1ef39f');
  INSERT INTO public.comunicacao_eventos(id,event_key,source_type,source_id,created_by,idempotency_key)
    VALUES(event_id,'TEMPORARY_AUDIT_NOTIF3','TEMPORARY_AUDIT_NOTIF3',run_id,'a7d45277-6dec-413d-bf6b-86620c1ef39f',run_id::text);
  FOREACH actor IN ARRAY ARRAY['cbdc4ef3-005a-4674-8ea3-4410c7d7d212'::uuid,'a7d45277-6dec-413d-bf6b-86620c1ef39f'::uuid] LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','iat',extract(epoch FROM clock_timestamp())::bigint)::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    FOREACH t IN ARRAY ARRAY['comunicacao_eventos','comunicacao_outbox','comunicacao_audit_log','comunicacao_consent_log','comunicacao_provider_receipts','comunicacao_dlq_replay_audit','comunicacao_regras','comunicacao_templates','communication_provider_settings','communication_provider_settings_audit','communication_provider_settings_rate_limit'] LOOP
      BEGIN
        EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
        IF n<>0 THEN RAISE EXCEPTION 'unexpected global visibility: %',t; END IF;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      hidden:=hidden+1;
    END LOOP;
    BEGIN PERFORM public.rpc_admin_communication_health_snapshot(); RAISE EXCEPTION 'health allowed';
      EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
    BEGIN PERFORM public.rpc_publish_communication_event_v2('administrative_important_update',NULL,NULL,'{}',run_id::text); RAISE EXCEPTION 'publish allowed';
      EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
    BEGIN PERFORM public.rpc_admin_set_whatsapp_consent(NULL,actor,'opt_in','TEMPORARY_AUDIT_NOTIF3',NULL); RAISE EXCEPTION 'consent allowed';
      EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
    BEGIN PERFORM public.rpc_verify_communication_channel(NULL,actor,'email',true,true); RAISE EXCEPTION 'verify allowed';
      EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
    BEGIN UPDATE public.comunicacao_eventos SET payload='{"forged":true}' WHERE id=event_id;
      GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'update allowed'; END IF;
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN INSERT INTO public.comunicacao_eventos(event_key,idempotency_key) VALUES('TEMPORARY_AUDIT_NOTIF3',gen_random_uuid()::text); RAISE EXCEPTION 'insert allowed';
      EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
    EXECUTE 'RESET ROLE';
  END LOOP;
  -- Privileged execution still denied BEFORE reads/effects, not just ACL.
  BEGIN PERFORM public.rpc_admin_communication_health_snapshot(); RAISE EXCEPTION 'privileged health allowed';
    EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
  BEGIN PERFORM public.rpc_publish_communication_event_v2('administrative_important_update',NULL,NULL,'{}',run_id::text); RAISE EXCEPTION 'privileged publish allowed';
    EXCEPTION WHEN insufficient_privilege THEN denied:=denied+1; END;
  result:=public._comunicacao_publish_system_event('unknown',NULL,NULL,'{}',run_id::text);
  IF result->>'suppressed'<>'true' OR result->>'ok'<>'false' THEN RAISE EXCEPTION 'parent suppression failed'; END IF;
  IF hidden<>22 OR denied<>12 THEN RAISE EXCEPTION 'coverage count mismatch'; END IF;
  RAISE EXCEPTION 'NOTIF3_COMMUNICATION_ROLLBACK hidden=% denied=% parent_suppressed=true event=% audit=% run=%',hidden,denied,event_id,audit_id,run_id USING ERRCODE='P0001';
END $proof$;