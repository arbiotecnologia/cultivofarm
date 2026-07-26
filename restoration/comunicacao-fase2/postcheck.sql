-- Postcheck Fase 2 (read-only). Aborta se schema divergir da migration Fase 2.
DO $$
DECLARE v_missing text; r record;
BEGIN
  -- Colunas novas em comunicacao_templates
  FOREACH v_missing IN ARRAY ARRAY['provider_template_name','language_code','parameter_mapping'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='comunicacao_templates'
                      AND column_name=v_missing) THEN
      RAISE EXCEPTION 'postcheck: coluna ausente comunicacao_templates.%', v_missing;
    END IF;
  END LOOP;

  -- CHECKs novos
  FOREACH v_missing IN ARRAY ARRAY[
    'comunicacao_templates_email_assunto_chk',
    'comunicacao_templates_whatsapp_meta_chk',
    'comunicacao_templates_non_whatsapp_meta_chk'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v_missing) THEN
      RAISE EXCEPTION 'postcheck: constraint ausente %', v_missing;
    END IF;
  END LOOP;

  -- Triggers de OS
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='trg_comunicacao_os_pronto_retirada'
  ) THEN RAISE EXCEPTION 'postcheck: trigger trg_comunicacao_os_pronto_retirada ausente'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='trg_comunicacao_os_onfarm_pronto_retirada'
  ) THEN RAISE EXCEPTION 'postcheck: trigger trg_comunicacao_os_onfarm_pronto_retirada ausente'; END IF;

  -- Novas RPCs por resolução de tipos (imune a search_path/parâmetros/formatação)
  FOR r IN
    SELECT * FROM (VALUES
      ('rpc_set_communication_template_metadata', 'uuid,text,text,jsonb', 'jsonb', false),
      ('rpc_preview_administrative_broadcast_count', 'public.app_role', 'jsonb', false),
      ('rpc_resolve_outbox_address', 'uuid', 'jsonb', false),
      ('rpc_skip_communication_delivery', 'uuid,text,text', 'jsonb', false),
      ('rpc_cancel_communication_delivery', 'uuid,text,text', 'jsonb', false),
      ('rpc_create_portal_notification_secure', 'uuid,text,text,text', 'jsonb', false),
      ('rpc_create_operational_notification_secure', 'uuid,text,text,text,text', 'jsonb', false)
    ) AS t(fname, types, ret_name, is_set)
  LOOP
    -- Exatamente uma definição por nome
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname=r.fname) <> 1 THEN
      RAISE EXCEPTION 'postcheck: % com overload conflitante (esperado 1)', r.fname;
    END IF;
    IF to_regprocedure(format('public.%I(%s)', r.fname, r.types)) IS NULL THEN
      RAISE EXCEPTION 'postcheck: assinatura de tipos ausente public.%(%)', r.fname, r.types;
    END IF;
    -- Retorno jsonb (nenhuma nova RPC da Fase 2 retorna SETOF)
    DECLARE
      v_ret text; v_isset boolean;
    BEGIN
      SELECT pg_catalog.format_type(prorettype, NULL), proretset
        INTO v_ret, v_isset
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname=r.fname;
      IF v_isset THEN RAISE EXCEPTION '%: não deveria retornar SETOF', r.fname; END IF;
      IF v_ret <> r.ret_name THEN RAISE EXCEPTION '% retorna % (esperado %)', r.fname, v_ret, r.ret_name; END IF;
    END;
  END LOOP;

  -- Grants: RPCs de service_role NÃO devem ter grant para authenticated
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema='public'
       AND grantee='authenticated'
       AND routine_name IN (
         'rpc_resolve_outbox_address',
         'rpc_skip_communication_delivery',
         'rpc_cancel_communication_delivery',
         'rpc_create_portal_notification_secure',
         'rpc_create_operational_notification_secure'
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
         '_comunicacao_trg_os_pronto_retirada',
         '_comunicacao_trg_os_onfarm_pronto_retirada'
       )
  ) THEN
    RAISE EXCEPTION 'postcheck: helper interno exposto a anon/authenticated';
  END IF;

  RAISE NOTICE 'postcheck Fase 2: OK';
END$$;
