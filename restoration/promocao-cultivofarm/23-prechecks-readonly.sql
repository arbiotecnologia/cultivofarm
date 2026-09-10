-- =====================================================================
-- PROMOÇÃO CULTIVOFARM — PRECHECKS SOMENTE LEITURA (pacote concatenado)
-- Alvo obrigatório: swzpzcwiasxmjutrmvkm
--
-- Complementa 01-prechecks-readonly.sql; não o substitui.
-- Nenhum comando altera dados ou schema. Uso:
--   psql "$CULTIVOFARM_DSN" -v ON_ERROR_STOP=1 -f 23-prechecks-readonly.sql
-- =====================================================================
\set ON_ERROR_STOP on

-- G0 — guarda de alvo: o operador precisa declarar o ref antes de rodar.
--      psql ... -v alvo=swzpzcwiasxmjutrmvkm
DO $$
BEGIN
  IF current_setting('promocao.target_ref', true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN
    RAISE EXCEPTION 'ABORT G0: promocao.target_ref ausente ou diferente de swzpzcwiasxmjutrmvkm';
  END IF;
END $$;

-- G1 — o destino deve estar estruturalmente vazio em public.
SELECT 'G1_public_relations' AS check, count(*) AS valor, 0 AS esperado
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m');

-- G2 — nenhum objeto de negócio em outros schemas do app.
SELECT 'G2_schemas_app' AS check, coalesce(string_agg(nspname, ','), '(nenhum)') AS valor
  FROM pg_namespace
 WHERE nspname IN ('private','fiscal','financeiro','comunicacao');

-- G3 — extensões requeridas pelo pacote estrutural.
SELECT 'G3_extensoes' AS check, extname
  FROM pg_extension
 WHERE extname IN ('pgcrypto','uuid-ossp','pg_cron','pg_net','pg_trgm')
 ORDER BY extname;

-- G4 — ledger de migrations do destino (esperado vazio ou apenas baseline).
SELECT 'G4_ledger' AS check, count(*) AS total, coalesce(max(version), '(vazio)') AS latest
  FROM supabase_migrations.schema_migrations;

-- G5 — Auth vazio: promoção estrutural não migra usuários.
SELECT 'G5_auth_users' AS check, count(*) AS valor, 0 AS esperado FROM auth.users;

-- G6 — Storage vazio: nenhum bucket herdado.
SELECT 'G6_storage_buckets' AS check, count(*) AS valor, 0 AS esperado FROM storage.buckets;

-- G7 — papéis padrão presentes (grants do pacote dependem deles).
SELECT 'G7_roles' AS check, rolname
  FROM pg_roles
 WHERE rolname IN ('anon','authenticated','service_role')
 ORDER BY rolname;

-- G8 — jobs de cron: devem estar ausentes antes da promoção.
SELECT 'G8_cron_jobs' AS check, count(*) AS valor, 0 AS esperado
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'cron' AND c.relname = 'job';

-- CRITÉRIO: G1/G5/G6 = 0; G3 lista todas as extensões exigidas; G7 lista os
-- três papéis. Qualquer divergência é NO-GO — não montar nem aplicar o pacote.
