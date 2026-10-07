-- Canonical preflight: swzpzcwiasxmjutrmvkm. Forward-only, no data changes.
ALTER POLICY b2b_technical_no_raw_prices ON public.partner_simulations
 USING (NOT (SELECT public.has_role((SELECT auth.uid()),'parceiro_b2b_tecnico'::public.app_role)));
ALTER POLICY b2b_technical_no_raw_prices ON public.partner_simulation_items
 USING (NOT (SELECT public.has_role((SELECT auth.uid()),'parceiro_b2b_tecnico'::public.app_role)));
ALTER POLICY b2b_technical_financial_write_guard ON public.partner_simulations
 USING (NOT (SELECT public.has_role((SELECT auth.uid()),'parceiro_b2b_tecnico'::public.app_role)) OR (total_cheio=0 AND status IN ('rascunho','enviada_gestor') AND converted_order_id IS NULL AND converted_by IS NULL AND converted_at IS NULL))
 WITH CHECK (NOT (SELECT public.has_role((SELECT auth.uid()),'parceiro_b2b_tecnico'::public.app_role)) OR (total_cheio=0 AND status IN ('rascunho','enviada_gestor') AND converted_order_id IS NULL AND converted_by IS NULL AND converted_at IS NULL));
ALTER POLICY b2b_technical_financial_write_guard ON public.partner_simulation_items
 USING (NOT (SELECT public.has_role((SELECT auth.uid()),'parceiro_b2b_tecnico'::public.app_role)) OR (coalesce(valor_unitario_cheio,0)=0 AND coalesce(subtotal,0)=0 AND coalesce(preco_tabela_snapshot,0)=0 AND coalesce(preco_unitario,0)=0 AND coalesce(desconto_percentual,0)=0))
 WITH CHECK (NOT (SELECT public.has_role((SELECT auth.uid()),'parceiro_b2b_tecnico'::public.app_role)) OR (coalesce(valor_unitario_cheio,0)=0 AND coalesce(subtotal,0)=0 AND coalesce(preco_tabela_snapshot,0)=0 AND coalesce(preco_unitario,0)=0 AND coalesce(desconto_percentual,0)=0));
-- Reversal, if needed, must retain all guards and only restore the prior auth.uid expression.