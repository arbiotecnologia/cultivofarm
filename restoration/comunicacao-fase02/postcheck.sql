-- Postcheck da Comunicação Fase 0.2 (revisão bloqueante).
-- Executar APÓS aplicar migration.sql.

\set ON_ERROR_STOP on
\pset pager off

DO $$
DECLARE
  n int;
BEGIN
  -- Colunas aditivas
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='notificacoes_operacionais'
     AND column_name IN ('source_type','source_id','idempotency_key');
  IF n < 3 THEN RAISE EXCEPTION 'notificacoes_operacionais: colunas aditivas ausentes'; END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='portal_notificacoes'
     AND column_name IN ('link','created_by','source_type','source_id','idempotency_key');
  IF n < 5 THEN RAISE EXCEPTION 'portal_notificacoes: colunas aditivas ausentes'; END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='aplicacao_emails'
     AND column_name='idempotency_key';
  IF n < 1 THEN RAISE EXCEPTION 'aplicacao_emails.idempotency_key ausente'; END IF;

  -- data_referencia NORMAL e NOT NULL
  PERFORM 1 FROM pg_attribute
   WHERE attrelid='public.monitoramento_avisos'::regclass AND attname='data_referencia'
     AND attnotnull AND (attgenerated IS NULL OR attgenerated = '');
  IF NOT FOUND THEN RAISE EXCEPTION 'monitoramento_avisos.data_referencia inválida'; END IF;

  -- Uniques
  SELECT count(*) INTO n FROM pg_indexes WHERE schemaname='public'
    AND indexname IN ('ux_notif_op_idempotency','ux_portal_notif_idempotency',
                      'ux_aplicacao_emails_idempotency','ux_monitoramento_avisos_dia');
  IF n < 4 THEN RAISE EXCEPTION 'índices unique ausentes'; END IF;

  -- RPCs canônicas (8-args)
  PERFORM 1 FROM pg_proc WHERE proname='rpc_create_notificacao_operacional'
    AND pg_get_function_identity_arguments(oid) LIKE '%uuid%text%text%text%text%text%uuid%text%';
  IF NOT FOUND THEN RAISE EXCEPTION 'rpc_create_notificacao_operacional 8-args ausente'; END IF;

  PERFORM 1 FROM pg_proc WHERE proname='rpc_create_portal_notification_secure'
    AND pg_get_function_identity_arguments(oid) LIKE '%uuid%text%text%text%text%text%uuid%text%';
  IF NOT FOUND THEN RAISE EXCEPTION 'rpc_create_portal_notification_secure 8-args ausente'; END IF;

  PERFORM 1 FROM pg_proc WHERE proname='rpc_record_aplicacao_email'
    AND pg_get_function_identity_arguments(oid) LIKE '%uuid%text%text%text%uuid%';
  IF NOT FOUND THEN RAISE EXCEPTION 'rpc_record_aplicacao_email 5-args ausente'; END IF;

  PERFORM 1 FROM pg_proc WHERE proname='rpc_check_monitoramento_and_notify';
  IF NOT FOUND THEN RAISE EXCEPTION 'rpc_check_monitoramento_and_notify ausente'; END IF;

  -- Policies canônicas
  FOR n IN
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname IN (
      'Deny direct insert on notificacoes_operacionais',
      'Deny direct delete on notificacoes_operacionais',
      'user_update_own_notif_op',
      'Portal users can read own notifications',
      'Portal users can update own notifications',
      'Deny direct insert on portal_notificacoes',
      'Deny direct delete on portal_notificacoes',
      'Deny direct insert on aplicacao_emails',
      'Deny direct update on aplicacao_emails',
      'Deny direct delete on aplicacao_emails',
      'Deny authenticated write on monitoramento_avisos',
      'Visualização para usuários autenticados'
    )
  LOOP END LOOP;

  -- Nenhuma policy permissiva de INSERT/DELETE ainda ativa para authenticated nas 3 tabelas.
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('notificacoes_operacionais','portal_notificacoes','aplicacao_emails')
     AND cmd IN ('INSERT','DELETE','ALL')
     AND coalesce(with_check::text,'') NOT ILIKE '%false%'
     AND coalesce(qual::text,'')       NOT ILIKE '%false%';
  IF n > 0 THEN
    RAISE EXCEPTION 'Sobrou policy INSERT/DELETE/ALL permissiva nas 3 tabelas restritas (%)', n;
  END IF;

  RAISE NOTICE 'Postcheck OK';
END $$;

\echo '--- POLICIES POR COMANDO PÓS ---'
SELECT tablename, cmd, policyname, roles::text, coalesce(qual,'') AS using_expr, coalesce(with_check,'') AS check_expr
  FROM pg_policies WHERE schemaname='public'
   AND tablename IN ('notificacoes_operacionais','portal_notificacoes','aplicacao_emails','monitoramento_avisos')
 ORDER BY tablename, cmd, policyname;

\echo '--- GRANTS PÓS ---'
SELECT grantee, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants
 WHERE table_schema='public'
   AND table_name IN ('notificacoes_operacionais','portal_notificacoes','aplicacao_emails','monitoramento_avisos')
 GROUP BY grantee, table_name ORDER BY table_name, grantee;

\echo '--- proacl das tabelas ---'
SELECT n.nspname AS schema, c.relname AS relation, c.relacl AS relacl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
   AND c.relname IN ('notificacoes_operacionais','portal_notificacoes','aplicacao_emails','monitoramento_avisos');
