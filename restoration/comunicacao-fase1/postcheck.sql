-- Postcheck Fase 1 v3 (read-only). Aborta se schema divergir de migration.sql v3.
DO $$
DECLARE v_missing text;
BEGIN
  FOREACH v_missing IN ARRAY ARRAY[
    'comunicacao_templates','comunicacao_regras','comunicacao_eventos',
    'comunicacao_outbox','comunicacao_preferencias','comunicacao_audit_log',
    'comunicacao_consent_log'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=v_missing) THEN
      RAISE EXCEPTION 'postcheck: tabela ausente %', v_missing;
    END IF;
  END LOOP;

  -- RLS habilitada em todas as tabelas comunicacao_*
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public'
       AND c.relname IN ('comunicacao_templates','comunicacao_regras','comunicacao_eventos',
                         'comunicacao_outbox','comunicacao_preferencias','comunicacao_audit_log',
                         'comunicacao_consent_log')
       AND c.relrowsecurity = false
  ) THEN
    RAISE EXCEPTION 'postcheck: RLS não habilitado em alguma tabela comunicacao_*';
  END IF;

  -- anon sem privilégios em nenhuma tabela comunicacao_*
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE grantee='anon' AND table_schema='public'
       AND table_name LIKE 'comunicacao_%'
  ) THEN
    RAISE EXCEPTION 'postcheck: anon possui grant em tabela comunicacao_*';
  END IF;

  -- Enum comunicacao_evento_status NÃO deve conter 'failed'
  IF EXISTS (
    SELECT 1
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'comunicacao_evento_status' AND e.enumlabel = 'failed'
  ) THEN
    RAISE EXCEPTION 'postcheck: comunicacao_evento_status não pode conter label failed';
  END IF;

  -- RPCs presentes (nomes)
  FOREACH v_missing IN ARRAY ARRAY[
    'rpc_create_communication_template','rpc_update_communication_template',
    'rpc_activate_communication_template','rpc_upsert_communication_rule',
    'rpc_publish_communication_event','rpc_update_communication_preferences',
    'rpc_verify_communication_channel',
    'rpc_claim_communication_outbox','rpc_complete_communication_delivery',
    'rpc_fail_communication_delivery'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname=v_missing) THEN
      RAISE EXCEPTION 'postcheck: função ausente %', v_missing;
    END IF;
  END LOOP;

  -- Assinatura de rpc_update_communication_preferences: 3 args
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='rpc_update_communication_preferences'
       AND pronargs = 3
  ) THEN
    RAISE EXCEPTION 'postcheck: rpc_update_communication_preferences deve ter 3 args (canal, enabled, whatsapp_opt_in)';
  END IF;

  -- rpc_claim_communication_outbox deve exigir worker_id (3 args)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='rpc_claim_communication_outbox' AND pronargs = 3
  ) THEN
    RAISE EXCEPTION 'postcheck: rpc_claim_communication_outbox deve ter 3 args (batch, worker_id, lease_seconds)';
  END IF;

  -- Referências obsoletas: não deve haver função/tabela usando usuarios_cliente_produtor
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='usuarios_cliente_produtor'
  ) THEN
    RAISE EXCEPTION 'postcheck: tabela obsoleta usuarios_cliente_produtor não deveria existir';
  END IF;
END$$;
