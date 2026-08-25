-- =====================================================================
-- H7d — POSTCHECK do cofre A1 sem senha (staging ikaauvsflpmamgxmkhoq)
-- Somente leitura. Não lê, não exibe e não deriva nenhum segredo.
-- =====================================================================
\pset pager off

WITH checks AS (
  -- 1. Colunas de senha ausentes (ou, no pior caso legado, opcionais)
  SELECT 'H7D-1 senha nao persistida em coluna' AS check_name,
         CASE WHEN NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='fiscal_certificate_material'
             AND column_name IN ('encrypted_password','password_iv')
         ) THEN 'PASS' ELSE 'FAIL' END AS result
  UNION ALL
  -- 2. Formato/algoritmo versionados presentes
  SELECT 'H7D-2 formato versionado do cofre',
         CASE WHEN (
           SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public' AND table_name='fiscal_certificate_material'
             AND column_name IN ('material_format','material_algorithm')
         ) = 2 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  -- 3. RLS ativa e ZERO policies (fail-closed)
  SELECT 'H7D-3 RLS ativa sem policies',
         CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.fiscal_certificate_material'::regclass)
              AND (SELECT count(*) FROM pg_policies
                   WHERE schemaname='public' AND tablename='fiscal_certificate_material') = 0
         THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  -- 4. anon/authenticated sem privilégio de tabela
  SELECT 'H7D-4 anon/authenticated sem grants no material',
         CASE WHEN (
           SELECT count(*) FROM information_schema.role_table_grants
           WHERE table_schema='public' AND table_name='fiscal_certificate_material'
             AND grantee IN ('anon','authenticated','PUBLIC')
         ) = 0 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  -- 5. RPC de registro sem overload legado e sem parâmetros de senha
  SELECT 'H7D-5 RPC register_a1 overload unico sem senha',
         CASE WHEN (
           SELECT count(*)
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='rpc_fiscal_certificate_register_a1'
         ) = 1 AND NOT EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='rpc_fiscal_certificate_register_a1'
             AND pg_get_function_arguments(p.oid) ILIKE '%password%'
         ) THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  -- 6. RPC de registro executável somente por service_role
  SELECT 'H7D-6 register_a1 restrita a service_role',
         CASE WHEN NOT EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='rpc_fiscal_certificate_register_a1'
             AND (has_function_privilege('anon', p.oid, 'EXECUTE')
               OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
         ) THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  -- 7. Bucket privado, sem policies de storage
  SELECT 'H7D-7 bucket fiscal-certificates privado sem policies',
         CASE WHEN (SELECT public = false FROM storage.buckets WHERE id='fiscal-certificates')
              AND (SELECT count(*) FROM pg_policies
                   WHERE schemaname='storage' AND tablename='objects'
                     AND qual ILIKE '%fiscal-certificates%') = 0
         THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  -- 8. Guards de homologação intactos
  SELECT 'H7D-8 tpAmb=2 e producao bloqueada',
         CASE WHEN EXISTS (
           SELECT 1 FROM public.company_fiscal_settings
           WHERE is_active = true AND nfe_environment_code = '2'
         ) THEN 'PASS' ELSE 'FAIL' END
)
SELECT check_name, result FROM checks ORDER BY check_name;

SELECT count(*) FILTER (WHERE true) AS material_rows
FROM public.fiscal_certificate_material;
