-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260727161408_f3b6bc19-55b3-473b-80aa-14481e58cbf0.sql
-- SHA-256 orig: fdc535488ef8ad8fa9dc6246af38546c86066b25ffea368c9640268bcd9f8e5f
-- Gerador     : montagem determinística (P0c), ver 18-p0c-fechamento-blockers.md
-- Transformação: guarda canônica de promoção prefixada + precheck fail-closed de
--   Vault/auth + pós-check de flags=false e secret_* IS NULL. O corpo histórico
--   é preservado byte a byte. Nenhum segredo é criado, copiado ou referenciado.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- Precheck fail-closed: a estrutura só é criada onde o Vault existe e é legível
-- pelo executor, e onde auth.users existe (FK). Nenhum segredo externo é
-- necessário: os 4 slots nascem NULL e as integrações permanecem desligadas.
DO $vault_pre$
BEGIN
  IF to_regnamespace('vault') IS NULL THEN
    RAISE EXCEPTION 'COMM_PROMO: schema vault ausente';
  END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'COMM_PROMO: vault.decrypted_secrets ausente';
  END IF;
  IF NOT has_table_privilege(current_user, 'vault.decrypted_secrets', 'SELECT') THEN
    RAISE EXCEPTION 'COMM_PROMO: executor sem SELECT em vault.decrypted_secrets';
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'COMM_PROMO: auth.users ausente';
  END IF;
END
$vault_pre$;

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

-- Pós-check fail-closed: entrega desligada, nenhum segredo referenciado e
-- tabela inacessível a anon/authenticated.
DO $comm_pos$
DECLARE
  cfg public.communication_provider_settings%ROWTYPE;
  v_acl text;
BEGIN
  SELECT * INTO cfg FROM public.communication_provider_settings WHERE id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMM_PROMO: linha de configuração ausente'; END IF;
  IF cfg.delivery_enabled OR cfg.email_delivery_enabled OR cfg.whatsapp_delivery_enabled
     OR cfg.inapp_delivery_enabled OR cfg.whatsapp_webhook_enabled THEN
    RAISE EXCEPTION 'COMM_PROMO: alguma flag de entrega esta ligada';
  END IF;
  IF cfg.secret_smtp_password IS NOT NULL
     OR cfg.secret_whatsapp_access_token IS NOT NULL
     OR cfg.secret_whatsapp_app_secret IS NOT NULL
     OR cfg.secret_whatsapp_verify_token IS NOT NULL THEN
    RAISE EXCEPTION 'COMM_PROMO: slot de segredo preenchido — esperado NULL nesta onda';
  END IF;

  SELECT array_to_string(c.relacl, ',') INTO v_acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'communication_provider_settings';
  IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' OR v_acl ~ '(^|,)=' THEN
    RAISE EXCEPTION 'COMM_PROMO: tabela exposta a anon/authenticated/PUBLIC';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='public' AND tablename='communication_provider_settings') THEN
    RAISE EXCEPTION 'COMM_PROMO: policy inesperada — deny-by-default exigido';
  END IF;

  IF has_function_privilege('anon', 'public.rpc_service_load_provider_runtime_config()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rpc_service_load_provider_runtime_config()', 'EXECUTE') THEN
    RAISE EXCEPTION 'COMM_PROMO: RPC de runtime executavel fora de service_role';
  END IF;
END
$comm_pos$;
