-- Precheck Fase 2 (read-only). Aborta se pré-requisitos ausentes.
DO $$
DECLARE v_missing text;
BEGIN
  -- Fase 1 aplicada?
  FOREACH v_missing IN ARRAY ARRAY[
    'comunicacao_templates','comunicacao_regras','comunicacao_eventos',
    'comunicacao_outbox','comunicacao_preferencias','comunicacao_audit_log',
    'comunicacao_consent_log'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=v_missing) THEN
      RAISE EXCEPTION 'precheck: Fase 1 ausente — tabela % não existe', v_missing;
    END IF;
  END LOOP;

  -- Tabelas de negócio esperadas
  FOREACH v_missing IN ARRAY ARRAY[
    'ordens_servico','ordens_servico_onfarm','profiles','clientes',
    'portal_notificacoes','notificacoes_operacionais','user_roles'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=v_missing) THEN
      RAISE EXCEPTION 'precheck: tabela requerida % não existe', v_missing;
    END IF;
  END LOOP;

  -- Enums esperados
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='status_os') THEN
    RAISE EXCEPTION 'precheck: enum status_os ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
     WHERE t.typname='status_os' AND e.enumlabel='pronto_entrega'
  ) THEN
    RAISE EXCEPTION 'precheck: enum status_os sem valor pronto_entrega';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
     WHERE t.typname='status_os_onfarm' AND e.enumlabel='pronto_entrega'
  ) THEN
    RAISE EXCEPTION 'precheck: enum status_os_onfarm sem valor pronto_entrega';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='app_role') THEN
    RAISE EXCEPTION 'precheck: enum app_role ausente';
  END IF;

  -- Colunas críticas comprovadas na auditoria
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles' AND column_name='user_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'precheck: profiles.user_id ausente'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ordens_servico' AND column_name='numero_os';
  IF NOT FOUND THEN RAISE EXCEPTION 'precheck: ordens_servico.numero_os ausente'; END IF;

  -- Fase 1: RPCs devem existir (checagem por nome; postcheck da Fase 1 confere assinatura)
  FOREACH v_missing IN ARRAY ARRAY[
    'rpc_publish_communication_event','rpc_claim_communication_outbox',
    'rpc_complete_communication_delivery','rpc_fail_communication_delivery',
    '_comunicacao_resolve_template','_comunicacao_resolve_recipients',
    '_comunicacao_can_deliver','_comunicacao_build_snapshot'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname=v_missing) THEN
      RAISE EXCEPTION 'precheck: função da Fase 1 ausente: %', v_missing;
    END IF;
  END LOOP;

  -- Fase 2 não pode estar já aplicada (evita drift)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='rpc_resolve_outbox_address'
  ) THEN
    RAISE EXCEPTION 'precheck: rpc_resolve_outbox_address já existe (Fase 2 parcialmente aplicada?)';
  END IF;

  RAISE NOTICE 'precheck Fase 2: OK — pré-requisitos satisfeitos, Fase 2 ainda não aplicada.';
END$$;
