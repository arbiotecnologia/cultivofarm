-- Fase 7 — correcao final: a tabela de provas era artefato de teste e nao pode
-- permanecer no schema promocional nem em types.ts. Drop idempotente e seguro:
-- em qualquer ambiente onde ela nao exista (inclusive producao), e no-op.
DROP TABLE IF EXISTS public._motor_b2b_fase7_proofs;