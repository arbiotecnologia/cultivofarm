-- Harness RLS/Grants Fase 2 v2 (read-only). Confere matriz de segurança.
DO $$
DECLARE r record; v_bad int := 0;
BEGIN
  -- 1) Nenhuma função interna/service_role deve ter EXECUTE para anon
  FOR r IN
    SELECT routine_name FROM information_schema.role_routine_grants
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name IN (
         '_comunicacao_expand_event','_comunicacao_publish_system_event',
         '_comunicacao_resolve_recipients_v2','_comunicacao_build_snapshot_v2',
         '_comunicacao_trg_os_pronto_retirada','_comunicacao_trg_os_onfarm_pronto_retirada',
         'rpc_set_communication_template_metadata',
         'rpc_preview_administrative_broadcast_count',
         'rpc_resolve_outbox_address',
         'rpc_skip_communication_delivery','rpc_cancel_communication_delivery',
         'rpc_defer_communication_delivery','rpc_fail_communication_delivery_v2',
         'rpc_dispatch_inapp_notification',
         'rpc_create_portal_notification_secure','rpc_create_operational_notification_secure')
  LOOP
    v_bad := v_bad + 1;
    RAISE WARNING 'anon não deveria ter EXECUTE em %', r.routine_name;
  END LOOP;

  -- 2) Nenhuma RPC service_role-only deveria ter EXECUTE para authenticated
  FOR r IN
    SELECT routine_name FROM information_schema.role_routine_grants
     WHERE routine_schema='public' AND grantee='authenticated'
       AND routine_name IN (
         '_comunicacao_expand_event','_comunicacao_publish_system_event',
         '_comunicacao_resolve_recipients_v2','_comunicacao_build_snapshot_v2',
         'rpc_resolve_outbox_address',
         'rpc_skip_communication_delivery','rpc_cancel_communication_delivery',
         'rpc_defer_communication_delivery','rpc_fail_communication_delivery_v2',
         'rpc_dispatch_inapp_notification',
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
      'rpc_defer_communication_delivery','rpc_fail_communication_delivery_v2',
      'rpc_dispatch_inapp_notification',
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

  -- 4) Tabela inapp_dispatch: sem acesso a anon/authenticated
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='comunicacao_inapp_dispatch'
       AND grantee IN ('anon','authenticated')
  ) THEN
    v_bad := v_bad + 1;
    RAISE WARNING 'comunicacao_inapp_dispatch tem grants indevidos';
  END IF;

  -- 5) Triggers em OS: AFTER UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE c.relname='ordens_servico' AND t.tgname='trg_comunicacao_os_pronto_retirada'
       AND t.tgtype & 16 = 16
  ) THEN
    v_bad := v_bad + 1;
    RAISE WARNING 'trigger ordens_servico não é AFTER UPDATE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE c.relname='ordens_servico_onfarm' AND t.tgname='trg_comunicacao_os_onfarm_pronto_retirada'
       AND t.tgtype & 16 = 16
  ) THEN
    v_bad := v_bad + 1;
    RAISE WARNING 'trigger ordens_servico_onfarm não é AFTER UPDATE';
  END IF;

  -- 6) Simulação estrita: anon não consegue executar RPCs de worker.
  --    Aceita SOMENTE insufficient_privilege (42501) ou undefined_function (42883);
  --    qualquer outro SQLSTATE conta como violação (evita mascarar erro de negócio).
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.rpc_resolve_outbox_address('00000000-0000-0000-0000-000000000000'::uuid);
    v_bad := v_bad + 1;
    RAISE WARNING 'anon conseguiu executar rpc_resolve_outbox_address';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN undefined_function THEN NULL;
    WHEN OTHERS THEN
      v_bad := v_bad + 1;
      RAISE WARNING 'anon rpc_resolve_outbox_address erro inesperado sqlstate=%', SQLSTATE;
  END;
  RESET ROLE;

  -- 6.b) publish_v2: authenticated GRANT positivo; anon GRANT negativo.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema='public' AND grantee='authenticated'
       AND routine_name='rpc_publish_communication_event_v2'
  ) THEN
    v_bad := v_bad + 1;
    RAISE WARNING 'authenticated deveria ter EXECUTE em rpc_publish_communication_event_v2';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name='rpc_publish_communication_event_v2'
  ) THEN
    v_bad := v_bad + 1;
    RAISE WARNING 'anon NÃO deveria ter EXECUTE em rpc_publish_communication_event_v2';
  END IF;


  IF v_bad = 0 THEN
    RAISE NOTICE 'harness Fase 2 v2: OK — matriz de segurança consistente';
  ELSE
    RAISE EXCEPTION 'harness Fase 2 v2: % violações detectadas', v_bad;
  END IF;
END$$;
