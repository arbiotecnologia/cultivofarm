-- =====================================================================
-- F4.1-R2 — verify-canonical.sql (SOMENTE LEITURA)
-- Confere a presença das versões canônicas no ledger de migrations.
-- Não cria, altera nem remove nada. Seguro em qualquer ambiente.
-- Alvo autorizado: staging ikaauvsflpmamgxmkhoq.
-- =====================================================================

\set ON_ERROR_STOP on

-- 1. Ledger corrente (últimas versões)
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 8;

-- 2. Presença das versões canônicas F4 / F4.1
WITH esperado(version, name) AS (
  VALUES
    ('20260822000000', 'fase_f4_motor_xml_nfe'),
    ('20260823000000', 'fase_f4_1_xsd_oficial')
)
SELECT
  e.version,
  e.name,
  (m.version IS NOT NULL) AS registrado_no_ledger
FROM esperado e
LEFT JOIN supabase_migrations.schema_migrations m
  ON m.version = e.version
ORDER BY e.version;

-- 3. Lacunas: nenhuma versão pode ser registrada fora de ordem
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260823000000'
    ) AND NOT EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260822000000'
    )
    THEN 'FAIL: 20260823000000 registrado sem 20260822000000'
    ELSE 'OK: sem lacuna entre 20260822000000 e 20260823000000'
  END AS gate_ordem_ledger;

-- 4. Objetos que a F4 canônica precisa ter deixado no schema
SELECT
  to_regclass('public.fiscal_xsd_registry') IS NOT NULL AS tem_fiscal_xsd_registry,
  to_regclass('public.fiscal_xml_runs')     IS NOT NULL AS tem_fiscal_xml_runs,
  to_regprocedure('public.rpc_fiscal_xml_prepare_v1(uuid,text)')       IS NOT NULL AS tem_prepare_v1,
  to_regprocedure('public.rpc_fiscal_xml_record_v1(uuid,text,jsonb)')  IS NOT NULL AS tem_record_v1,
  to_regprocedure('public.rpc_fiscal_xml_status_v1(uuid)')             IS NOT NULL AS tem_status_v1;
