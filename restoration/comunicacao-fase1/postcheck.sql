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

  -- Assinaturas críticas — verificação por resolução de tipos via to_regprocedure
  -- (independe de search_path, nomes de parâmetros e formatação). Exige
  -- exatamente uma definição por nome para impedir overload legado.
  -- Retornos são validados separadamente (jsonb, ou SETOF quando aplicável).
  DECLARE
    r record;
    ret_is_set boolean;
    ret_type   text;
  BEGIN
    FOR r IN
      SELECT * FROM (VALUES
        ('rpc_create_communication_template',
         'text,text,public.comunicacao_canal,text,text,jsonb',
         'jsonb', false),
        ('rpc_update_communication_template',
         'uuid,text,text,text,jsonb',
         'jsonb', false),
        ('rpc_activate_communication_template', 'uuid', 'jsonb', false),
        ('rpc_archive_communication_template',  'uuid', 'jsonb', false),
        ('rpc_upsert_communication_rule',
         'uuid,text,public.app_role,text,public.comunicacao_canal,text,integer,jsonb,integer,boolean,integer',
         'jsonb', false),
        ('rpc_publish_communication_event',
         'text,text,uuid,jsonb,text',
         'jsonb', false),
        ('rpc_update_communication_preferences',
         'public.comunicacao_canal,boolean,boolean',
         'jsonb', false),
        ('rpc_verify_communication_channel',
         'uuid,uuid,public.comunicacao_canal,boolean,boolean',
         'jsonb', false),
        ('rpc_claim_communication_outbox',
         'integer,text,integer',
         NULL, true),
        ('rpc_complete_communication_delivery',
         'uuid,text,text',
         'jsonb', false),
        ('rpc_fail_communication_delivery',
         'uuid,text,text,text',
         'jsonb', false)
      ) AS t(fname, types, ret_name, is_set)
    LOOP
      -- Overload legado: mais de uma definição para o mesmo nome é proibido.
      IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname=r.fname) <> 1 THEN
        RAISE EXCEPTION 'postcheck: % possui overload legado conflitante (esperado exatamente 1 definição)', r.fname;
      END IF;

      -- Resolução por tipos: independente de nomes de parâmetros/search_path.
      IF to_regprocedure(format('public.%I(%s)', r.fname, r.types)) IS NULL THEN
        RAISE EXCEPTION 'postcheck: assinatura de tipos de % não confere. Esperada: public.%(%)',
          r.fname, r.fname, r.types;
      END IF;

      -- Validação de retorno.
      SELECT p.proretset, pg_catalog.format_type(p.prorettype, NULL)
        INTO ret_is_set, ret_type
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname=r.fname;

      IF r.is_set THEN
        IF NOT ret_is_set THEN
          RAISE EXCEPTION 'postcheck: % deveria retornar SETOF', r.fname;
        END IF;
      ELSE
        IF ret_is_set THEN
          RAISE EXCEPTION 'postcheck: % não deveria retornar SETOF', r.fname;
        END IF;
        IF ret_type IS DISTINCT FROM r.ret_name THEN
          RAISE EXCEPTION 'postcheck: retorno de % é % (esperado %)',
            r.fname, ret_type, r.ret_name;
        END IF;
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
