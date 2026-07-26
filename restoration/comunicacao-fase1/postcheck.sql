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
    'rpc_activate_communication_template','rpc_archive_communication_template',
    'rpc_upsert_communication_rule',
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

  -- Assinaturas críticas — verificação exata via pg_get_function_identity_arguments
  -- e proibição de overloads legados (mais de 1 definição por nome).
  DECLARE
    r record;
    expected text;
    actual   text;
  BEGIN
    FOR r IN
      SELECT * FROM (VALUES
        ('rpc_create_communication_template',
         'p_chave text, p_nome text, p_canal public.comunicacao_canal, p_assunto text, p_corpo text, p_variaveis jsonb'),
        ('rpc_update_communication_template',
         'p_template_id uuid, p_nome text, p_assunto text, p_corpo text, p_variaveis jsonb'),
        ('rpc_activate_communication_template', 'p_template_id uuid'),
        ('rpc_archive_communication_template',  'p_template_id uuid'),
        ('rpc_upsert_communication_rule',
         'p_rule_id uuid, p_event_key text, p_perfil public.app_role, p_estrategia text, p_canal public.comunicacao_canal, p_template_chave text, p_template_versao integer, p_condicoes jsonb, p_prioridade integer, p_enabled boolean, p_cooldown_seconds integer'),
        ('rpc_publish_communication_event',
         'p_event_key text, p_source_type text, p_source_id uuid, p_payload jsonb, p_idempotency_key text'),
        ('rpc_update_communication_preferences',
         'p_canal public.comunicacao_canal, p_enabled boolean, p_whatsapp_opt_in boolean'),
        ('rpc_verify_communication_channel',
         'p_user_id uuid, p_cliente_id uuid, p_canal public.comunicacao_canal, p_email_verificado boolean, p_telefone_verificado boolean'),
        ('rpc_claim_communication_outbox',
         'p_batch_size integer, p_worker_id text, p_lease_seconds integer'),
        ('rpc_complete_communication_delivery',
         'p_outbox_id uuid, p_worker_id text, p_provider_message_id text'),
        ('rpc_fail_communication_delivery',
         'p_outbox_id uuid, p_worker_id text, p_error_code text, p_error_message text')
      ) AS t(fname, sig)
    LOOP
      expected := r.sig;

      -- Overload legado: mais de uma definição para o mesmo nome é proibido.
      IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname=r.fname) <> 1 THEN
        RAISE EXCEPTION 'postcheck: % possui overload legado conflitante (esperado 1 definição)', r.fname;
      END IF;

      SELECT pg_get_function_identity_arguments(p.oid) INTO actual
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname=r.fname;

      IF actual IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'postcheck: assinatura de % não confere.%  esperado: %%  atual:    %',
          r.fname, chr(10), expected, chr(10), actual;
      END IF;
    END LOOP;
  END;

  -- Higiene: nenhuma tabela funcional usuarios_cliente_produtor deve existir.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='usuarios_cliente_produtor'
  ) THEN
    RAISE EXCEPTION 'postcheck: tabela obsoleta usuarios_cliente_produtor não deveria existir';
  END IF;
END$$;
