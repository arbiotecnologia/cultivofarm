-- PACOTE DE PROMOCAO MOTOR B2B — passo 030
-- Drop idempotente de tabela de evidencia
-- Origem (historico, NAO modificado): supabase/migrations/20260729015203_motor_b2b_fase0_2_drop_evidence_table.sql
-- sha256(origem) = 7c717be73595fc60de3103d5d5f19f12281aa4018dec89a0ba0ece8b2ca391b3
-- Guarda de ambiente removida deste passo: a verificacao de destino e
-- centralizada e fail-closed em 000_preflight.sql (executado antes).
-- Forward-only. Nao contem fixtures, UUIDs de teste nem DROP destrutivo de dados.

DROP TABLE IF EXISTS public._motor_b2b_fase0_2_evidence;
