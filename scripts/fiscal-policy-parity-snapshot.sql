-- Fase Fiscal 3.12 — SNAPSHOT DE PARIDADE DE POLICIES/RLS/GRANTS (SOMENTE LEITURA)
-- Executar como postgres no SQL Editor do Supabase. Este script:
--   * NÃO faz mutação (nenhum INSERT/UPDATE/DELETE/MERGE/TRUNCATE/CREATE/ALTER/DROP/GRANT/REVOKE/COPY/CALL);
--   * NÃO abre transação de escrita, não usa DO, SET, EXECUTE, temp table ou função auxiliar;
--   * NÃO acessa tabelas de negócio — apenas catálogos (pg_catalog e information_schema);
--   * NÃO exporta segredos, PII, nem conteúdo de linhas de negócio;
--   * Retorna uma única linha JSONB canônica e ordenada com fingerprints determinísticos;
--   * Registra objetos ausentes em vez de falhar.
--
-- Escopo fixo:
--   9 tabelas fiscais, 5 views de prontidão, 2 funções (rpc_fiscal_event_manual, mask_sensitive_jsonb).

WITH
  expected_tables(name) AS (
    VALUES
      ('company_fiscal_settings'),
      ('product_fiscal_profiles'),
      ('service_fiscal_profiles'),
      ('customer_fiscal_profiles'),
      ('fiscal_invoices'),
      ('fiscal_invoice_items'),
      ('fiscal_events'),
      ('fiscal_idempotency_keys'),
      ('fiscal_audit_log')
  ),
  expected_views(name) AS (
    VALUES
      ('v_fiscal_company_readiness'),
      ('v_product_fiscal_readiness'),
      ('v_service_fiscal_readiness'),
      ('v_customer_fiscal_readiness'),
      ('v_fiscal_document_reconciliation_pending')
  ),
  expected_functions(name) AS (
    VALUES
      ('rpc_fiscal_event_manual'),
      ('mask_sensitive_jsonb')
  ),
  policies_rows AS (
    SELECT
      p.tablename,
      p.policyname,
      p.permissive,
      p.cmd,
      COALESCE(to_jsonb(p.roles), '[]'::jsonb) AS roles,
      p.qual,
      p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename IN (SELECT name FROM expected_tables)
  ),
  policies_agg AS (
    SELECT
      COUNT(*) AS cnt,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'table', tablename,
            'policy', policyname,
            'permissive', permissive,
            'cmd', cmd,
            'roles', roles,
            'qual', qual,
            'with_check', with_check
          )
          ORDER BY tablename, policyname
        ),
        '[]'::jsonb
      ) AS data
    FROM policies_rows
  ),
  rls_agg AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'table', e.name,
          'exists', c.oid IS NOT NULL,
          'rls_enabled', COALESCE(c.relrowsecurity, false),
          'rls_forced', COALESCE(c.relforcerowsecurity, false)
        )
        ORDER BY e.name
      ),
      '[]'::jsonb
    ) AS data
    FROM expected_tables e
    LEFT JOIN pg_class c
      ON c.relname = e.name
     AND c.relnamespace = 'public'::regnamespace
     AND c.relkind = 'r'
  ),
  object_grants_agg AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'object', g.table_name,
          'grantee', g.grantee,
          'privilege', g.privilege_type
        )
        ORDER BY g.table_name, g.grantee, g.privilege_type
      ),
      '[]'::jsonb
    ) AS data
    FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public'
      AND g.grantee IN ('anon', 'authenticated')
      AND g.table_name IN (
        SELECT name FROM expected_tables
        UNION ALL
        SELECT name FROM expected_views
      )
  ),
  views_agg AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'view', e.name,
          'exists', c.oid IS NOT NULL,
          'kind', c.relkind,
          'owner', CASE WHEN c.oid IS NULL THEN NULL ELSE pg_get_userbyid(c.relowner) END,
          'security_invoker', COALESCE(
            (
              SELECT (split_part(opt, '=', 2) = 'true')
              FROM unnest(COALESCE(c.reloptions, ARRAY[]::text[])) opt
              WHERE opt LIKE 'security_invoker=%'
              LIMIT 1
            ),
            false
          )
        )
        ORDER BY e.name
      ),
      '[]'::jsonb
    ) AS data
    FROM expected_views e
    LEFT JOIN pg_class c
      ON c.relname = e.name
     AND c.relnamespace = 'public'::regnamespace
     AND c.relkind IN ('v', 'm')
  ),
  functions_agg AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'name', e.name,
          'exists', p.oid IS NOT NULL,
          'signature', CASE WHEN p.oid IS NULL THEN NULL ELSE pg_get_function_identity_arguments(p.oid) END,
          'result_type', CASE WHEN p.oid IS NULL THEN NULL ELSE pg_get_function_result(p.oid) END,
          'security_definer', COALESCE(p.prosecdef, false),
          'volatility', p.provolatile,
          'owner', CASE WHEN p.oid IS NULL THEN NULL ELSE pg_get_userbyid(p.proowner) END,
          'search_path', (
            SELECT string_agg(cfg, ',' ORDER BY cfg)
            FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
            WHERE cfg LIKE 'search_path=%'
          )
        )
        ORDER BY e.name
      ),
      '[]'::jsonb
    ) AS data
    FROM expected_functions e
    LEFT JOIN pg_proc p
      ON p.proname = e.name
     AND p.pronamespace = 'public'::regnamespace
  ),
  function_grants_agg AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'function', g.routine_name,
          'grantee', g.grantee,
          'privilege', g.privilege_type
        )
        ORDER BY g.routine_name, g.grantee, g.privilege_type
      ),
      '[]'::jsonb
    ) AS data
    FROM information_schema.role_routine_grants g
    WHERE g.routine_schema = 'public'
      AND g.grantee IN ('anon', 'authenticated')
      AND g.routine_name IN (SELECT name FROM expected_functions)
  ),
  constraints_agg AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'table', tbl.name,
          'name', c.conname,
          'type', c.contype,
          'definition', pg_get_constraintdef(c.oid)
        )
        ORDER BY tbl.name, c.conname
      ),
      '[]'::jsonb
    ) AS data
    FROM expected_tables tbl
    JOIN pg_class kls
      ON kls.relname = tbl.name
     AND kls.relnamespace = 'public'::regnamespace
     AND kls.relkind = 'r'
    JOIN pg_constraint c
      ON c.conrelid = kls.oid
     AND c.contype IN ('f', 'c', 'u', 'p')
  ),
  missing_agg AS (
    SELECT
      COALESCE(
        (SELECT jsonb_agg(name ORDER BY name)
         FROM expected_tables e
         WHERE NOT EXISTS (
           SELECT 1 FROM pg_class c
           WHERE c.relname = e.name
             AND c.relnamespace = 'public'::regnamespace
             AND c.relkind = 'r'
         )),
        '[]'::jsonb
      ) AS tables,
      COALESCE(
        (SELECT jsonb_agg(name ORDER BY name)
         FROM expected_views e
         WHERE NOT EXISTS (
           SELECT 1 FROM pg_class c
           WHERE c.relname = e.name
             AND c.relnamespace = 'public'::regnamespace
             AND c.relkind IN ('v', 'm')
         )),
        '[]'::jsonb
      ) AS views,
      COALESCE(
        (SELECT jsonb_agg(name ORDER BY name)
         FROM expected_functions e
         WHERE NOT EXISTS (
           SELECT 1 FROM pg_proc p
           WHERE p.proname = e.name
             AND p.pronamespace = 'public'::regnamespace
         )),
        '[]'::jsonb
      ) AS functions
  )
