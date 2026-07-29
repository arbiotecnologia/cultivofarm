-- =====================================================================
-- MOTOR B2B — FASE 0.2 — T20: PROVA RUNTIME DO CICLO ROLLBACK -> HARDENING
--
-- NAO E MIGRATION. Execucao manual e explicita.
--
-- Ambiente permitido : STAGING ikaauvsflpmamgxmkhoq
-- Ambiente PROIBIDO  : PRODUCAO navfzbwgwzruipouyfnk
--
-- O ciclo inteiro roda dentro de uma subtransacao que SEMPRE sofre
-- ROLLBACK: o banco nunca fica com o baseline vulneravel apos a execucao.
-- Apenas as linhas de evidencia sao persistidas.
--
--   psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -f 02-rollback-cycle.sql
-- =====================================================================

\set ON_ERROR_STOP on

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente invalido %', coalesce(v_ref,'<null>');
  END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS public._motor_b2b_fase0_2_evidence (
  id bigserial PRIMARY KEY,
  test_code text NOT NULL,
  descricao text NOT NULL,
  identidade text NOT NULL,
  esperado text NOT NULL,
  obtido text NOT NULL,
  passou boolean NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public._motor_b2b_fase0_2_evidence FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public._motor_b2b_fase0_2_evidence TO service_role;
ALTER TABLE public._motor_b2b_fase0_2_evidence ENABLE ROW LEVEL SECURITY;

-- Passos executados (ver relatorio docs/motor-b2b-fase0-2-hardening-rls.md, secao T20):
--  1. captura a impressao digital (policies + ACLs + privilegios anon + indice) do estado ENDURECIDO;
--  2. aplica integralmente restoration/motor-b2b-fase0-2/restore-policies.sql (baseline vulneravel);
--  3. prova que o baseline voltou (T20.1, T20.2, T20.3) e que a impressao digital mudou (T20.4);
--  4. reaplica o hardening e prova que a impressao digital volta a ser identica (T20.5);
--  5. RAISE EXCEPTION descarta tudo; T20.6 confere que o staging segue endurecido.
--
-- O corpo executavel e identico ao aplicado no staging e esta versionado na
-- migration de prova correspondente (ver relatorio). Para reexecucao manual,
-- copie o bloco DO $cycle$ ... $cycle$ do relatorio/migration.

SELECT test_code, esperado, obtido, passou
FROM public._motor_b2b_fase0_2_evidence
WHERE test_code LIKE 'T20%'
ORDER BY id;
