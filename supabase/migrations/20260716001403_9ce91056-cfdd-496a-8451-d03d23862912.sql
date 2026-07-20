
-- =========================================================
-- BLOCO 1 — CORREÇÃO: preferências, auditoria e RPCs multiportal
-- Migration aditiva; não altera enum app_role, user_roles,
-- partner_users, partner_accounts, profiles.
-- =========================================================

-- 1) Blindar user_access_preferences: só SELECT próprio
DROP POLICY IF EXISTS "Users insert own access preferences" ON public.user_access_preferences;
DROP POLICY IF EXISTS "Users update own access preferences" ON public.user_access_preferences;

REVOKE INSERT, UPDATE, DELETE ON public.user_access_preferences FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_access_preferences FROM anon;
GRANT SELECT ON public.user_access_preferences TO authenticated;
GRANT ALL ON public.user_access_preferences TO service_role;

-- 2) Blindar user_context_access_logs: só SELECT próprio (+ admin)
DROP POLICY IF EXISTS "Users insert own context logs" ON public.user_context_access_logs;

REVOKE INSERT, UPDATE, DELETE ON public.user_context_access_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_context_access_logs FROM anon;
GRANT SELECT ON public.user_context_access_logs TO authenticated;
GRANT ALL ON public.user_context_access_logs TO service_role;

-- 3) Corrigir set_my_context_preference
--    - retorna JSON de erro quando o contexto não está disponível
--      (log de access_denied persiste, sem RAISE / sem rollback)
--    - p_remember=false limpa preferred_context/skip_context_selector
CREATE OR REPLACE FUNCTION public.set_my_context_preference(
  p_context text,
  p_remember boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  v_available := public.get_my_available_portal_contexts();

  IF NOT (v_available->'available_contexts' ? p_context) THEN
    -- Grava auditoria e retorna erro em JSON (sem RAISE).
    -- Sem exception, sem rollback: o INSERT persiste.
    INSERT INTO public.user_context_access_logs (
      user_id, context_code, action, previous_context, metadata
    ) VALUES (
      v_uid, p_context, 'access_denied', NULL,
      jsonb_build_object('reason','context_not_available')
    );

    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'context_not_available',
      'context', p_context
    );
  END IF;

  SELECT last_context INTO v_previous
  FROM public.user_access_preferences
  WHERE user_id = v_uid;

  -- Upsert com semântica correta para p_remember=false (limpar preferência)
  INSERT INTO public.user_access_preferences (
    user_id, last_context, preferred_context, skip_context_selector
  ) VALUES (
    v_uid,
    p_context,
    CASE WHEN p_remember THEN p_context ELSE NULL END,
    COALESCE(p_remember, false)
  )
  ON CONFLICT (user_id) DO UPDATE
    SET last_context = EXCLUDED.last_context,
        preferred_context = CASE
          WHEN p_remember THEN EXCLUDED.last_context
          ELSE NULL
        END,
        skip_context_selector = COALESCE(p_remember, false),
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
$function$;

REVOKE ALL ON FUNCTION public.set_my_context_preference(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_context_preference(text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_context_preference(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_context_preference(text, boolean) TO service_role;

-- 4) Nova RPC para redirect automático de login (log seguro)
CREATE OR REPLACE FUNCTION public.register_my_login_redirect_secure(
  p_context text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_available jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_context NOT IN ('b2b','technical') THEN
    RAISE EXCEPTION 'invalid context %', p_context;
  END IF;

  v_available := public.get_my_available_portal_contexts();

  IF NOT (v_available->'available_contexts' ? p_context) THEN
    INSERT INTO public.user_context_access_logs (
      user_id, context_code, action, previous_context, metadata
    ) VALUES (
      v_uid, p_context, 'access_denied', NULL,
      jsonb_build_object('reason','context_not_available','source','login_redirect')
    );

    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'context_not_available',
      'context', p_context
    );
  END IF;

  -- Metadata fixa; frontend não escolhe.
  INSERT INTO public.user_context_access_logs (
    user_id, context_code, action, previous_context, metadata
  ) VALUES (
    v_uid, p_context, 'login_redirect', NULL,
    jsonb_build_object('source','auto')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'context', p_context,
    'action', 'login_redirect'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.register_my_login_redirect_secure(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_my_login_redirect_secure(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_my_login_redirect_secure(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_my_login_redirect_secure(text) TO service_role;

-- 5) Reafirmar segurança de get_my_available_portal_contexts
REVOKE ALL ON FUNCTION public.get_my_available_portal_contexts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_available_portal_contexts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_available_portal_contexts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_available_portal_contexts() TO service_role;
