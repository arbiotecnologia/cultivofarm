-- Idempotência para uploads de mídias offline (fotos/áudios/documentos)
ALTER TABLE public.registros_consultor_arquivos
  ADD COLUMN IF NOT EXISTS client_uuid uuid;

CREATE UNIQUE INDEX IF NOT EXISTS registros_consultor_arquivos_client_uuid_uniq
  ON public.registros_consultor_arquivos (client_uuid)
  WHERE client_uuid IS NOT NULL;