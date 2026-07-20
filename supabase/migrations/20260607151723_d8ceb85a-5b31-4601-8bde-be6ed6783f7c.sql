ALTER TABLE public.aplicacoes 
  ADD COLUMN IF NOT EXISTS ordem_servico_onfarm_id uuid REFERENCES public.ordens_servico_onfarm(id);

ALTER TABLE public.aplicacoes ALTER COLUMN ordem_servico_id DROP NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aplicacoes TO authenticated;
GRANT ALL ON public.aplicacoes TO service_role;