-- Adiciona client_uuid para idempotência em reenvios offline
ALTER TABLE public.registros_consultor
  ADD COLUMN IF NOT EXISTS client_uuid uuid;

ALTER TABLE public.visitas_checkin
  ADD COLUMN IF NOT EXISTS client_uuid uuid;

-- Índices únicos parciais (só aplicam quando client_uuid não é nulo)
CREATE UNIQUE INDEX IF NOT EXISTS registros_consultor_client_uuid_uniq
  ON public.registros_consultor (client_uuid)
  WHERE client_uuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS visitas_checkin_client_uuid_uniq
  ON public.visitas_checkin (client_uuid)
  WHERE client_uuid IS NOT NULL;