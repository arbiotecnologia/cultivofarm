-- 1. Expansão da tabela entregas
ALTER TABLE public.entregas 
  ADD COLUMN IF NOT EXISTS ordem_servico_onfarm_id uuid REFERENCES public.ordens_servico_onfarm(id),
  ADD COLUMN IF NOT EXISTS os_faturamento_base_id uuid REFERENCES public.os_faturamento_base(id);

-- 2. Tornar produto_id opcional em estoque_produto para suportar microrganismos puros
ALTER TABLE public.estoque_produto ALTER COLUMN produto_id DROP NOT NULL;

-- 3. Garantir GRANTs (conforme regras do sistema)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entregas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_produto TO authenticated;
GRANT ALL ON public.entregas TO service_role;
GRANT ALL ON public.estoque_produto TO service_role;