ALTER TABLE public.controle_qualidade
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_controle_qualidade_responsavel_id ON public.controle_qualidade(responsavel_id);