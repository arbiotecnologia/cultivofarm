-- Postcheck Fase 2 v2 (read-only). Aborta se schema divergir da migration.
DO $$
DECLARE v_missing text; r record;
BEGIN
  -- Colunas novas em comunicacao_templates
  FOREACH v_missing IN ARRAY ARRAY[
    'provider_template_name','language_code','parameter_mapping','provider_template_status'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='comunicacao_templates'
                      AND column_name=v_missing) THEN
      RAISE EXCEPTION 'postcheck: coluna ausente comunicacao_templates.%', v_missing;
    END IF;
  END LOOP;

  -- CHECKs (condicionais por status)
  FOREACH v_missing IN ARRAY ARRAY[
    'comunicacao_templates_email_assunto_chk',
    'comunicacao_templates_whatsapp_meta_chk',
    'comunicacao_templates_non_whatsapp_meta_chk',
    'comunicacao_templates_provider_status_chk'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v_missing) THEN
      RAISE EXCEPTION 'postcheck: constraint ausente %', v_missing;
    END IF;
  END LOOP;

  -- Nova tabela in_app_dispatch
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='comunicacao_inapp_dispatch'
  ) THEN RAISE EXCEPTION 'postcheck: tabela comunicacao_inapp_dispatch ausente'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname='comunicacao_inapp_dispatch' AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'postcheck: RLS não habilitada em comunicacao_inapp_dispatch'; END IF;

  -- Triggers de OS
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_comunicacao_os_pronto_retirada')
    THEN RAISE EXCEPTION 'postcheck: trigger trg_comunicacao_os_pronto_retirada ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_comunicacao_os_onfarm_pronto_retirada')
    THEN RAISE EXCEPTION 'postcheck: trigger trg_comunicacao_os_onfarm_pronto_retirada ausente'; END IF;

  -- Novas RPCs por resolução de tipos + validação de tipo de retorno e proretset.
  -- ret_kind='scalar' → proretset=false; ret_kind='setof' → proretset=true.
  FOR r IN
    SELECT * FROM (VALUES
      ('rpc_publish_communication_event_v2',             'text,text,uuid,jsonb,text',                   'jsonb',  'scalar'),
      ('rpc_set_communication_template_metadata',        'uuid,text,text,jsonb,text',                   'jsonb',  'scalar'),
      ('rpc_preview_administrative_broadcast_count',     'public.app_role',                             'jsonb',  'scalar'),
      ('rpc_resolve_outbox_address',                     'uuid',                                        'jsonb',  'scalar'),
      ('rpc_skip_communication_delivery',                'uuid,text,text',                              'jsonb',  'scalar'),
      ('rpc_cancel_communication_delivery',              'uuid,text,text',                              'jsonb',  'scalar'),
      ('rpc_defer_communication_delivery',               'uuid,text,text,integer',                      'jsonb',  'scalar'),
      ('rpc_fail_communication_delivery_v2',             'uuid,text,text,text,boolean',                 'jsonb',  'scalar'),
      ('rpc_create_portal_notification_secure',          'uuid,text,text,text',                         'jsonb',  'scalar'),
      ('rpc_create_operational_notification_secure',     'uuid,text,text,text,text',                    'jsonb',  'scalar'),
      ('rpc_dispatch_inapp_notification',                'uuid,uuid,uuid,text,text',                    'jsonb',  'scalar'),
      ('_comunicacao_expand_event',                      'uuid,text,text,uuid,jsonb',                   'jsonb',  'scalar'),
      ('_comunicacao_publish_system_event',              'text,text,uuid,jsonb,text',                   'jsonb',  'scalar'),
      ('_comunicacao_resolve_recipients_v2',             'text,public.comunicacao_regras,text,uuid',    'record', 'setof'),
      ('_comunicacao_build_snapshot_v2',                 'text,text,uuid,jsonb,uuid,uuid',              'jsonb',  'scalar')
    ) AS t(fname, types, ret_expected, ret_kind)
  LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname=r.fname) <> 1 THEN
      RAISE EXCEPTION 'postcheck: % com overload conflitante (esperado 1)', r.fname;
    END IF;
    IF to_regprocedure(format('public.%I(%s)', r.fname, r.types)) IS NULL THEN
      RAISE EXCEPTION 'postcheck: assinatura de tipos ausente public.%(%)', r.fname, r.types;
    END IF;
    -- Valida tipo de retorno via format_type(prorettype,NULL) e proretset
    DECLARE v_ret text; v_setof boolean;
    BEGIN
      SELECT format_type(p.prorettype, NULL), p.proretset
        INTO v_ret, v_setof
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname=r.fname
         AND p.oid = to_regprocedure(format('public.%I(%s)', r.fname, r.types));
      IF r.ret_kind = 'scalar' THEN
        IF v_setof THEN
          RAISE EXCEPTION 'postcheck: %.% deveria ser scalar (proretset=false)', 'public', r.fname;
        END IF;
        IF v_ret <> r.ret_expected THEN
          RAISE EXCEPTION 'postcheck: %.% retorno % (esperado %)', 'public', r.fname, v_ret, r.ret_expected;
        END IF;
      ELSE
        IF NOT v_setof THEN
          RAISE EXCEPTION 'postcheck: %.% deveria ser SETOF (proretset=true)', 'public', r.fname;
        END IF;
      END IF;
    END;
  END LOOP;

  -- publish_v2: grant positivo authenticated + negativo anon
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema='public' AND grantee='authenticated'
       AND routine_name='rpc_publish_communication_event_v2'
  ) THEN
    RAISE EXCEPTION 'postcheck: rpc_publish_communication_event_v2 sem grant a authenticated';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema='public' AND grantee='anon'
       AND routine_name='rpc_publish_communication_event_v2'
  ) THEN
    RAISE EXCEPTION 'postcheck: rpc_publish_communication_event_v2 exposta a anon';
  END IF;


  -- Fase 1: rpc_fail_communication_delivery permanece com 4 args (não pode ser alterada)
  IF to_regprocedure('public.rpc_fail_communication_delivery(uuid,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'postcheck: Fase 1 rpc_fail_communication_delivery(4 args) ausente/alterada';
  END IF;

  -- Grants: RPCs service_role-only NÃO devem ter grant para authenticated
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema='public'
       AND grantee='authenticated'
       AND routine_name IN (
         'rpc_resolve_outbox_address',
         'rpc_skip_communication_delivery',
         'rpc_cancel_communication_delivery',
         'rpc_defer_communication_delivery',
         'rpc_fail_communication_delivery_v2',
         'rpc_create_portal_notification_secure',
         'rpc_create_operational_notification_secure',
         'rpc_dispatch_inapp_notification'
       )
  ) THEN
    RAISE EXCEPTION 'postcheck: RPC service_role-only exposta a authenticated';
  END IF;

  -- Helpers internos NÃO devem ter grant para authenticated
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema='public'
       AND grantee IN ('anon','authenticated')
       AND routine_name IN (
         '_comunicacao_expand_event',
         '_comunicacao_publish_system_event',
         '_comunicacao_resolve_recipients_v2',
         '_comunicacao_build_snapshot_v2',
         '_comunicacao_trg_os_pronto_retirada',
         '_comunicacao_trg_os_onfarm_pronto_retirada'
       )
  ) THEN
    RAISE EXCEPTION 'postcheck: helper interno exposto a anon/authenticated';
  END IF;

  -- inapp_dispatch: sem grants para authenticated/anon
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='comunicacao_inapp_dispatch'
       AND grantee IN ('anon','authenticated')
  ) THEN
    RAISE EXCEPTION 'postcheck: comunicacao_inapp_dispatch acessível a anon/authenticated';
  END IF;

  RAISE NOTICE 'postcheck Fase 2 v2: OK';
END$$;
