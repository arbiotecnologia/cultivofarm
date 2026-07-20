ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS estoque_produto_id uuid,
  ADD COLUMN IF NOT EXISTS lote_id uuid,
  ADD COLUMN IF NOT EXISTS produto_id uuid,
  ADD COLUMN IF NOT EXISTS quantidade_entregue numeric,
  ADD COLUMN IF NOT EXISTS volume_entregue_ml numeric;

CREATE INDEX IF NOT EXISTS idx_entregas_data_saida ON public.entregas(data_saida);
CREATE INDEX IF NOT EXISTS idx_entregas_produto ON public.entregas(produto_id);
CREATE INDEX IF NOT EXISTS idx_entregas_os ON public.entregas(ordem_servico_id);