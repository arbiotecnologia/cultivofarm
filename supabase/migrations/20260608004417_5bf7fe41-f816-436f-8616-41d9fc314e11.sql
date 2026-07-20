
ALTER TABLE public.programacao_producao
  DROP CONSTRAINT IF EXISTS programacao_producao_responsavel_id_fkey;

ALTER TABLE public.programacao_producao
  ADD CONSTRAINT programacao_producao_responsavel_id_fkey
  FOREIGN KEY (responsavel_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
