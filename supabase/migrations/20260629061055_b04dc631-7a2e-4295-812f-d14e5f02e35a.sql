
DROP INDEX IF EXISTS public.estoque_produto_lote_unico_idx;

-- Unicidade por envase (permite N envases por lote, 1 entrada por envase)
CREATE UNIQUE INDEX IF NOT EXISTS estoque_produto_envase_unico_idx
  ON public.estoque_produto(envase_id)
  WHERE quantidade_reservada IS NULL AND envase_id IS NOT NULL;

-- Garante 1 entrada agregada por lote quando não há envase_id (legado)
CREATE UNIQUE INDEX IF NOT EXISTS estoque_produto_lote_legado_unico_idx
  ON public.estoque_produto(lote_id)
  WHERE quantidade_reservada IS NULL AND envase_id IS NULL;
