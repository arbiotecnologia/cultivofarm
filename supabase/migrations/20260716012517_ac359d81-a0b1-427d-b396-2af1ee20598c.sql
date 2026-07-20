-- Fase Corretiva Final Bloco 2: auditoria correta do produtor
-- 1) Expande enum textual de context_code para incluir 'producer'
ALTER TABLE public.user_context_access_logs
  DROP CONSTRAINT IF EXISTS user_context_access_logs_context_chk;

ALTER TABLE public.user_context_access_logs
  ADD CONSTRAINT user_context_access_logs_context_chk
  CHECK (context_code = ANY (ARRAY['b2b'::text, 'technical'::text, 'producer'::text, 'none'::text]));

ALTER TABLE public.user_context_access_logs
  DROP CONSTRAINT IF EXISTS user_context_access_logs_previous_chk;

ALTER TABLE public.user_context_access_logs
  ADD CONSTRAINT user_context_access_logs_previous_chk
  CHECK (previous_context IS NULL OR (previous_context = ANY (ARRAY['b2b'::text, 'technical'::text, 'producer'::text, 'none'::text])));

-- 2) Substitui RPC para (a) usar nomes reais de coluna (action, context_code)
--    (b) aceitar contexto 'producer' validando has_role(cliente_produtor)
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
  IF v_ctx NOT IN ('b2b', 'technical', 'producer') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_context');
  END IF;

  -- Evita registrar access_denied quando o contexto já é autorizado.
  IF v_ctx IN ('b2b', 'technical') THEN
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
  ELSE
    -- producer: verifica via has_role para não depender da RPC de portais
    v_authorized := public.has_role(v_uid, 'cliente_produtor'::public.app_role);
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

GRANT EXECUTE ON FUNCTION public.log_my_access_denied_secure(text, text) TO authenticated;