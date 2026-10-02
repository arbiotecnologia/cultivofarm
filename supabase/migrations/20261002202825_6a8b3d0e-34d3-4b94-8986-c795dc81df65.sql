DO $audit_cf$
DECLARE
  v_actor uuid := 'b2c9bb8c-3ac3-4d65-b977-b7c873954b2e'::uuid;
  v_result jsonb;
BEGIN
  IF NOT public.is_platform_superadmin(v_actor) THEN
    RAISE EXCEPTION 'audit_cf_actor_not_superadmin';
  END IF;

  IF (SELECT count(*) FROM public.organizations WHERE cnpj_normalizado = '36736180000111') <> 1 THEN
    RAISE EXCEPTION 'audit_cf_e01_org_count_changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.organizations
     WHERE cnpj_normalizado = '36736180000111'
       AND nome_fantasia ILIKE '%HOMOLOGAÇÃO AUDIT-CF-20261002-01%'
       AND lower(email_corporativo) = 'renato@refilinformatica.com.br'
       AND status = 'aguardando_ativacao'
       AND ativo = true
  ) THEN
    RAISE EXCEPTION 'audit_cf_e01_contract_changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.platform_org_admin_invites
     WHERE organization_id = (SELECT id FROM public.organizations WHERE cnpj_normalizado = '36736180000111')
        OR lower(email) = 'teste@refilinformatica.com.br'
  ) THEN
    RAISE EXCEPTION 'audit_cf_e02_already_exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.platform_org_admin_invites
     WHERE lease_expires_at > now() OR email_lease_expires_at > now()
  ) THEN
    RAISE EXCEPTION 'audit_cf_active_lease';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.communication_provider_settings
     WHERE id = 1
       AND delivery_enabled = false
       AND email_delivery_enabled = false
       AND test_mode_enabled = true
       AND allowed_emails = ARRAY['teste@refilinformatica.com.br']::text[]
       AND whatsapp_delivery_enabled = false
       AND inapp_delivery_enabled = false
       AND whatsapp_webhook_enabled = false
       AND nullif(trim(smtp_host), '') IS NOT NULL
       AND smtp_port IS NOT NULL
       AND nullif(trim(smtp_user), '') IS NOT NULL
       AND nullif(trim(smtp_from), '') IS NOT NULL
       AND secret_smtp_password IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'audit_cf_smtp_precondition_failed';
  END IF;

  v_result := public.rpc_service_apply_provider_settings(
    v_actor,
    jsonb_build_object(
      'updates', jsonb_build_object(
        'delivery_enabled', true,
        'email_delivery_enabled', true
      ),
      'secret_ops', '[]'::jsonb
    )
  );

  IF v_result->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'audit_cf_smtp_window_failed';
  END IF;
END
$audit_cf$;