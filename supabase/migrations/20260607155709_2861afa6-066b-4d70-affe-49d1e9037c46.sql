-- 1. Expandir estoque_movimentacoes para rastreabilidade de lotes
ALTER TABLE public.estoque_movimentacoes ADD COLUMN lote_id uuid REFERENCES public.lotes(id);

-- 2. Adicionar campos de custo e observação técnica em lotes
ALTER TABLE public.lotes ADD COLUMN custo_producao_estimado numeric DEFAULT 0;
ALTER TABLE public.lotes ADD COLUMN observacoes_tecnicas text;

-- 3. Atualizar registros existentes (best effort)
UPDATE public.estoque_movimentacoes em
SET lote_id = e.lote_id
FROM public.envase e
WHERE em.observacao LIKE '%Envase%' AND em.quantidade > 0 AND em.lote_id IS NULL;

-- 4. Garantir permissões
GRANT ALL ON public.estoque_movimentacoes TO authenticated;
GRANT ALL ON public.estoque_movimentacoes TO service_role;
