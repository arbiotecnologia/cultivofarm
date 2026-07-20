
CREATE INDEX IF NOT EXISTS idx_formulacoes_produto_created
  ON public.formulacoes (produto_id, created_at);

CREATE INDEX IF NOT EXISTS idx_partner_order_items_microrganismo
  ON public.partner_order_items (microrganismo_id);
