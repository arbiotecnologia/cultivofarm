
CREATE OR REPLACE FUNCTION public.log_my_access_denied_secure(p_context text, p_route_group text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx text;
  v_group text;
  v_contexts jsonb;
  v_authorized boolean;
  v_check_failed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'not_authenticated');
  END IF;

  v_ctx := lower(coalesce(p_context, ''));
  IF v_ctx NOT IN ('b2b', 'technical', 'producer') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_context');
  END IF;

  IF v_ctx IN ('b2b', 'technical') THEN
    BEGIN
      v_contexts := public.get_my_available_portal_contexts();
    EXCEPTION WHEN OTHERS THEN
      v_check_failed := true;
    END;
    IF v_check_failed THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'authorization_check_failed');
    END IF;
    v_authorized := CASE
      WHEN v_ctx = 'b2b' THEN coalesce((v_contexts->>'has_b2b_access')::boolean, false)
      WHEN v_ctx = 'technical' THEN coalesce((v_contexts->>'has_technical_access')::boolean, false)
      ELSE false
    END;
  ELSE
    BEGIN
      v_authorized := public.has_role(v_uid, 'cliente_produtor'::public.app_role);
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'error_code', 'authorization_check_failed');
    END;
  END IF;

  IF v_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'context_is_authorized');
  END IF;

  v_group := lower(coalesce(p_route_group, ''));
  v_group := regexp_replace(v_group, '[^a-z0-9_\-/]', '', 'g');
  IF length(v_group) > 64 THEN
    v_group := substring(v_group from 1 for 64);
  END IF;
  IF v_group = '' THEN
    v_group := NULL;
  END IF;

  INSERT INTO public.user_context_access_logs(
    user_id, action, context_code, metadata
  )
  VALUES (
    v_uid,
    'access_denied',
    v_ctx,
    jsonb_build_object('route_group', v_group)
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error_code', 'log_failed');
END;
$function$;

REVOKE ALL ON FUNCTION public.log_my_access_denied_secure(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_my_access_denied_secure(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_my_access_denied_secure(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_my_access_denied_secure(text, text) TO service_role;
