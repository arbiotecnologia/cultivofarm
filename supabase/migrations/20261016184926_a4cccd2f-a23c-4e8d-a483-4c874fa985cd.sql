-- Idempotência do formulário /app/solicitar. Coluna opcional, registros existentes ficam NULL.
-- Rollback: DROP INDEX IF EXISTS public.portal_solicitacoes_author_client_uuid_uniq; ALTER TABLE public.portal_solicitacoes DROP COLUMN IF EXISTS client_uuid;
ALTER TABLE public.portal_solicitacoes ADD COLUMN IF NOT EXISTS client_uuid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS portal_solicitacoes_author_client_uuid_uniq
  ON public.portal_solicitacoes (user_id, client_uuid)
  WHERE client_uuid IS NOT NULL;
COMMENT ON COLUMN public.portal_solicitacoes.client_uuid IS 'Chave de idempotência gerada pelo cliente; única por autor (user_id). Opcional.';
NOTIFY pgrst, 'reload schema';