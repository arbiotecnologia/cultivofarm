-- Harness RLS/Grants Fase 2 v3 (read-only). Confere matriz de segurança via
-- has_function_privilege(role, oid, 'EXECUTE') por assinatura EXATA (não por nome),
-- evitando falsos negativos da view information_schema.role_routine_grants.
DO $$
DECLARE
  v_bad int := 0;
  v_oid oid;
  v_role text;
  v_expected boolean;
  v_actual boolean;
  v_sig text;
  v_a text; v_b text; v_c text;

  -- Matriz por assinatura EXATA. Colunas: sig, anon, authenticated, service_role.
  matrix constant text[][] := ARRAY[
    -- Internas / worker: só service_role
    ['public._comunicacao_expand_event(uuid,text,text,uuid,jsonb)',                    'f','f','t'],
    ['public._comunicacao_publish_system_event(text,text,uuid,jsonb,text)',            'f','f','t'],
    ['public._comunicacao_resolve_recipients_v2(text,comunicacao_regras,text,uuid)',   'f','f','t'],
    ['public._comunicacao_build_snapshot_v2(text,text,uuid,jsonb,uuid,uuid)',          'f','f','t'],
    ['public.rpc_resolve_outbox_address(uuid)',                                        'f','f','t'],
    ['public.rpc_skip_communication_delivery(uuid,text,text)',                         'f','f','t'],
    ['public.rpc_cancel_communication_delivery(uuid,text,text)',                       'f','f','t'],
    ['public.rpc_defer_communication_delivery(uuid,text,text,integer)',                'f','f','t'],
    ['public.rpc_fail_communication_delivery_v2(uuid,text,text,text,boolean)',         'f','f','t'],
    ['public.rpc_dispatch_inapp_notification(uuid,uuid,uuid,text,text)',               'f','f','t'],
    -- RPCs de notificação: sobrecarga interna service_role-only vs. sobrecarga larga usada pelo frontend logado
    ['public.rpc_create_portal_notification_secure(uuid,text,text,text)',              'f','f','t'],
    ['public.rpc_create_portal_notification_secure(uuid,text,text,text,text,text,uuid,text)', 'f','t','t'],
    ['public.rpc_create_operational_notification_secure(uuid,text,text,text,text)',    'f','f','t'],
    -- Publish v2: authenticated pode publicar; anon nunca
    ['public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)',           'f','t','t'],
    -- Admin/config: authenticated + service_role (RPC valida role internamente)
    ['public.rpc_set_communication_template_metadata(uuid,text,text,jsonb,text)',      'f','t','t'],
    ['public.rpc_preview_administrative_broadcast_count(app_role)',                    'f','t','t']
  ];
BEGIN
  FOR i IN 1..array_length(matrix,1) LOOP
    v_sig := matrix[i][1];
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      v_bad := v_bad + 1;
      RAISE WARNING 'assinatura inexistente: %', v_sig;
      CONTINUE;
    END IF;
    v_a := matrix[i][2]; v_b := matrix[i][3]; v_c := matrix[i][4];
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      v_expected := CASE v_role WHEN 'anon' THEN v_a::boolean
                                WHEN 'authenticated' THEN v_b::boolean
                                ELSE v_c::boolean END;
      v_actual := has_function_privilege(v_role, v_oid, 'EXECUTE');
      IF v_actual <> v_expected THEN
        v_bad := v_bad + 1;
        RAISE WARNING 'grant divergente % em %: esperado=% obtido=%',
          v_role, v_sig, v_expected, v_actual;
      END IF;
    END LOOP;
  END LOOP;

  -- Tabela inapp_dispatch: nenhum privilégio direto a anon/authenticated.
  IF has_table_privilege('anon','public.comunicacao_inapp_dispatch','SELECT')
     OR has_table_privilege('authenticated','public.comunicacao_inapp_dispatch','SELECT')
     OR has_table_privilege('anon','public.comunicacao_inapp_dispatch','INSERT')
     OR has_table_privilege('authenticated','public.comunicacao_inapp_dispatch','INSERT') THEN
    v_bad := v_bad + 1;
    RAISE WARNING 'comunicacao_inapp_dispatch tem grants indevidos a anon/authenticated';
  END IF;

  -- Triggers em OS: AFTER UPDATE.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE c.relname='ordens_servico' AND t.tgname='trg_comunicacao_os_pronto_retirada'
       AND t.tgtype & 16 = 16
  ) THEN
    v_bad := v_bad + 1;
    RAISE WARNING 'trigger ordens_servico nao e AFTER UPDATE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE c.relname='ordens_servico_onfarm' AND t.tgname='trg_comunicacao_os_onfarm_pronto_retirada'
       AND t.tgtype & 16 = 16
  ) THEN
    v_bad := v_bad + 1;
    RAISE WARNING 'trigger ordens_servico_onfarm nao e AFTER UPDATE';
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
    RAISE NOTICE 'harness Fase 2 v3: OK — matriz de seguranca consistente';
  ELSE
    RAISE EXCEPTION 'harness Fase 2 v3: % violacoes detectadas', v_bad;
  END IF;
END$$;
