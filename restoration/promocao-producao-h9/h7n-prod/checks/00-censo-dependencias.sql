-- =====================================================================
-- H7n-PROD — CENSO DE DEPENDÊNCIAS (SOMENTE LEITURA)
-- Alvo: produção navfzbwgwzruipouyfnk
--
-- Nenhum comando abaixo escreve. Execute e arquive a saída bruta com
-- SHA-256 em restoration/promocao-producao-h9/evidencias/.
-- Este censo é o pré-requisito para destravar as ondas A2..A5 do H7n-PROD.
-- =====================================================================

\echo '== 0. Identidade do alvo =='
SELECT current_database(), current_user, version();

\echo '== 1. Ledger =='
SELECT count(*) AS versoes, max(version) AS latest FROM supabase_migrations.schema_migrations;

\echo '== 2. Views alvo do H7n =='
SELECT t.nome,
       to_regclass(t.nome) IS NOT NULL AS existe,
       (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass(t.nome)) AS relkind,
       (SELECT c.reloptions FROM pg_class c WHERE c.oid = to_regclass(t.nome)) AS reloptions,
       (SELECT c.relacl::text FROM pg_class c WHERE c.oid = to_regclass(t.nome)) AS acl
FROM (VALUES
  ('public.vw_os_integridade_esteira'),
  ('public.vw_esteira_laboratorio'),
  ('public.vw_fluxo_visita_tecnica'),
  ('public.vw_catalogo_ficha_produtos'),
  ('public.vw_catalogo_ficha_microrganismos'),
  ('public.mv_esteira_laboratorio'),
  ('public.mv_fluxo_visita_tecnica')
) AS t(nome);

\echo '== 3. Funcoes de suporte exigidas pelo P0 =='
SELECT t.assinatura, to_regprocedure(t.assinatura) IS NOT NULL AS existe
FROM (VALUES
  ('public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)'),
  ('public.can_view_catalog_internal(uuid)'),
  ('public.get_cliente_ids_for_user(uuid)'),
  ('public.has_role(uuid,public.app_role)')
) AS t(assinatura);

\echo '== 4. Tipos, colunas e roles exigidos pelo P0 =='
SELECT to_regtype('public.tipo_produto') IS NOT NULL AS tipo_produto_existe;
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public' AND column_name='b2b_enabled'
  AND table_name IN ('produtos','microrganismos');
SELECT e.enumlabel
FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
WHERE t.typname='app_role' ORDER BY e.enumsortorder;

\echo '== 5. Helpers da P2 =='
SELECT t.assinatura,
       to_regprocedure(t.assinatura) IS NOT NULL AS existe,
       (SELECT p.proconfig FROM pg_proc p WHERE p.oid = to_regprocedure(t.assinatura)) AS proconfig
FROM (VALUES
  ('public.fn_h6b_num(numeric)'),
  ('public.fn_gtin_is_valid(text)'),
  ('public.fn_regulatory_storage_path_ok(text)'),
  ('public.fn_regulatory_storage_dossier_id(text)')
) AS t(assinatura);

\echo '== 6. Superficie SECURITY DEFINER executavel por authenticated =='
SELECT n.nspname, p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prorettype::regtype::text AS retorno,
       (p.prorettype = 'trigger'::regtype) AS e_trigger,
       p.proconfig,
       md5(pg_get_functiondef(p.oid)) AS md5_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
ORDER BY 1,2,3;

\echo '== 7. Contagem de controle (esperado: 277) =='
SELECT count(*) AS secdef_authenticated
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
