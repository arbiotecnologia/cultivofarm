-- Harness RLS/Grants Fase 2 v3 (read-only). Confere matriz de segurança via
-- has_function_privilege(role, oid, 'EXECUTE') por assinatura exata (não por nome),
-- evitando falsos negativos da view information_schema.role_routine_grants.
DO $$
DECLARE
  v_bad int := 0;
  r record;
  v_oid oid;
  v_role text;

  -- Matriz por assinatura EXATA (com sobrecarga onde aplicável).
  -- (signature, anon_expected, authenticated_expected, service_role_expected)
  matrix constant text[][] := ARRAY[
    -- Internas / worker: só service_role
    ['public._comunicacao_expand_event(uuid)',                                       'f','f','t'],
    ['public._comunicacao_publish_system_event(text,text,jsonb,uuid,uuid)',          'f','f','t'],
    ['public._comunicacao_resolve_recipients_v2(uuid)',                              'f','f','t'],
    ['public._comunicacao_build_snapshot_v2(uuid)',                                  'f','f','t'],
    ['public.rpc_resolve_outbox_address(uuid)',                                      'f','f','t'],
    ['public.rpc_skip_communication_delivery(uuid,text)',                            'f','f','t'],
    ['public.rpc_cancel_communication_delivery(uuid,text)',                          'f','f','t'],
    ['public.rpc_defer_communication_delivery(uuid,text,timestamptz)',               'f','f','t'],
    ['public.rpc_fail_communication_delivery_v2(uuid,text,text,int,jsonb)',          'f','f','t'],
    ['public.rpc_dispatch_inapp_notification(uuid)',                                 'f','f','t'],
    -- RPCs de negócio expostas ao usuário logado (frontend usa):
    ['public.rpc_create_portal_notification_secure(uuid,text,text,text,text,text,uuid,text)', 'f','t','t'],
    ['public.rpc_create_operational_notification_secure(uuid,text,text,text,text,text,text,uuid,text)', 'f','t','t'],
    -- Publish v2: authenticated pode publicar; anon não.
    ['public.rpc_publish_communication_event_v2(text,text,jsonb,uuid,uuid,text)',    'f','t','t'],
    -- Admin/config: só authenticated (RPC valida role internamente) + service_role.
    ['public.rpc_set_communication_template_metadata(uuid,jsonb)',                   'f','t','t'],
    ['public.rpc_preview_administrative_broadcast_count(uuid,jsonb)',                'f','t','t']
  ];
BEGIN
  FOR i IN 1..array_length(matrix,1) LOOP
    v_oid := to_regprocedure(matrix[i][1]);
    IF v_oid IS NULL THEN
      v_bad := v_bad + 1;
      RAISE WARNING 'assinatura inexistente: %', matrix[i][1];
      CONTINUE;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      DECLARE
        v_expected boolean := CASE v_role
          WHEN 'anon' THEN matrix[i][2]::boolean
          WHEN 'authenticated' THEN matrix[i][3]::boolean
          ELSE matrix[i][4]::boolean
        END;
        v_actual boolean := has_function_privilege(v_role, v_oid, 'EXECUTE');
      BEGIN
        IF v_actual <> v_expected THEN
          v_bad := v_bad + 1;
          RAISE WARNING 'grant divergente % em %: esperado=% obtido=%',
            v_role, matrix[i][1], v_expected, v_actual;
        END IF;
      END;
    END LOOP;
  END LOOP;

  -- Tabela inapp_dispatch: sem acesso a anon/authenticated (ACL direta).
  IF has_table_privilege('anon','public.comunicacao_inapp_dispatch','SELECT')
     OR has_table_privilege('authenticated','public.comunicacao_inapp_dispatch','SELECT') THEN
    v_bad := v_bad + 1;
    RAISE WARNING 'comunicacao_inapp_dispatch tem SELECT indevido a anon/authenticated';
  END IF;

  -- Triggers em OS: AFTER UPDATE
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

  -- Simulação estrita: anon não consegue executar RPC de worker.
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

  IF v_bad = 0 THEN
    RAISE NOTICE 'harness Fase 2 v3: OK — matriz de segurança consistente';
  ELSE
    RAISE EXCEPTION 'harness Fase 2 v3: % violacoes detectadas', v_bad;
  END IF;
END$$;
