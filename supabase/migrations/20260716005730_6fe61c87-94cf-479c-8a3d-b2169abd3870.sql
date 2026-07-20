
CREATE OR REPLACE FUNCTION public.log_my_access_denied_secure(
  p_context text,
  p_route_group text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx text;
  v_group text;
  v_contexts jsonb;
  v_authorized boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'not_authenticated');
  END IF;

  v_ctx := lower(coalesce(p_context, ''));
  IF v_ctx NOT IN ('b2b', 'technical') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_context');
  END IF;

  -- Fase Corretiva 5: nunca registrar access_denied se o contexto está autorizado.
  -- Reutiliza a mesma RPC de contextos para evitar regras divergentes.
  BEGIN
    v_contexts := public.get_my_available_portal_contexts();
  EXCEPTION WHEN OTHERS THEN
    v_contexts := '{}'::jsonb;
  END;

  v_authorized := CASE
    WHEN v_ctx = 'b2b' THEN coalesce((v_contexts->>'has_b2b_access')::boolean, false)
    WHEN v_ctx = 'technical' THEN coalesce((v_contexts->>'has_technical_access')::boolean, false)
    ELSE false
  END;

  IF v_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'context_is_authorized');
  END IF;

  -- Sanitiza route_group: aceita apenas [a-z0-9-_/] e limita a 64 chars.
  v_group := lower(coalesce(p_route_group, ''));
  v_group := regexp_replace(v_group, '[^a-z0-9_\-/]', '', 'g');
  IF length(v_group) > 64 THEN
    v_group := substring(v_group from 1 for 64);
  END IF;
  IF v_group = '' THEN
    v_group := NULL;
  END IF;

  INSERT INTO public.user_context_access_logs(
    user_id, event_type, context, metadata
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
