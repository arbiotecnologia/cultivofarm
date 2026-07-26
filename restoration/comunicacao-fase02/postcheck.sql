-- Postcheck da migration Comunicação Fase 0.2.
-- Executar APÓS aplicar restoration/comunicacao-fase02/migration.sql.
-- Falha alto se qualquer invariante esperada não estiver presente.

DO $$
DECLARE
  n int;
BEGIN
  -- Colunas aditivas
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='notificacoes_operacionais'
     AND column_name IN ('source_type','source_id','idempotency_key');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n < 3 THEN RAISE EXCEPTION 'notificacoes_operacionais: colunas aditivas ausentes'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='portal_notificacoes'
     AND column_name IN ('link','created_by','source_type','source_id','idempotency_key');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n < 5 THEN RAISE EXCEPTION 'portal_notificacoes: colunas aditivas ausentes'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='aplicacao_emails'
     AND column_name='idempotency_key';
  IF NOT FOUND THEN RAISE EXCEPTION 'aplicacao_emails.idempotency_key ausente'; END IF;

  -- data_referencia deve ser NORMAL (não GENERATED) e NOT NULL
  PERFORM 1 FROM pg_attribute
   WHERE attrelid='public.monitoramento_avisos'::regclass
     AND attname='data_referencia'
     AND attnotnull
     AND (attgenerated IS NULL OR attgenerated = '');
  IF NOT FOUND THEN RAISE EXCEPTION 'monitoramento_avisos.data_referencia deve ser NOT NULL e não-GENERATED'; END IF;

  -- Unique indexes
  PERFORM 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname IN (
      'ux_notif_op_idempotency','ux_portal_notif_idempotency',
      'ux_aplicacao_emails_idempotency','ux_monitoramento_avisos_dia'
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n < 4 THEN RAISE EXCEPTION 'índices unique esperados ausentes'; END IF;

  -- RPCs canônicas (assinaturas longas)
  PERFORM 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='rpc_create_notificacao_operacional'
     AND pg_get_function_arguments(p.oid) LIKE '%_idempotency_key%';
  IF NOT FOUND THEN RAISE EXCEPTION 'rpc_create_notificacao_operacional 8-args ausente'; END IF;

  PERFORM 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='rpc_create_portal_notification_secure'
     AND pg_get_function_arguments(p.oid) LIKE '%_idempotency_key%';
  IF NOT FOUND THEN RAISE EXCEPTION 'rpc_create_portal_notification_secure 8-args ausente'; END IF;

  PERFORM 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname='rpc_record_aplicacao_email'
     AND pg_get_function_arguments(p.oid) LIKE '%_idempotency_key%';
  IF NOT FOUND THEN RAISE EXCEPTION 'rpc_record_aplicacao_email 5-args ausente'; END IF;

  -- Policies de negação de INSERT direto
  PERFORM 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='notificacoes_operacionais'
    AND policyname='Deny direct insert on notificacoes_operacionais';
  IF NOT FOUND THEN RAISE EXCEPTION 'policy Deny INSERT em notificacoes_operacionais ausente'; END IF;

  PERFORM 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='portal_notificacoes'
    AND policyname='Deny direct insert on portal_notificacoes';
  IF NOT FOUND THEN RAISE EXCEPTION 'policy Deny INSERT em portal_notificacoes ausente'; END IF;

  PERFORM 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='aplicacao_emails'
    AND policyname='Deny direct insert on aplicacao_emails';
  IF NOT FOUND THEN RAISE EXCEPTION 'policy Deny INSERT em aplicacao_emails ausente'; END IF;

  RAISE NOTICE 'Postcheck OK';
END $$;

-- Dumps para revisão humana
SELECT schemaname, tablename, policyname, cmd, roles::text, qual, with_check
  FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN (
     'notificacoes_operacionais','portal_notificacoes',
     'aplicacao_emails','monitoramento_avisos'
   )
 ORDER BY tablename, policyname;

SELECT grantee, table_name,
       string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants
 WHERE table_schema='public'
   AND table_name IN (
     'notificacoes_operacionais','portal_notificacoes',
     'aplicacao_emails','monitoramento_avisos'
   )
 GROUP BY grantee, table_name
 ORDER BY table_name, grantee;

SELECT n.nspname AS schema, c.relname AS relation, c.relacl AS proacl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
   AND c.relname IN (
     'notificacoes_operacionais','portal_notificacoes',
     'aplicacao_emails','monitoramento_avisos'
   );
