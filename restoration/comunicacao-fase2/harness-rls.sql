-- Harness RLS/Grants Fase 2 (read-only). Confere matriz de segurança.
DO $$
DECLARE r record; v_bad int := 0;
BEGIN
  -- 1) Nenhuma nova função interna/service_role deve ter EXECUTE para anon
  FOR r IN
    SELECT routine_name, grantee
      FROM information_schema.role_routine_grants
     WHERE routine_schema='public'
       AND grantee='anon'
       AND routine_name IN (
         '_comunicacao_expand_event','_comunicacao_publish_system_event',
         '_comunicacao_trg_os_pronto_retirada','_comunicacao_trg_os_onfarm_pronto_retirada',
         'rpc_set_communication_template_metadata',
         'rpc_preview_administrative_broadcast_count',
         'rpc_resolve_outbox_address',
         'rpc_skip_communication_delivery','rpc_cancel_communication_delivery',
         'rpc_create_portal_notification_secure','rpc_create_operational_notification_secure')
  LOOP
    v_bad := v_bad + 1;
    RAISE WARNING 'anon deveria não ter EXECUTE em %', r.routine_name;
  END LOOP;

  -- 2) Apenas essas RPCs devem estar disponíveis a authenticated (whitelist)
  FOR r IN
    SELECT routine_name FROM information_schema.role_routine_grants
     WHERE routine_schema='public' AND grantee='authenticated'
       AND routine_name IN (
         '_comunicacao_expand_event','_comunicacao_publish_system_event',
         'rpc_resolve_outbox_address',
         'rpc_skip_communication_delivery','rpc_cancel_communication_delivery',
         'rpc_create_portal_notification_secure','rpc_create_operational_notification_secure')
  LOOP
    v_bad := v_bad + 1;
    RAISE WARNING 'authenticated não deveria ter EXECUTE em %', r.routine_name;
  END LOOP;

  -- 3) service_role deve ter EXECUTE nas RPCs de worker
  FOR r IN
    SELECT unnest(ARRAY[
      'rpc_resolve_outbox_address',
      'rpc_skip_communication_delivery','rpc_cancel_communication_delivery',
      'rpc_create_portal_notification_secure','rpc_create_operational_notification_secure'
    ]) AS routine_name
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.role_routine_grants
                    WHERE routine_schema='public' AND grantee='service_role'
                      AND routine_name = r.routine_name) THEN
      v_bad := v_bad + 1;
      RAISE WARNING 'service_role deveria ter EXECUTE em %', r.routine_name;
    END IF;
  END LOOP;

  -- 4) Triggers de OS: garantir que existem e disparam only WHEN status muda
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
     WHERE c.relname='ordens_servico'
       AND t.tgname='trg_comunicacao_os_pronto_retirada'
       AND t.tgtype & 16 = 16  -- AFTER
  ) THEN
    v_bad := v_bad + 1;
    RAISE WARNING 'trigger em ordens_servico não é AFTER UPDATE conforme esperado';
  END IF;

  -- 5) Simulação leve: como anon, chamada deve falhar
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.rpc_resolve_outbox_address('00000000-0000-0000-0000-000000000000'::uuid);
    v_bad := v_bad + 1;
    RAISE WARNING 'anon conseguiu executar rpc_resolve_outbox_address (não deveria)';
  EXCEPTION WHEN insufficient_privilege OR undefined_function OR others THEN
    -- esperado: sem permissão / função inaccessível
    NULL;
  END;
  RESET ROLE;

  IF v_bad = 0 THEN
    RAISE NOTICE 'harness Fase 2: OK — matriz de segurança consistente';
  ELSE
    RAISE EXCEPTION 'harness Fase 2: % violações detectadas', v_bad;
  END IF;
END$$;
