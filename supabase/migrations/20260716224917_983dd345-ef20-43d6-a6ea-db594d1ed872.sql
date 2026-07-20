ALTER TABLE public.registros_consultor_recomendacoes
  ADD COLUMN IF NOT EXISTS client_uuid uuid NULL,
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rec_registro_client_uuid
  ON public.registros_consultor_recomendacoes(registro_consultor_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rec_registro_id
  ON public.registros_consultor_recomendacoes(registro_consultor_id);