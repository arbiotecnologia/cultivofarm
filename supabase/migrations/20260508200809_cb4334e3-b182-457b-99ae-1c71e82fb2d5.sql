-- 1. Remove foreign key and column from ordens_servico
ALTER TABLE public.ordens_servico DROP CONSTRAINT IF EXISTS ordens_servico_recomendacao_id_fkey;
ALTER TABLE public.ordens_servico DROP COLUMN IF EXISTS recomendacao_id;

-- 2. Drop legacy tables
DROP TABLE IF EXISTS public.recomendacoes;
DROP TABLE IF EXISTS public.diagnosticos;