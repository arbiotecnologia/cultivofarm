CREATE OR REPLACE FUNCTION public.get_my_available_portal_contexts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_has_b2b_role boolean := false;
  v_has_b2b_link boolean := false;
  v_has_b2b boolean := false;
  v_has_technical boolean := false;
  v_available text[] := ARRAY[]::text[];
  v_preferred text;
  v_last text;
  v_skip boolean := false;
  v_default text;
  v_must_select boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'available_contexts', ARRAY[]::text[],
      'default_context', NULL,
      'must_select_context', false,
      'has_b2b_access', false,
      'has_technical_access', false,
      'is_admin', false
    );
  END IF;

  -- Admin/gestor: autoridade total resolvida no servidor
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role IN ('administrador','gestor')
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN jsonb_build_object(
      'available_contexts', ARRAY['b2b','technical']::text[],
      'default_context', NULL,
      'must_select_context', false,
      'has_b2b_access', true,
      'has_technical_access', true,
      'is_admin', true,
      'skip_context_selector', true
    );
  END IF;

  -- Papel B2B
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role IN ('parceiro_b2b','parceiro_b2b_tecnico')
  ) INTO v_has_b2b_role;

  IF v_has_b2b_role THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.partner_users pu
      JOIN public.partner_accounts pa ON pa.id = pu.partner_id
      WHERE pu.user_id = v_uid
        AND pa.ativo = true
        AND pa.deleted_at IS NULL
    ) INTO v_has_b2b_link;
  END IF;

  v_has_b2b := v_has_b2b_role AND v_has_b2b_link;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role IN ('tecnico_agronomo','consultor_tecnico','aplicador')
  ) INTO v_has_technical;

  IF v_has_b2b THEN
    v_available := array_append(v_available, 'b2b');
  END IF;
  IF v_has_technical THEN
    v_available := array_append(v_available, 'technical');
  END IF;

  SELECT preferred_context, last_context, skip_context_selector
    INTO v_preferred, v_last, v_skip
  FROM public.user_access_preferences
  WHERE user_id = v_uid;

  IF v_preferred IS NOT NULL AND v_preferred = ANY(v_available) THEN
    v_default := v_preferred;
  ELSIF v_last IS NOT NULL AND v_last = ANY(v_available) THEN
    v_default := v_last;
  ELSIF array_length(v_available, 1) = 1 THEN
    v_default := v_available[1];
  ELSE
    v_default := NULL;
  END IF;

  v_must_select := (array_length(v_available, 1) >= 2)
                   AND (v_default IS NULL OR COALESCE(v_skip, false) = false);

  RETURN jsonb_build_object(
    'available_contexts', v_available,
    'default_context', v_default,
    'must_select_context', v_must_select,
    'has_b2b_access', v_has_b2b,
    'has_technical_access', v_has_technical,
    'is_admin', false
  );
END;
$function$;