SELECT jsonb_build_object(
  'phase', 'fiscal-3.12-policy-parity',
  'schema', 'public',
  'expected', jsonb_build_object(
    'tables', (SELECT jsonb_agg(name ORDER BY name) FROM expected_tables),
    'views', (SELECT jsonb_agg(name ORDER BY name) FROM expected_views),
    'functions', (SELECT jsonb_agg(name ORDER BY name) FROM expected_functions)
  ),
  'policies', jsonb_build_object(
    'count', (SELECT cnt FROM policies_agg),
    'items', (SELECT data FROM policies_agg)
  ),
  'rls', (SELECT data FROM rls_agg),
  'object_grants', (SELECT data FROM object_grants_agg),
  'views', (SELECT data FROM views_agg),
  'functions', (SELECT data FROM functions_agg),
  'function_grants', (SELECT data FROM function_grants_agg),
  'constraints', (SELECT data FROM constraints_agg),
  'missing', jsonb_build_object(
    'tables', (SELECT tables FROM missing_agg),
    'views', (SELECT views FROM missing_agg),
    'functions', (SELECT functions FROM missing_agg)
  ),
  'fingerprints', jsonb_build_object(
    'policies', md5((SELECT data FROM policies_agg)::text),
    'rls', md5((SELECT data FROM rls_agg)::text),
    'object_grants', md5((SELECT data FROM object_grants_agg)::text),
    'views', md5((SELECT data FROM views_agg)::text),
    'functions', md5((SELECT data FROM functions_agg)::text),
    'function_grants', md5((SELECT data FROM function_grants_agg)::text),
    'constraints', md5((SELECT data FROM constraints_agg)::text),
    'global', md5(
      (SELECT data FROM policies_agg)::text
      || '|' || (SELECT data FROM rls_agg)::text
      || '|' || (SELECT data FROM object_grants_agg)::text
      || '|' || (SELECT data FROM views_agg)::text
      || '|' || (SELECT data FROM functions_agg)::text
      || '|' || (SELECT data FROM function_grants_agg)::text
      || '|' || (SELECT data FROM constraints_agg)::text
    )
  )
) AS parity_snapshot;
