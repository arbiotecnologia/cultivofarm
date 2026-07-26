-- Postcheck Fase 1 (read-only)
DO $$
DECLARE v_missing text;
BEGIN
  FOREACH v_missing IN ARRAY ARRAY[
    'comunicacao_templates','comunicacao_regras','comunicacao_eventos',
    'comunicacao_outbox','comunicacao_preferencias','comunicacao_audit_log'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=v_missing) THEN
      RAISE EXCEPTION 'postcheck: tabela ausente %', v_missing;
    END IF;
  END LOOP;

  -- RLS habilitada em todas
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public'
       AND c.relname IN ('comunicacao_templates','comunicacao_regras','comunicacao_eventos',
                         'comunicacao_outbox','comunicacao_preferencias','comunicacao_audit_log')
       AND c.relrowsecurity = false
  ) THEN
    RAISE EXCEPTION 'postcheck: RLS não habilitado em alguma tabela comunicacao_*';
  END IF;

  -- anon sem privilégios
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE grantee='anon' AND table_schema='public'
       AND table_name LIKE 'comunicacao_%'
  ) THEN
    RAISE EXCEPTION 'postcheck: anon possui grant em tabela comunicacao_*';
  END IF;

  -- RPCs presentes
  FOREACH v_missing IN ARRAY ARRAY[
    'rpc_create_communication_template','rpc_update_communication_template',
    'rpc_activate_communication_template','rpc_upsert_communication_rule',
    'rpc_publish_communication_event','rpc_update_communication_preferences',
    'rpc_claim_communication_outbox','rpc_complete_communication_delivery',
    'rpc_fail_communication_delivery'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname=v_missing) THEN
      RAISE EXCEPTION 'postcheck: função ausente %', v_missing;
    END IF;
  END LOOP;
END$$;
