ALTER TABLE public.partner_simulation_items
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.produtos(id),
  ADD COLUMN IF NOT EXISTS microrganismo_id uuid REFERENCES public.microrganismos(id),
  ADD COLUMN IF NOT EXISTS unidade_medida text,
  ADD COLUMN IF NOT EXISTS volume_ml numeric,
  ADD COLUMN IF NOT EXISTS volume_id uuid,
  ADD COLUMN IF NOT EXISTS volume_rotulo text,
  ADD COLUMN IF NOT EXISTS produto_codigo_snapshot text,
  ADD COLUMN IF NOT EXISTS produto_nome_snapshot text,
  ADD COLUMN IF NOT EXISTS preco_tabela_snapshot numeric,
  ADD COLUMN IF NOT EXISTS preco_unitario numeric,
  ADD COLUMN IF NOT EXISTS desconto_percentual numeric,
  ADD COLUMN IF NOT EXISTS area_ha numeric;

CREATE INDEX IF NOT EXISTS idx_partner_simulation_items_product_id
  ON public.partner_simulation_items(product_id);
CREATE INDEX IF NOT EXISTS idx_partner_simulation_items_microrganismo_id
  ON public.partner_simulation_items(microrganismo_id);