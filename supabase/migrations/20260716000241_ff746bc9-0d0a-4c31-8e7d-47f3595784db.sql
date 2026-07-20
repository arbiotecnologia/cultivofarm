
-- ============================================================
-- FASE 3 — Fundação do acesso multiportal (aditiva)
-- ============================================================

-- 1) Preferência de contexto por usuário
CREATE TABLE IF NOT EXISTS public.user_access_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_context text,
  preferred_context text,
  skip_context_selector boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_access_preferences_last_context_chk
    CHECK (last_context IS NULL OR last_context IN ('b2b','technical')),
  CONSTRAINT user_access_preferences_preferred_context_chk
    CHECK (preferred_context IS NULL OR preferred_context IN ('b2b','technical'))
);

GRANT SELECT, INSERT, UPDATE ON public.user_access_preferences TO authenticated;
GRANT ALL ON public.user_access_preferences TO service_role;

ALTER TABLE public.user_access_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own access preferences"
  ON public.user_access_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own access preferences"
  ON public.user_access_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own access preferences"
  ON public.user_access_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger updated_at (reutiliza função existente se disponível)
CREATE OR REPLACE FUNCTION public.tg_user_access_preferences_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_access_preferences_touch
  ON public.user_access_preferences;
CREATE TRIGGER trg_user_access_preferences_touch
  BEFORE UPDATE ON public.user_access_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_user_access_preferences_touch();

-- 2) Auditoria append-only de escolha de contexto
CREATE TABLE IF NOT EXISTS public.user_context_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_code text NOT NULL,
  action text NOT NULL,
  previous_context text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_context_access_logs_context_chk
    CHECK (context_code IN ('b2b','technical','none')),
  CONSTRAINT user_context_access_logs_previous_chk
    CHECK (previous_context IS NULL OR previous_context IN ('b2b','technical','none')),
  CONSTRAINT user_context_access_logs_action_chk
    CHECK (action IN ('login_redirect','context_selected','context_switched','access_denied'))
);

GRANT SELECT, INSERT ON public.user_context_access_logs TO authenticated;
GRANT ALL ON public.user_context_access_logs TO service_role;

ALTER TABLE public.user_context_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own context logs"
  ON public.user_context_access_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Users insert own context logs"
  ON public.user_context_access_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Sem policies de UPDATE/DELETE → tabela append-only para usuários comuns.

-- 3) Índices auxiliares
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON public.user_roles (user_id);

CREATE INDEX IF NOT EXISTS idx_user_context_logs_user_created
  ON public.user_context_access_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_users_user_id
  ON public.partner_users (user_id);
