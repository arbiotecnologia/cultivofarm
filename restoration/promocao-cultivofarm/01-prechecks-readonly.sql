-- ============================================================================
-- PROMOÇÃO CULTIVOFARM — PRECHECKS SOMENTE LEITURA NO ALVO
-- Alvo permitido: swzpzcwiasxmjutrmvkm (CultivoFarm)
-- PROIBIDOS: navfzbwgwzruipouyfnk (produção AR Bio),
--            ikaauvsflpmamgxmkhoq (homologação),
--            yzszlzjpovmcteuxjznj (sandbox)
--
-- Este arquivo NÃO escreve nada. Execute com:
--   psql "$CULTIVOFARM_DSN" -X -v ON_ERROR_STOP=1 -f 01-prechecks-readonly.sql
-- Arquive a saída bruta + SHA-256 antes de qualquer onda.
-- ============================================================================

SET default_transaction_read_only = on;

-- ---------------------------------------------------------------------------
-- 0. GUARDA DE ALVO — fail-closed
-- ---------------------------------------------------------------------------
\if :{?ALVO_REF}
\else
\set ALVO_REF 'NAO_INFORMADO'
\endif

DO $$
DECLARE v_ref text := current_setting('promocao.target_ref', true);
BEGIN
  RAISE NOTICE 'ALVO: db=% user=% now=%', current_database(), current_user, now();
  IF v_ref IS NOT NULL AND v_ref <> 'swzpzcwiasxmjutrmvkm' THEN
    RAISE EXCEPTION 'ABORT: promocao.target_ref=% nao e o CultivoFarm.', v_ref;
  END IF;
  RAISE NOTICE 'CONFIRME MANUALMENTE que o project ref e swzpzcwiasxmjutrmvkm.';
END $$;

SELECT current_database() AS db, current_user AS usr, version() AS pg_version;

-- ---------------------------------------------------------------------------
-- 1. O alvo precisa estar estruturalmente vazio (ou com delta aprovado)
-- ---------------------------------------------------------------------------
SELECT count(*) AS tabelas_public FROM pg_tables WHERE schemaname = 'public';
SELECT count(*) AS views_public FROM pg_views WHERE schemaname = 'public';
SELECT count(*) AS funcoes_public
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';
SELECT count(*) AS policies_public FROM pg_policies WHERE schemaname = 'public';
SELECT count(*) AS enums_public
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype = 'e';

-- ---------------------------------------------------------------------------
-- 2. Extensões requeridas pelo contrato do AR Bio
-- ---------------------------------------------------------------------------
SELECT extname, extversion, n.nspname AS schema
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY 1;

SELECT req AS extensao_requerida,
       EXISTS (SELECT 1 FROM pg_extension e WHERE e.extname = req) AS presente
FROM unnest(ARRAY['pgcrypto','pg_net','pg_cron','pg_trgm','uuid-ossp']) AS req
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- 3. Schemas auxiliares e ledger
-- ---------------------------------------------------------------------------
SELECT nspname FROM pg_namespace
WHERE nspname IN ('public','private','extensions','supabase_migrations')
ORDER BY 1;

SELECT count(*) AS ledger_total,
       coalesce(max(version),'VAZIO') AS ledger_latest
FROM supabase_migrations.schema_migrations;

-- ---------------------------------------------------------------------------
-- 4. Auth e Storage — devem estar vazios nesta etapa
-- ---------------------------------------------------------------------------
SELECT count(*) AS auth_users FROM auth.users;
SELECT count(*) AS storage_buckets FROM storage.buckets;
SELECT count(*) AS storage_objects FROM storage.objects;

-- ---------------------------------------------------------------------------
-- 5. Papéis do Data API existentes
-- ---------------------------------------------------------------------------
SELECT rolname FROM pg_roles
WHERE rolname IN ('anon','authenticated','service_role','postgres')
ORDER BY 1;

-- FIM — nenhuma escrita foi emitida por este arquivo.
