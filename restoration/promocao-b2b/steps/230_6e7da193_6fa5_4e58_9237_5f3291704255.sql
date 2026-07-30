-- PACOTE DE PROMOCAO MOTOR B2B — passo 230
-- Drop idempotente da tabela de provas
-- Origem (historico, NAO modificado): supabase/migrations/20260730030920_6e7da193-6fa5-4e58-9237-5f3291704255.sql
-- sha256(origem) = 562e001d3cd2ffd32d90f8c191cfe967a91da32c7cd05e066c7b52df7fb105cd
-- Guarda de ambiente removida deste passo: a verificacao de destino e
-- centralizada e fail-closed em 000_preflight.sql (executado antes).
-- Forward-only. Nao contem fixtures, UUIDs de teste nem DROP destrutivo de dados.

-- Fase 7 — correcao final: a tabela de provas era artefato de teste e nao pode
-- permanecer no schema promocional nem em types.ts. Drop idempotente e seguro:
-- em qualquer ambiente onde ela nao exista (inclusive producao), e no-op.
DROP TABLE IF EXISTS public._motor_b2b_fase7_proofs;
