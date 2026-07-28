-- Gate 4 · Admin consent RPC (staging ikaauvsflpmamgxmkhoq)

CREATE OR REPLACE FUNCTION public.rpc_admin_set_whatsapp_consent(
  p_cliente_id     uuid,
  p_user_id        uuid,
  p_acao           text,        -- 'opt_in' | 'opt_out' | 'verified'
  p_source         text,        -- 'admin_ui' | 'import' | 'support' | ...
  p_justificativa  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_now   timestamptz := now();
  v_src   text := COALESCE(NULLIF(btrim(p_source), ''), 'admin_ui');
  v_just  text := NULLIF(btrim(COALESCE(p_justificativa, '')), '');
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'administrador'::public.app_role) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF (p_cliente_id IS NULL AND p_user_id IS NULL) OR (p_cliente_id IS NOT NULL AND p_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'exactly_one_of_cliente_or_user_required' USING ERRCODE = '22023';
  END IF;
  IF p_acao NOT IN ('opt_in','opt_out','verified') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  IF length(v_src) > 60 THEN RAISE EXCEPTION 'invalid_source' USING ERRCODE='22023'; END IF;
  IF v_just IS NOT NULL AND length(v_just) > 500 THEN
    RAISE EXCEPTION 'invalid_justificativa' USING ERRCODE='22023';
  END IF;

  -- Trilha imutável (append-only). `source` embute justificativa quando presente.
  INSERT INTO public.comunicacao_consent_log(user_id, cliente_id, canal, acao, source, actor_id)
  VALUES (
    p_user_id, p_cliente_id, 'whatsapp'::public.comunicacao_canal, p_acao,
    CASE WHEN v_just IS NULL THEN v_src ELSE v_src || ':' || substr(v_just,1,120) END,
    v_actor
  );

  -- Estado atual (idempotente por (user_id|cliente_id, canal))
  INSERT INTO public.comunicacao_preferencias
    (user_id, cliente_id, canal, enabled,
     whatsapp_opt_in_at, whatsapp_opt_out_at, telefone_verificado, source)
  VALUES (
    p_user_id, p_cliente_id, 'whatsapp'::public.comunicacao_canal, true,
    CASE WHEN p_acao = 'opt_in'   THEN v_now ELSE NULL END,
    CASE WHEN p_acao = 'opt_out'  THEN v_now ELSE NULL END,
    CASE WHEN p_acao = 'verified' THEN true  ELSE false END,
    'admin'
  )
  ON CONFLICT (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
               COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
               canal)
  DO UPDATE SET
    whatsapp_opt_in_at  = CASE WHEN p_acao='opt_in'  THEN v_now
                               WHEN p_acao='opt_out' THEN public.comunicacao_preferencias.whatsapp_opt_in_at
                               ELSE public.comunicacao_preferencias.whatsapp_opt_in_at END,
    whatsapp_opt_out_at = CASE WHEN p_acao='opt_out' THEN v_now
                               WHEN p_acao='opt_in'  THEN NULL
                               ELSE public.comunicacao_preferencias.whatsapp_opt_out_at END,
    telefone_verificado = CASE WHEN p_acao='verified' THEN true
                               ELSE public.comunicacao_preferencias.telefone_verificado END,
    enabled = CASE WHEN p_acao='opt_out' THEN public.comunicacao_preferencias.enabled ELSE true END,
    updated_at = v_now,
    source = 'admin';

  RETURN jsonb_build_object('ok', true, 'acao', p_acao, 'at', v_now);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_set_whatsapp_consent(uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_whatsapp_consent(uuid,uuid,text,text,text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_admin_set_whatsapp_consent(uuid,uuid,text,text,text)
IS 'Gate 4 · admin-only. Registra opt_in/opt_out/verified WhatsApp em comunicacao_consent_log (append-only) + comunicacao_preferencias. Sem envio externo. Sem PII em log.';
