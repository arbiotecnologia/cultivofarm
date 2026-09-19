-- H15: somente leitura; nenhuma autorização de aplicação é inferida deste resultado.
-- Confirmar o destino também no canal de execução antes de usar este arquivo.
SELECT project_ref, environment_label, production_emission_allowed
FROM public.fiscal_environment_marker;

SELECT
  (SELECT count(*) FROM public.organizations) AS organizations,
  (SELECT count(*) FROM public.organizations WHERE ativo IS TRUE) AS active_organizations,
  (SELECT count(*) FROM public.company_fiscal_settings) AS companies,
  (SELECT count(*) FROM public.company_fiscal_settings
    WHERE is_active IS TRUE AND fiscal_environment = 'HOMOLOGATION'
      AND production_enabled IS FALSE) AS guarded_companies,
  (SELECT count(*) FROM public.fiscal_invoices) AS invoices,
  (SELECT count(*) FROM public.fiscal_certificates) AS certificates,
  (SELECT count(*) FROM public.fiscal_document_series) AS series;

-- Inventário completo dos definers expostos, não somente funções com prefixo fiscal.
-- A revisão deve seguir também chamadas transitivas e SQL dinâmico.
SELECT p.oid::regprocedure::text AS signature,
       pg_get_userbyid(p.proowner) AS owner,
       p.proacl::text AS acl,
       p.proconfig AS settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       md5(pg_get_functiondef(p.oid)) AS definition_md5,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
  AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
ORDER BY p.oid::regprocedure::text;

-- Índices não são integralmente representados em pg_constraint.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (tablename = 'company_fiscal_settings' OR tablename LIKE 'fiscal_%')
ORDER BY tablename, indexname;

SELECT c.conrelid::regclass::text AS relation, c.conname,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
  AND (c.conrelid = 'public.company_fiscal_settings'::regclass
       OR c.conrelid = 'public.fiscal_invoices'::regclass
       OR c.confrelid = 'public.company_fiscal_settings'::regclass
       OR c.confrelid = 'public.fiscal_invoices'::regclass)
ORDER BY relation, c.conname;

SELECT * FROM pg_policies
WHERE schemaname = 'public'
  AND (tablename = 'company_fiscal_settings' OR tablename LIKE 'fiscal_%')
ORDER BY tablename, policyname;

SELECT c.relname, c.reloptions, c.relacl::text,
       pg_get_viewdef(c.oid, true) AS definition
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND pg_get_viewdef(c.oid, true) ~ '(fiscal_|company_fiscal_settings)'
ORDER BY c.relname;