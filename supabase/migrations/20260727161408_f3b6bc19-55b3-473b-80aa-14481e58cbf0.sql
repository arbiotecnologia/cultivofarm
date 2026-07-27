
-- ============================================================================
-- Comunicação · Configuração de Provedores gerenciada pela UI (staging only)
-- Idempotente e aditivo. Nenhum GRANT direto a anon/authenticated.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.communication_provider_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Homologação
  test_mode_enabled boolean NOT NULL DEFAULT true,
  allowed_emails text[] NOT NULL DEFAULT '{}',
  allowed_phones text[] NOT NULL DEFAULT '{}',
  -- Flags de entrega (default OFF)
  delivery_enabled boolean NOT NULL DEFAULT false,
  email_delivery_enabled boolean NOT NULL DEFAULT false,
  whatsapp_delivery_enabled boolean NOT NULL DEFAULT false,
  inapp_delivery_enabled boolean NOT NULL DEFAULT false,
  whatsapp_webhook_enabled boolean NOT NULL DEFAULT false,
  -- SMTP (campos não sensíveis)
  smtp_host text,
  smtp_port integer CHECK (smtp_port IS NULL OR (smtp_port BETWEEN 1 AND 65535)),
  smtp_user text,
  smtp_from text,
  -- WhatsApp Meta (não sensíveis)
  whatsapp_phone_number_id text CHECK (whatsapp_phone_number_id IS NULL OR whatsapp_phone_number_id ~ '^[0-9]+$'),
  whatsapp_api_version text CHECK (whatsapp_api_version IS NULL OR whatsapp_api_version IN ('v24.0','v25.0')),
  -- Referências para segredos no Vault (UUIDs de vault.secrets)
  secret_smtp_password uuid,
  secret_whatsapp_access_token uuid,
  secret_whatsapp_app_secret uuid,
  secret_whatsapp_verify_token uuid,
  -- Metadados
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Deny-by-default. Nunca conceder a anon/authenticated.
GRANT ALL ON public.communication_provider_settings TO service_role;
ALTER TABLE public.communication_provider_settings ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy → deny para roles não-service. service_role bypassa RLS.

-- Semente da única linha (idempotente).
INSERT INTO public.communication_provider_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Auditoria (apenas metadados; nunca valores sensíveis).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_provider_settings_audit (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,           -- 'update' | 'clear_secret' | 'set_secret'
  changed_fields text[] NOT NULL DEFAULT '{}',
  secret_field text,              -- ex.: 'smtp_password' (nome do slot; sem valor)
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.communication_provider_settings_audit TO service_role;
ALTER TABLE public.communication_provider_settings_audit ENABLE ROW LEVEL SECURITY;
-- Sem policies → deny para anon/authenticated.

-- ---------------------------------------------------------------------------
-- RPC service_role-only: carrega o config completo (com segredos decriptados)
-- para uso EXCLUSIVO das Edge Functions (worker/health/webhook).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_service_load_provider_runtime_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  cfg public.communication_provider_settings%ROWTYPE;
  smtp_pw text;
  wa_tok text;
  wa_app text;
  wa_vt  text;
  result jsonb;
BEGIN
  -- Fail-closed: apenas service_role pode ler os segredos.
  IF current_setting('request.jwt.claim.role', true) IS NOT NULL
     AND current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF (SELECT current_user) NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO cfg FROM public.communication_provider_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('present', false);
  END IF;

  IF cfg.secret_smtp_password IS NOT NULL THEN
    SELECT decrypted_secret INTO smtp_pw FROM vault.decrypted_secrets WHERE id = cfg.secret_smtp_password;
  END IF;
  IF cfg.secret_whatsapp_access_token IS NOT NULL THEN
    SELECT decrypted_secret INTO wa_tok FROM vault.decrypted_secrets WHERE id = cfg.secret_whatsapp_access_token;
  END IF;
  IF cfg.secret_whatsapp_app_secret IS NOT NULL THEN
    SELECT decrypted_secret INTO wa_app FROM vault.decrypted_secrets WHERE id = cfg.secret_whatsapp_app_secret;
  END IF;
  IF cfg.secret_whatsapp_verify_token IS NOT NULL THEN
    SELECT decrypted_secret INTO wa_vt FROM vault.decrypted_secrets WHERE id = cfg.secret_whatsapp_verify_token;
  END IF;

  result := jsonb_build_object(
    'present', true,
    'test_mode_enabled', cfg.test_mode_enabled,
    'allowed_emails', to_jsonb(cfg.allowed_emails),
    'allowed_phones', to_jsonb(cfg.allowed_phones),
    'delivery_enabled', cfg.delivery_enabled,
    'email_delivery_enabled', cfg.email_delivery_enabled,
    'whatsapp_delivery_enabled', cfg.whatsapp_delivery_enabled,
    'inapp_delivery_enabled', cfg.inapp_delivery_enabled,
    'whatsapp_webhook_enabled', cfg.whatsapp_webhook_enabled,
    'smtp_host', cfg.smtp_host,
    'smtp_port', cfg.smtp_port,
    'smtp_user', cfg.smtp_user,
    'smtp_from', cfg.smtp_from,
    'smtp_password', smtp_pw,
    'whatsapp_phone_number_id', cfg.whatsapp_phone_number_id,
    'whatsapp_api_version', cfg.whatsapp_api_version,
    'whatsapp_access_token', wa_tok,
    'whatsapp_app_secret', wa_app,
    'whatsapp_verify_token', wa_vt
  );
  RETURN result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_service_load_provider_runtime_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_service_load_provider_runtime_config() TO service_role;
