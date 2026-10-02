-- D51.2-C — restaura somente o singleton ausente com estado fail-closed.
-- Idempotente e race-safe: uma linha concorrente com id=1 é preservada integralmente.
INSERT INTO public.communication_provider_settings (
  id,
  test_mode_enabled,
  allowed_emails,
  allowed_phones,
  delivery_enabled,
  email_delivery_enabled,
  whatsapp_delivery_enabled,
  inapp_delivery_enabled,
  whatsapp_webhook_enabled,
  smtp_host,
  smtp_port,
  smtp_user,
  smtp_from,
  whatsapp_phone_number_id,
  whatsapp_api_version,
  secret_smtp_password,
  secret_whatsapp_access_token,
  secret_whatsapp_app_secret,
  secret_whatsapp_verify_token,
  updated_at,
  updated_by
)
VALUES (
  1,
  true,
  ARRAY[]::text[],
  ARRAY[]::text[],
  false,
  false,
  false,
  false,
  false,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  now(),
  NULL
)
ON CONFLICT (id) DO NOTHING;