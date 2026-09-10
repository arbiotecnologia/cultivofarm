-- ============================================================================
-- H7n-PROD — PRECHECKS SOMENTE LEITURA PARA O DRY-RUN EM HOMOLOGAÇÃO
-- Alvo permitido: ikaauvsflpmamgxmkhoq (staging/homologação)
-- PROIBIDO: navfzbwgwzruipouyfnk (produção) e yzszlzjpovmcteuxjznj (sandbox)
--
-- Este arquivo NÃO altera nada: apenas SELECT. Execute somente APÓS renovar o
-- login autenticado do Supabase de staging. Arquive a saída bruta + SHA-256.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. GUARDA DE ALVO — fail-closed. Interrompa se não for staging.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_db text := current_database();
BEGIN
  RAISE NOTICE 'ALVO: db=% user=% now=%', v_db, current_user, now();
  RAISE NOTICE 'CONFIRME MANUALMENTE que o project ref e ikaauvsflpmamgxmkhoq.';
END $$;

-- 0.1 Identidade e ledger de homologação
SELECT current_database() AS db, current_user AS usr, version() AS pg_version;

SELECT count(*) AS ledger_total,
       max(version) AS ledger_latest
FROM supabase_migrations.schema_migrations;

-- ---------------------------------------------------------------------------
-- 1. A2 — dependências das views de esteira/visita
-- ---------------------------------------------------------------------------
-- 1.1 Schema private
SELECT nspname FROM pg_namespace WHERE nspname = 'private';

-- 1.2 Funções private.h7n_* existentes
SELECT p.oid::regprocedure AS assinatura, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private' AND p.proname LIKE 'h7n_%'
ORDER BY 1;

-- 1.3 get_cliente_ids_for_user
SELECT p.oid::regprocedure AS assinatura, pg_get_function_result(p.oid) AS retorno
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_cliente_ids_for_user'
ORDER BY 1;

-- 1.4 Rótulos do enum app_role
SELECT e.enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'app_role'
ORDER BY e.enumsortorder;

-- 1.5 Materializadas alvo e suas colunas
SELECT c.relname, c.relkind
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('mv_esteira_laboratorio','mv_fluxo_visita_tecnica')
ORDER BY 1;

SELECT table_name, ordinal_position, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('vw_esteira_laboratorio','vw_fluxo_visita_tecnica',
                     'vw_os_integridade_esteira')
ORDER BY table_name, ordinal_position;

-- 1.6 security_invoker das views alvo
SELECT c.relname,
       COALESCE((SELECT o FROM unnest(c.reloptions) o
                 WHERE o LIKE 'security_invoker=%'), 'NAO_DEFINIDO') AS opt
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND c.relname IN ('vw_esteira_laboratorio','vw_fluxo_visita_tecnica',
                    'vw_os_integridade_esteira')
ORDER BY 1;

-- 1.7 Consumidores dependentes das views alvo
SELECT DISTINCT dependente.relname AS objeto_dependente, dependente.relkind
FROM pg_depend d
JOIN pg_rewrite r ON r.oid = d.objid
JOIN pg_class dependente ON dependente.oid = r.ev_class
JOIN pg_class alvo ON alvo.oid = d.refobjid
JOIN pg_namespace n ON n.oid = alvo.relnamespace
WHERE n.nspname = 'public'
  AND alvo.relname IN ('vw_esteira_laboratorio','vw_fluxo_visita_tecnica',
                       'vw_os_integridade_esteira')
  AND dependente.relname <> alvo.relname
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- 2. A3 — dependências do catálogo
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_catalogo_preco_canonico','can_view_catalog_internal')
ORDER BY 1;

SELECT t.typname, e.enumlabel
FROM pg_type t LEFT JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'tipo_produto'
ORDER BY e.enumsortorder;

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('produtos','microrganismos')
  AND column_name = 'b2b_enabled'
ORDER BY 1;

SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('vw_catalogo_ficha_produtos','vw_catalogo_ficha_microrganismos')
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- 3. A4 — censo e hashes de corpo para o diff staging × produção
-- ---------------------------------------------------------------------------
-- 3.1 Hash de corpo de todas as funções public (base do diff)
SELECT p.oid::regprocedure AS assinatura,
       p.prosecdef AS security_definer,
       md5(pg_get_functiondef(p.oid)) AS hash_corpo
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY 1;

-- 3.2 SECURITY DEFINER com EXECUTE para authenticated
SELECT p.oid::regprocedure AS assinatura
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
ORDER BY 1;

SELECT count(*) AS secdef_authenticated_total
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

-- 3.3 Classificação: funções usadas como trigger
SELECT DISTINCT p.oid::regprocedure AS assinatura_trigger
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE NOT t.tgisinternal AND n.nspname = 'public'
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- 4. A5 — os quatro helpers da P2
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS assinatura,
       COALESCE(array_to_string(p.proconfig, ','), 'SEM_SEARCH_PATH') AS config
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_h6b_num','fn_gtin_is_valid',
                    'fn_regulatory_storage_path_ok',
                    'fn_regulatory_storage_dossier_id')
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- 5. RLS e grants das tabelas tocadas indiretamente
-- ---------------------------------------------------------------------------
SELECT c.relname, c.relrowsecurity AS rls_ativa,
       (SELECT count(*) FROM pg_policies pol
        WHERE pol.schemaname='public' AND pol.tablename=c.relname) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
ORDER BY 1;

-- FIM — nenhuma escrita foi emitida por este arquivo.
