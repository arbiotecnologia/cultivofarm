
-- ============================================================
-- FASE 4 — RPCs de resolução de contexto multiportal
-- ============================================================

-- 1) Resolver contextos disponíveis para o usuário autenticado
CREATE OR REPLACE FUNCTION public.get_my_available_portal_contexts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
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
      'has_technical_access', false
    );
  END IF;

  -- Papel B2B
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role IN ('parceiro_b2b','parceiro_b2b_tecnico')
  ) INTO v_has_b2b_role;

  -- Vínculo B2B ativo
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

  -- Papel técnico
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

  -- Preferência
  SELECT preferred_context, last_context, skip_context_selector
    INTO v_preferred, v_last, v_skip
  FROM public.user_access_preferences
  WHERE user_id = v_uid;

  -- Default: preferred válido → last válido → único disponível
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
    'has_technical_access', v_has_technical
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_available_portal_contexts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_available_portal_contexts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_available_portal_contexts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_available_portal_contexts() TO service_role;

-- 2) Salvar preferência de contexto do usuário autenticado
CREATE OR REPLACE FUNCTION public.set_my_context_preference(
  p_context text,
  p_remember boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_previous text;
  v_action text;
  v_available jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_context NOT IN ('b2b','technical') THEN
    RAISE EXCEPTION 'invalid context %', p_context;
  END IF;

  -- Verifica se o contexto está realmente disponível para este usuário
  v_available := public.get_my_available_portal_contexts();
  IF NOT (v_available->'available_contexts' ? p_context) THEN
    INSERT INTO public.user_context_access_logs (user_id, context_code, action, previous_context, metadata)
    VALUES (v_uid, p_context, 'access_denied', NULL,
            jsonb_build_object('reason','context_not_available'));
    RAISE EXCEPTION 'context % not available for user', p_context;
  END IF;

  SELECT last_context INTO v_previous
  FROM public.user_access_preferences
  WHERE user_id = v_uid;

  INSERT INTO public.user_access_preferences (
    user_id, last_context, preferred_context, skip_context_selector
  ) VALUES (
    v_uid, p_context,
    CASE WHEN p_remember THEN p_context ELSE NULL END,
    COALESCE(p_remember, false)
  )
  ON CONFLICT (user_id) DO UPDATE
    SET last_context = EXCLUDED.last_context,
        preferred_context = CASE
          WHEN p_remember THEN EXCLUDED.last_context
          ELSE public.user_access_preferences.preferred_context
        END,
        skip_context_selector = CASE
          WHEN p_remember THEN true
          ELSE public.user_access_preferences.skip_context_selector
        END,
        updated_at = now();

  v_action := CASE
    WHEN v_previous IS NULL THEN 'context_selected'
    WHEN v_previous = p_context THEN 'context_selected'
    ELSE 'context_switched'
  END;

  INSERT INTO public.user_context_access_logs (
    user_id, context_code, action, previous_context, metadata
  ) VALUES (
    v_uid, p_context, v_action, v_previous,
    jsonb_build_object('remember', COALESCE(p_remember, false))
  );

  RETURN jsonb_build_object(
    'ok', true,
    'context', p_context,
    'remembered', COALESCE(p_remember, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_context_preference(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_context_preference(text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_context_preference(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_context_preference(text, boolean) TO service_role;
