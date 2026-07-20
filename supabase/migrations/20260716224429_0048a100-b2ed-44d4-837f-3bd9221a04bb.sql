ALTER TABLE public.visita_diagnosticos
  ADD COLUMN IF NOT EXISTS client_uuid uuid NULL,
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_visita_diagnosticos_registro_client_uuid
  ON public.visita_diagnosticos(registro_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visita_diagnosticos_registro_id
  ON public.visita_diagnosticos(registro_id);