-- ============================================================================
-- HARDENING CULTIVOFARM — COLETA DE INVENTÁRIO (ESTRITAMENTE SOMENTE LEITURA)
-- Alvo permitido: swzpzcwiasxmjutrmvkm (CultivoFarm)
-- PROIBIDOS: navfzbwgwzruipouyfnk (produção antiga),
--            ikaauvsflpmamgxmkhoq (homologação),
--            yzszlzjpovmcteuxjznj (sandbox)
--
-- Este arquivo NÃO cria, altera nem remove nada. Nenhum INSERT/UPDATE/DELETE/DDL.
-- Nenhuma consulta retorna senhas, tokens, DSN, chaves ou conteúdo do Vault.
--
-- Execução recomendada (SQL Editor do CultivoFarm): rodar bloco a bloco.
-- Execução por psql:
--   psql "$CULTIVOFARM_DSN" -X -v ON_ERROR_STOP=1 -f 00-coleta-readonly.sql \
--     > inventario-cultivofarm-$(date +%F).txt
-- ============================================================================

SET default_transaction_read_only = on;

-- ---------------------------------------------------------------------------
-- BLOCO 0 — Identificação do alvo (confirme o ref antes de seguir)
-- ---------------------------------------------------------------------------
SELECT current_database() AS db,
       current_user       AS usr,
       version()          AS pg_version,
       now()              AS coletado_em;

-- ---------------------------------------------------------------------------
-- BLOCO 1 — Tabelas em public/private e estado de RLS
-- ---------------------------------------------------------------------------
SELECT n.nspname                AS schema,
       c.relname                AS tabela,
       c.relkind                AS tipo,
       c.relrowsecurity         AS rls_habilitada,
       c.relforcerowsecurity    AS rls_forcada,
       pg_get_userbyid(c.relowner) AS owner,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS qtd_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public','private')
  AND c.relkind IN ('r','p','f')
ORDER BY 1, 2;

-- ---------------------------------------------------------------------------
-- BLOCO 2 — Policies completas (comando, roles, USING, WITH CHECK)
-- ---------------------------------------------------------------------------
SELECT schemaname AS schema,
       tablename  AS tabela,
       policyname AS policy,
       permissive,
       roles,
       cmd        AS comando,
       qual       AS using_expr,
       with_check AS with_check_expr
FROM pg_policies
WHERE schemaname IN ('public','private','storage')
ORDER BY 1, 2, 3;

-- ---------------------------------------------------------------------------
-- BLOCO 3 — Grants por objeto (tabelas, views, sequências)
-- ---------------------------------------------------------------------------
SELECT table_schema AS schema,
       table_name   AS objeto,
       grantee,
       privilege_type,
       is_grantable
FROM information_schema.role_table_grants
WHERE table_schema IN ('public','private','storage')
  AND grantee IN ('anon','authenticated','service_role','PUBLIC')
ORDER BY 1, 2, 3, 4;

SELECT sequence_schema AS schema,
       sequence_name   AS sequencia,
       grantee,
       privilege_type
FROM information_schema.usage_privileges up
JOIN information_schema.sequences s
  ON s.sequence_schema = up.object_schema AND s.sequence_name = up.object_name
WHERE sequence_schema IN ('public','private')
  AND grantee IN ('anon','authenticated','service_role','PUBLIC')
ORDER BY 1, 2, 3;

-- Privilégios de USAGE em schemas
SELECT n.nspname AS schema, r.rolname AS role,
       has_schema_privilege(r.rolname, n.nspname, 'USAGE')  AS usage,
       has_schema_privilege(r.rolname, n.nspname, 'CREATE') AS create_priv
FROM pg_namespace n
CROSS JOIN pg_roles r
WHERE n.nspname IN ('public','private','extensions','storage')
  AND r.rolname IN ('anon','authenticated','service_role')
ORDER BY 1, 2;

-- ---------------------------------------------------------------------------
-- BLOCO 4 — Views e matviews, com security_invoker / security_barrier
-- ---------------------------------------------------------------------------
SELECT n.nspname                       AS schema,
       c.relname                       AS view_name,
       c.relkind                       AS tipo,
       pg_get_userbyid(c.relowner)     AS owner,
       coalesce((
         SELECT option_value FROM pg_options_to_table(c.reloptions)
         WHERE option_name = 'security_invoker'), 'false') AS security_invoker,
       coalesce((
         SELECT option_value FROM pg_options_to_table(c.reloptions)
         WHERE option_name = 'security_barrier'), 'false') AS security_barrier
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public','private')
  AND c.relkind IN ('v','m')
ORDER BY 1, 2;

-- ---------------------------------------------------------------------------
-- BLOCO 5 — Funções: owner, linguagem, security definer, proconfig, ACL
-- ---------------------------------------------------------------------------
SELECT n.nspname                          AS schema,
       p.proname                          AS funcao,
       pg_get_function_identity_arguments(p.oid) AS assinatura,
       pg_get_userbyid(p.proowner)        AS owner,
       l.lanname                          AS linguagem,
       p.prosecdef                        AS security_definer,
       p.proconfig                        AS proconfig,
       p.proacl::text                     AS acl,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS exec_anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS exec_authenticated
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language  l ON l.oid = p.prolang
WHERE n.nspname IN ('public','private')
ORDER BY 1, 2, 3;

-- Resumo agregado (para conferência rápida de números)
SELECT count(*) FILTER (WHERE p.prosecdef)                         AS total_secdef,
       count(*) FILTER (WHERE p.prosecdef
                          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS secdef_exec_authenticated,
       count(*) FILTER (WHERE p.prosecdef
                          AND has_function_privilege('anon', p.oid, 'EXECUTE'))          AS secdef_exec_anon,
       count(*) FILTER (WHERE p.prosecdef AND p.proconfig IS NULL)  AS secdef_sem_search_path
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','private');

-- ---------------------------------------------------------------------------
-- BLOCO 6 — Triggers
-- ---------------------------------------------------------------------------
SELECT n.nspname AS schema, c.relname AS tabela, t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t
JOIN pg_class c     ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname IN ('public','private')
ORDER BY 1, 2, 3;

-- ---------------------------------------------------------------------------
-- BLOCO 7 — Storage: buckets e policies (sem listar objetos/arquivos)
-- ---------------------------------------------------------------------------
SELECT id AS bucket, name, public AS publico, file_size_limit, allowed_mime_types, created_at
FROM storage.buckets
ORDER BY 1;

SELECT policyname AS policy, tablename AS tabela, roles, cmd AS comando,
       qual AS using_expr, with_check AS with_check_expr
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY 2, 1;

SELECT c.relname AS tabela_storage, c.relrowsecurity AS rls_habilitada
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'storage' AND c.relkind = 'r'
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- BLOCO 8 — Extensões, ledger e contagem de contas (sem expor e-mails)
-- ---------------------------------------------------------------------------
SELECT extname, extversion, n.nspname AS schema
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY 1;

SELECT count(*) AS ledger_total, coalesce(max(version),'VAZIO') AS ledger_latest
FROM supabase_migrations.schema_migrations;

SELECT count(*) AS auth_users_total FROM auth.users;
SELECT role, count(*) AS qtd FROM public.user_roles GROUP BY 1 ORDER BY 1;

-- FIM — nenhuma escrita foi emitida por este arquivo.
