-- Precheck da migration Comunicação Fase 0.2.
-- Deve ser executado ANTES de aplicar restoration/comunicacao-fase02/migration.sql.
-- Não altera dados. Aborta com RAISE EXCEPTION se preconditions não forem atendidas.

DO $$
DECLARE
  n int;
BEGIN
  -- Tabelas alvo existem
  PERFORM 1 FROM pg_tables WHERE schemaname='public' AND tablename='notificacoes_operacionais';
  IF NOT FOUND THEN RAISE EXCEPTION 'notificacoes_operacionais ausente'; END IF;
  PERFORM 1 FROM pg_tables WHERE schemaname='public' AND tablename='portal_notificacoes';
  IF NOT FOUND THEN RAISE EXCEPTION 'portal_notificacoes ausente'; END IF;
  PERFORM 1 FROM pg_tables WHERE schemaname='public' AND tablename='aplicacao_emails';
  IF NOT FOUND THEN RAISE EXCEPTION 'aplicacao_emails ausente'; END IF;
  PERFORM 1 FROM pg_tables WHERE schemaname='public' AND tablename='monitoramento_avisos';
  IF NOT FOUND THEN RAISE EXCEPTION 'monitoramento_avisos ausente'; END IF;

  -- Enum canônico
  PERFORM 1 FROM pg_type WHERE typname='tipo_notificacao_portal';
  IF NOT FOUND THEN RAISE EXCEPTION 'enum tipo_notificacao_portal ausente'; END IF;

  -- Funções auxiliares esperadas
  PERFORM 1 FROM pg_proc WHERE proname='has_role';
  IF NOT FOUND THEN RAISE EXCEPTION 'has_role() ausente'; END IF;
  PERFORM 1 FROM pg_proc WHERE proname='get_cliente_ids_for_user';
  IF NOT FOUND THEN RAISE EXCEPTION 'get_cliente_ids_for_user() ausente'; END IF;

  -- Tipo app_role
  PERFORM 1 FROM pg_type WHERE typname='app_role';
  IF NOT FOUND THEN RAISE EXCEPTION 'enum app_role ausente'; END IF;
END $$;

-- Snapshot de policies ativas antes da migration (para diff pós-aplicação).
SELECT schemaname, tablename, policyname, cmd, roles::text AS roles, qual, with_check
  FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN (
     'notificacoes_operacionais','portal_notificacoes',
     'aplicacao_emails','monitoramento_avisos'
   )
 ORDER BY tablename, policyname;

-- Snapshot de grants
SELECT grantee, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants
 WHERE table_schema='public'
   AND table_name IN (
     'notificacoes_operacionais','portal_notificacoes',
     'aplicacao_emails','monitoramento_avisos'
   )
 GROUP BY grantee, table_name
 ORDER BY table_name, grantee;

-- Volume atual
SELECT 'notificacoes_operacionais' AS t, count(*) FROM public.notificacoes_operacionais
UNION ALL SELECT 'portal_notificacoes',        count(*) FROM public.portal_notificacoes
UNION ALL SELECT 'aplicacao_emails',           count(*) FROM public.aplicacao_emails
UNION ALL SELECT 'monitoramento_avisos',       count(*) FROM public.monitoramento_avisos;
