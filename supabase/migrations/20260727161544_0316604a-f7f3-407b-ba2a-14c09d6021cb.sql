
CREATE OR REPLACE FUNCTION public.rpc_service_set_provider_secret(
  p_slot text,
  p_value text,
  p_actor uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_col text;
  v_name text;
  v_existing uuid;
  v_new uuid;
BEGIN
  IF (SELECT current_user) NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_value IS NULL OR length(p_value) = 0 THEN
    RAISE EXCEPTION 'empty_value' USING ERRCODE = '22023';
  END IF;

  CASE p_slot
    WHEN 'smtp_password'          THEN v_col := 'secret_smtp_password';         v_name := 'comm_smtp_password';
    WHEN 'whatsapp_access_token'  THEN v_col := 'secret_whatsapp_access_token'; v_name := 'comm_whatsapp_access_token';
    WHEN 'whatsapp_app_secret'    THEN v_col := 'secret_whatsapp_app_secret';   v_name := 'comm_whatsapp_app_secret';
    WHEN 'whatsapp_verify_token'  THEN v_col := 'secret_whatsapp_verify_token'; v_name := 'comm_whatsapp_verify_token';
    ELSE RAISE EXCEPTION 'invalid_slot' USING ERRCODE = '22023';
  END CASE;

  EXECUTE format('SELECT %I FROM public.communication_provider_settings WHERE id = 1', v_col)
    INTO v_existing;

  IF v_existing IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing, p_value, v_name || '_' || extract(epoch from now())::bigint::text, NULL);
    v_new := v_existing;
  ELSE
    v_new := vault.create_secret(p_value, v_name || '_' || extract(epoch from now())::bigint::text, NULL);
  END IF;

  EXECUTE format(
    'UPDATE public.communication_provider_settings SET %I = $1, updated_at = now(), updated_by = $2 WHERE id = 1',
    v_col
  ) USING v_new, p_actor;

  INSERT INTO public.communication_provider_settings_audit(actor_id, action, secret_field, changed_fields)
  VALUES (p_actor, 'set_secret', p_slot, ARRAY[v_col]);
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_service_set_provider_secret(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_service_set_provider_secret(text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_service_clear_provider_secret(
  p_slot text,
  p_actor uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_col text;
  v_existing uuid;
BEGIN
  IF (SELECT current_user) NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  CASE p_slot
    WHEN 'smtp_password'          THEN v_col := 'secret_smtp_password';
    WHEN 'whatsapp_access_token'  THEN v_col := 'secret_whatsapp_access_token';
    WHEN 'whatsapp_app_secret'    THEN v_col := 'secret_whatsapp_app_secret';
    WHEN 'whatsapp_verify_token'  THEN v_col := 'secret_whatsapp_verify_token';
    ELSE RAISE EXCEPTION 'invalid_slot' USING ERRCODE = '22023';
  END CASE;

  EXECUTE format('SELECT %I FROM public.communication_provider_settings WHERE id = 1', v_col)
    INTO v_existing;

  IF v_existing IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_existing;
    EXECUTE format(
      'UPDATE public.communication_provider_settings SET %I = NULL, updated_at = now(), updated_by = $1 WHERE id = 1',
      v_col
    ) USING p_actor;
  END IF;

  INSERT INTO public.communication_provider_settings_audit(actor_id, action, secret_field, changed_fields)
  VALUES (p_actor, 'clear_secret', p_slot, ARRAY[v_col]);
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_service_clear_provider_secret(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_service_clear_provider_secret(text, uuid) TO service_role;
