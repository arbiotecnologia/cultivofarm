-- ROLLBACK SEGURO / FORWARD-SAFE — staging somente.
-- Baseline: estado seguro consolidado por 20260805034743, sem restaurar a
-- comparação inválida consultor_profile_id = p_user_id e sem derrubar RPCs.
-- As inclusões são relativas a este arquivo e preservam assinaturas/chamadores.
\set ON_ERROR_STOP on
\ir ../../supabase/migrations/20260805040000_visita_canonica_failclosed.sql
\ir ../../supabase/migrations/20260805041601_752b9122-f0e1-4646-9c4a-7c1393deae8d.sql

