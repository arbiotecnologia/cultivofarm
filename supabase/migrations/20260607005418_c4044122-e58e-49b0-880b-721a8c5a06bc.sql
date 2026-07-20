ALTER TABLE public.talhoes
  ADD COLUMN IF NOT EXISTS latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS localizacao_referencia text;