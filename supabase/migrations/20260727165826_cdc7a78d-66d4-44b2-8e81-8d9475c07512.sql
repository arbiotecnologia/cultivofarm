-- Fase: correção final auditoria comunicação.
-- Alinha grants ao princípio de menor privilégio: só admin pode ler
-- (via RLS + has_role), demais escritas restritas a service_role.

REVOKE ALL ON public.communication_provider_settings_audit FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.communication_provider_settings_audit FROM authenticated;
GRANT SELECT ON public.communication_provider_settings_audit TO authenticated;
GRANT ALL   ON public.communication_provider_settings_audit TO service_role;

-- Sanity: RLS deve permanecer ativa.
ALTER TABLE public.communication_provider_settings_audit ENABLE ROW LEVEL SECURITY;