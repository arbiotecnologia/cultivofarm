-- Complements 20261008022948. No row changes, backfill or ACL reopening.
CREATE POLICY stock_p1_history_tenant_isolation
ON public.estoque_movimentacoes AS RESTRICTIVE FOR ALL TO authenticated
USING (
 EXISTS (
  SELECT 1 FROM public.estoque_produto ep
  WHERE ep.id = estoque_movimentacoes.estoque_produto_id
    AND ep.lote_id = estoque_movimentacoes.lote_id
    AND public.stock_p1_lote_owned(ep.lote_id)
 )
)
WITH CHECK (
 EXISTS (
  SELECT 1 FROM public.estoque_produto ep
  WHERE ep.id = estoque_movimentacoes.estoque_produto_id
    AND ep.lote_id = estoque_movimentacoes.lote_id
    AND public.stock_p1_lote_owned(ep.lote_id)
 )
);
COMMENT ON POLICY stock_p1_history_tenant_isolation ON public.estoque_movimentacoes IS
 'Stock P1: history requires its stock item and matching explicitly owned lot. Orphan history is preserved and hidden. Do not remove without an equally restrictive replacement.';