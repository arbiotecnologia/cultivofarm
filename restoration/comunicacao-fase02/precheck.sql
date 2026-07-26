-- Precheck da Comunicação Fase 0.2 (revisão bloqueante).
-- Executar ANTES de aplicar migration.sql. Nada altera dados.

\set ON_ERROR_STOP on
\pset pager off

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='notificacoes_operacionais') THEN RAISE EXCEPTION 'notificacoes_operacionais ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='portal_notificacoes')       THEN RAISE EXCEPTION 'portal_notificacoes ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='aplicacao_emails')          THEN RAISE EXCEPTION 'aplicacao_emails ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='monitoramento_avisos')      THEN RAISE EXCEPTION 'monitoramento_avisos ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type   WHERE typname='tipo_notificacao_portal')                             THEN RAISE EXCEPTION 'enum tipo_notificacao_portal ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type   WHERE typname='app_role')                                            THEN RAISE EXCEPTION 'enum app_role ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc   WHERE proname='has_role')                                            THEN RAISE EXCEPTION 'has_role() ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc   WHERE proname='get_cliente_ids_for_user')                            THEN RAISE EXCEPTION 'get_cliente_ids_for_user() ausente'; END IF;
END $$;

\echo '--- POLICIES POR COMANDO (todas as 4 tabelas) ---'
SELECT tablename, cmd, policyname, roles::text AS roles,
       COALESCE(qual,'')      AS using_expr,
       COALESCE(with_check,'') AS check_expr
  FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('notificacoes_operacionais','portal_notificacoes','aplicacao_emails','monitoramento_avisos')
 ORDER BY tablename, cmd, policyname;

\echo '--- POLICIES PERMISSIVAS ALL (potencial de reabrir escrita) ---'
SELECT tablename, policyname, cmd, roles::text
  FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('notificacoes_operacionais','portal_notificacoes','aplicacao_emails','monitoramento_avisos')
   AND cmd IN ('ALL','INSERT','DELETE','UPDATE')
 ORDER BY tablename, cmd, policyname;

\echo '--- GRANTS ---'
SELECT grantee, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants
 WHERE table_schema='public'
   AND table_name IN ('notificacoes_operacionais','portal_notificacoes','aplicacao_emails','monitoramento_avisos')
 GROUP BY grantee, table_name
 ORDER BY table_name, grantee;

\echo '--- VOLUME ---'
SELECT 'notificacoes_operacionais' AS t, count(*) FROM public.notificacoes_operacionais
UNION ALL SELECT 'portal_notificacoes',        count(*) FROM public.portal_notificacoes
UNION ALL SELECT 'aplicacao_emails',           count(*) FROM public.aplicacao_emails
UNION ALL SELECT 'monitoramento_avisos',       count(*) FROM public.monitoramento_avisos;

\echo '--- DUPLICATAS QUE BLOQUEARIAM UNIQUES ---'
SELECT 'monitoramento_avisos' AS t,
       registro_consultor_id, tipo,
       (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dref,
       count(*) AS n
  FROM public.monitoramento_avisos
 GROUP BY 1,2,3,4
HAVING count(*) > 1
 ORDER BY n DESC LIMIT 20;


DO $$
DECLARE v_dup int;
BEGIN
  SELECT count(*) INTO v_dup
    FROM (
      SELECT registro_consultor_id, tipo,
             (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dref
        FROM public.monitoramento_avisos
       GROUP BY 1,2,3 HAVING count(*) > 1
    ) d;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'monitoramento_avisos contém % duplicata(s) diária(s); sanear/arquivar de forma auditável antes da migration', v_dup;
  END IF;
END $$;

DO $$
DECLARE v_dup int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notificacoes_operacionais' AND column_name='idempotency_key') THEN
    SELECT count(*) INTO v_dup FROM (
      SELECT idempotency_key FROM public.notificacoes_operacionais
       WHERE idempotency_key IS NOT NULL GROUP BY 1 HAVING count(*) > 1
    ) d;
    IF v_dup > 0 THEN RAISE EXCEPTION 'notificacoes_operacionais contém % idempotency_key(s) duplicada(s)', v_dup; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='portal_notificacoes' AND column_name='idempotency_key') THEN
    SELECT count(*) INTO v_dup FROM (
      SELECT idempotency_key FROM public.portal_notificacoes
       WHERE idempotency_key IS NOT NULL GROUP BY 1 HAVING count(*) > 1
    ) d;
    IF v_dup > 0 THEN RAISE EXCEPTION 'portal_notificacoes contém % idempotency_key(s) duplicada(s)', v_dup; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='aplicacao_emails' AND column_name='idempotency_key') THEN
    SELECT count(*) INTO v_dup FROM (
      SELECT idempotency_key FROM public.aplicacao_emails
       WHERE idempotency_key IS NOT NULL GROUP BY 1 HAVING count(*) > 1
    ) d;
    IF v_dup > 0 THEN RAISE EXCEPTION 'aplicacao_emails contém % idempotency_key(s) duplicada(s)', v_dup; END IF;
  END IF;
END $$;
