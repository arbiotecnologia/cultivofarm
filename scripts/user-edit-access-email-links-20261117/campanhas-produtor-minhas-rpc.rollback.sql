-- Rollback de campanhas-produtor-minhas-rpc.sql (rodar ANTES de campanhas-produtor-vigentes.rollback.sql).
-- Remove apenas a projeção; a seção "Minhas campanhas" passa a mostrar o estado de erro, sem dados.
BEGIN;
DROP FUNCTION IF EXISTS public.producer_my_campaigns_v1(integer, integer);
COMMIT;
