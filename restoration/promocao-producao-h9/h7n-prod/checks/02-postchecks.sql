-- =====================================================================
-- H7n-PROD onda A1 — PÓS-CHECKS (SOMENTE LEITURA)
-- Alvo: produção navfzbwgwzruipouyfnk
-- Executar DEPOIS do COMMIT do forward e ANTES de registrar o ledger.
-- Qualquer divergência => não registrar a version; avaliar rollback.
-- =====================================================================

\echo '== A. 3/3 views com security_invoker=true — esperado: 3 =='
SELECT count(*) AS invoker_ok
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica')
  AND c.reloptions @> ARRAY['security_invoker=true'];

\echo '== B. Detalhe por view =='
SELECT c.relname, c.relkind, c.reloptions, c.relacl::text AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica')
ORDER BY 1;

\echo '== C. ACLs devem ser identicas as do precheck E — comparar manualmente =='

\echo '== D. Nenhuma view foi redefinida — comparar hash com o precheck =='
SELECT c.relname, md5(pg_get_viewdef(c.oid, true)) AS md5_def
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica')
ORDER BY 1;

\echo '== E. Nada fora de escopo foi criado — esperado: tudo f =='
SELECT to_regnamespace('private') IS NOT NULL AS schema_private,
       to_regclass('public.vw_catalogo_ficha_produtos') IS NOT NULL AS cat_prod,
       to_regclass('public.vw_catalogo_ficha_microrganismos') IS NOT NULL AS cat_micro;

\echo '== F. Superficie SECURITY DEFINER inalterada — esperado: 277 =='
SELECT count(*) AS secdef_authenticated
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

\echo '== G. Ledger — so apos o registro do runner: esperado 494 / 20261103000000 =='
SELECT count(*) AS versoes, max(version) AS latest
FROM supabase_migrations.schema_migrations;

\echo '== H. Security Advisor: reexecutar e exigir zero ERROR security_definer_view =='
