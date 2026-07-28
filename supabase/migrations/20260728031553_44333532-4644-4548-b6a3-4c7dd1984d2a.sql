CREATE OR REPLACE FUNCTION public.rpc_service_apply_provider_settings(p_actor uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_row       public.communication_provider_settings%ROWTYPE;
  v_updates   jsonb := '{}'::jsonb;
  v_secret_ops jsonb := '[]'::jsonb;
  v_changed   text[] := ARRAY[]::text[];
  v_op        jsonb;
  v_slot      text;
  v_col       text;
  v_action    text;
  v_value     text;
  v_existing  uuid;
  v_new_id    uuid;
  v_name      text;
  v_effective_test_mode boolean;
  v_effective_email_on  boolean;
  v_effective_wa_on     boolean;
  v_effective_delivery_on boolean;
  v_effective_smtp_pw_configured boolean;
  v_effective_wa_tok_configured  boolean;
BEGIN
  IF (SELECT current_user) NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'invalid_actor' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  v_updates    := coalesce(p_payload->'updates', '{}'::jsonb);
  v_secret_ops := coalesce(p_payload->'secret_ops', '[]'::jsonb);

  IF jsonb_typeof(v_updates) <> 'object' THEN
    RAISE EXCEPTION 'invalid_updates' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_secret_ops) <> 'array' THEN
    RAISE EXCEPTION 'invalid_secret_ops' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.communication_provider_settings WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settings_row_missing' USING ERRCODE = 'P0002';
  END IF;

  FOR v_op IN SELECT * FROM jsonb_array_elements(v_secret_ops) LOOP
    v_slot   := v_op->>'slot';
    v_action := v_op->>'action';
    v_value  := v_op->>'value';

    CASE v_slot
      WHEN 'smtp_password'         THEN v_col := 'secret_smtp_password';         v_name := 'comm_smtp_password';
      WHEN 'whatsapp_access_token' THEN v_col := 'secret_whatsapp_access_token'; v_name := 'comm_whatsapp_access_token';
      WHEN 'whatsapp_app_secret'   THEN v_col := 'secret_whatsapp_app_secret';   v_name := 'comm_whatsapp_app_secret';
      WHEN 'whatsapp_verify_token' THEN v_col := 'secret_whatsapp_verify_token'; v_name := 'comm_whatsapp_verify_token';
      ELSE RAISE EXCEPTION 'invalid_slot' USING ERRCODE = '22023';
    END CASE;

    EXECUTE format('SELECT %I FROM public.communication_provider_settings WHERE id = 1', v_col)
      INTO v_existing;

    IF v_action = 'set' THEN
      IF v_value IS NULL OR length(v_value) = 0 THEN
        RAISE EXCEPTION 'empty_secret_value' USING ERRCODE = '22023';
      END IF;
      IF v_existing IS NOT NULL THEN
        PERFORM vault.update_secret(
          v_existing,
          v_value,
          v_name || '_' || extract(epoch from now())::bigint::text,
          NULL::text
        );
        v_new_id := v_existing;
      ELSE
        v_new_id := vault.create_secret(
          v_value,
          v_name || '_' || extract(epoch from now())::bigint::text,
          NULL::text
        );
      END IF;
      EXECUTE format('UPDATE public.communication_provider_settings SET %I = $1 WHERE id = 1', v_col)
        USING v_new_id;
      v_changed := array_append(v_changed, v_col);
    ELSIF v_action = 'clear' THEN
      IF v_existing IS NOT NULL THEN
        DELETE FROM vault.secrets WHERE id = v_existing;
        EXECUTE format('UPDATE public.communication_provider_settings SET %I = NULL WHERE id = 1', v_col);
      END IF;
      v_changed := array_append(v_changed, v_col);
    ELSE
      RAISE EXCEPTION 'invalid_secret_action' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.communication_provider_settings_audit(actor_id, action, secret_field, changed_fields)
    VALUES (p_actor, 'secret_' || v_action, v_slot, ARRAY[v_col]);
  END LOOP;

  IF v_updates ? 'test_mode_enabled' THEN
    UPDATE public.communication_provider_settings SET test_mode_enabled = (v_updates->>'test_mode_enabled')::boolean WHERE id = 1;
    v_changed := array_append(v_changed, 'test_mode_enabled');
  END IF;
  IF v_updates ? 'allowed_emails' THEN
    UPDATE public.communication_provider_settings
       SET allowed_emails = ARRAY(SELECT jsonb_array_elements_text(v_updates->'allowed_emails'))
     WHERE id = 1;
    v_changed := array_append(v_changed, 'allowed_emails');
  END IF;
  IF v_updates ? 'allowed_phones' THEN
    UPDATE public.communication_provider_settings
       SET allowed_phones = ARRAY(SELECT jsonb_array_elements_text(v_updates->'allowed_phones'))
     WHERE id = 1;
    v_changed := array_append(v_changed, 'allowed_phones');
  END IF;
  IF v_updates ? 'delivery_enabled' THEN
    UPDATE public.communication_provider_settings SET delivery_enabled = (v_updates->>'delivery_enabled')::boolean WHERE id = 1;
    v_changed := array_append(v_changed, 'delivery_enabled');
  END IF;
  IF v_updates ? 'email_delivery_enabled' THEN
    UPDATE public.communication_provider_settings SET email_delivery_enabled = (v_updates->>'email_delivery_enabled')::boolean WHERE id = 1;
    v_changed := array_append(v_changed, 'email_delivery_enabled');
  END IF;
  IF v_updates ? 'whatsapp_delivery_enabled' THEN
    UPDATE public.communication_provider_settings SET whatsapp_delivery_enabled = (v_updates->>'whatsapp_delivery_enabled')::boolean WHERE id = 1;
    v_changed := array_append(v_changed, 'whatsapp_delivery_enabled');
  END IF;
  IF v_updates ? 'inapp_delivery_enabled' THEN
    UPDATE public.communication_provider_settings SET inapp_delivery_enabled = (v_updates->>'inapp_delivery_enabled')::boolean WHERE id = 1;
    v_changed := array_append(v_changed, 'inapp_delivery_enabled');
  END IF;
  IF v_updates ? 'whatsapp_webhook_enabled' THEN
    UPDATE public.communication_provider_settings SET whatsapp_webhook_enabled = (v_updates->>'whatsapp_webhook_enabled')::boolean WHERE id = 1;
    v_changed := array_append(v_changed, 'whatsapp_webhook_enabled');
  END IF;
  IF v_updates ? 'smtp_host' THEN
    UPDATE public.communication_provider_settings SET smtp_host = NULLIF(v_updates->>'smtp_host','') WHERE id = 1;
    v_changed := array_append(v_changed, 'smtp_host');
  END IF;
  IF v_updates ? 'smtp_port' THEN
    UPDATE public.communication_provider_settings SET smtp_port = NULLIF(v_updates->>'smtp_port','')::integer WHERE id = 1;
    v_changed := array_append(v_changed, 'smtp_port');
  END IF;
  IF v_updates ? 'smtp_user' THEN
    UPDATE public.communication_provider_settings SET smtp_user = NULLIF(v_updates->>'smtp_user','') WHERE id = 1;
    v_changed := array_append(v_changed, 'smtp_user');
  END IF;
  IF v_updates ? 'smtp_from' THEN
    UPDATE public.communication_provider_settings SET smtp_from = NULLIF(v_updates->>'smtp_from','') WHERE id = 1;
    v_changed := array_append(v_changed, 'smtp_from');
  END IF;
  IF v_updates ? 'whatsapp_phone_number_id' THEN
    UPDATE public.communication_provider_settings SET whatsapp_phone_number_id = NULLIF(v_updates->>'whatsapp_phone_number_id','') WHERE id = 1;
    v_changed := array_append(v_changed, 'whatsapp_phone_number_id');
  END IF;
  IF v_updates ? 'whatsapp_api_version' THEN
    UPDATE public.communication_provider_settings SET whatsapp_api_version = NULLIF(v_updates->>'whatsapp_api_version','') WHERE id = 1;
    v_changed := array_append(v_changed, 'whatsapp_api_version');
  END IF;

  SELECT * INTO v_row FROM public.communication_provider_settings WHERE id = 1;
  v_effective_test_mode        := v_row.test_mode_enabled;
  v_effective_email_on         := v_row.email_delivery_enabled;
  v_effective_wa_on            := v_row.whatsapp_delivery_enabled;
  v_effective_delivery_on      := v_row.delivery_enabled;
  v_effective_smtp_pw_configured := v_row.secret_smtp_password  IS NOT NULL AND v_row.smtp_host IS NOT NULL AND v_row.smtp_port IS NOT NULL AND v_row.smtp_user IS NOT NULL AND v_row.smtp_from IS NOT NULL;
  v_effective_wa_tok_configured  := v_row.secret_whatsapp_access_token IS NOT NULL AND v_row.whatsapp_phone_number_id IS NOT NULL AND v_row.whatsapp_api_version IS NOT NULL;

  IF NOT v_effective_test_mode THEN
    IF v_effective_delivery_on AND v_effective_email_on AND NOT v_effective_smtp_pw_configured THEN
      RAISE EXCEPTION 'test_mode_off_requires_email_provider' USING ERRCODE = 'P0001';
    END IF;
    IF v_effective_delivery_on AND v_effective_wa_on AND NOT v_effective_wa_tok_configured THEN
      RAISE EXCEPTION 'test_mode_off_requires_whatsapp_provider' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF v_effective_delivery_on AND v_effective_email_on AND NOT v_effective_smtp_pw_configured THEN
    RAISE EXCEPTION 'email_enabled_requires_provider_configured' USING ERRCODE = 'P0001';
  END IF;
  IF v_effective_delivery_on AND v_effective_wa_on AND NOT v_effective_wa_tok_configured THEN
    RAISE EXCEPTION 'whatsapp_enabled_requires_provider_configured' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.communication_provider_settings
     SET updated_at = now(), updated_by = p_actor
   WHERE id = 1;

  INSERT INTO public.communication_provider_settings_audit(actor_id, action, changed_fields)
  VALUES (p_actor, 'apply', v_changed);

  RETURN jsonb_build_object('ok', true, 'changed_fields', to_jsonb(v_changed));
END;
$function$;