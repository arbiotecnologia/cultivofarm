-- =====================================================================
-- H7n-PROD onda A1 — PRECHECKS (SOMENTE LEITURA)
-- Alvo: produção navfzbwgwzruipouyfnk
-- Executar ANTES de forward-sql/20261103000000_h7nprod_a1_security_invoker_views_v1.sql
-- Abortar a onda se qualquer linha divergir do esperado.
-- =====================================================================

\echo '== A. Identidade — esperado: postgres / postgres / PostgreSQL 17.6 =='
SELECT current_database(), current_user, version();

\echo '== B. Guarda de alvo — esperado: navfzbwgwzruipouyfnk =='
SELECT current_setting('promocao.target_ref', true) AS target_ref;

\echo '== C. Ledger antes — esperado: 493 / 20261101000000 =='
SELECT count(*) AS versoes, max(version) AS latest
FROM supabase_migrations.schema_migrations;

\echo '== D. Version da onda ausente — esperado: f =='
SELECT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261103000000'
) AS ja_aplicada;

\echo '== E. As 3 views existem e sao views — esperado: 3 linhas, relkind=v =='
SELECT c.relname, c.relkind, c.reloptions, c.relacl::text AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica')
ORDER BY 1;

\echo '== F. Estado inicial de security_invoker — esperado: 2 de 3 (P1 parcial) =='
SELECT count(*) AS ja_invoker
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('vw_os_integridade_esteira','vw_esteira_laboratorio','vw_fluxo_visita_tecnica')
  AND c.reloptions @> ARRAY['security_invoker=true'];

\echo '== G. Estrutura de auditoria da promocao existe — esperado: t / t =='
SELECT to_regclass('public.promocao_execucao_registro') IS NOT NULL AS registro_ok,
       to_regclass('public.promocao_rollback_baseline')  IS NOT NULL AS baseline_ok;

\echo '== H. Objetos fora de escopo devem seguir ausentes — esperado: tudo f =='
SELECT to_regclass('public.vw_catalogo_ficha_produtos')       IS NOT NULL AS cat_prod,
       to_regclass('public.vw_catalogo_ficha_microrganismos') IS NOT NULL AS cat_micro,
       to_regprocedure('public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)') IS NOT NULL AS fn_preco;
