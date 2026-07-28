-- Snapshot do artefato aplicado em staging ikaauvsflpmamgxmkhoq via ferramenta
-- supabase--migration em rodada anterior (Gate 4). Este arquivo é uma cópia
-- documental idempotente para auditoria estática — NÃO é executado por CI.
-- Verificação empírica em runtime: rpc_admin_set_whatsapp_consent existe no
-- banco com estas ACLs (anon=false, authenticated=true, service_role=true).

CREATE OR REPLACE FUNCTION public.rpc_admin_set_whatsapp_consent(
  p_cliente_id uuid,
  p_user_id uuid,
  p_acao text,
  p_source text,
  p_justificativa text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrador') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF (p_cliente_id IS NULL AND p_user_id IS NULL) OR (p_cliente_id IS NOT NULL AND p_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'informar exatamente um alvo: p_cliente_id XOR p_user_id';
  END IF;
  IF p_acao NOT IN ('opt_in','opt_out','verified') THEN
    RAISE EXCEPTION 'acao inválida: %', p_acao;
  END IF;
  IF coalesce(length(p_source),0) = 0 OR length(p_source) > 60 THEN
    RAISE EXCEPTION 'source obrigatório (1..60 chars)';
  END IF;
  IF p_justificativa IS NOT NULL AND length(p_justificativa) > 500 THEN
    RAISE EXCEPTION 'justificativa excede 500 chars';
  END IF;

  INSERT INTO public.comunicacao_consent_log
    (cliente_id, user_id, canal, acao, source, actor_id)
  VALUES
    (p_cliente_id, p_user_id, 'whatsapp'::comunicacao_canal, p_acao,
     p_source || CASE WHEN p_justificativa IS NOT NULL THEN ' :: ' || p_justificativa ELSE '' END,
     auth.uid());

  INSERT INTO public.comunicacao_preferencias
    (cliente_id, user_id, canal, enabled, telefone_verificado,
     whatsapp_opt_in_at, whatsapp_opt_out_at, source)
  VALUES
    (p_cliente_id, p_user_id, 'whatsapp'::comunicacao_canal, true,
     (p_acao = 'verified'),
     CASE WHEN p_acao = 'opt_in' THEN now() ELSE NULL END,
     CASE WHEN p_acao = 'opt_out' THEN now() ELSE NULL END,
     p_source)
  ON CONFLICT (coalesce(cliente_id,'00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid),
               canal)
  DO UPDATE SET
    telefone_verificado = greatest(public.comunicacao_preferencias.telefone_verificado, EXCLUDED.telefone_verificado),
    whatsapp_opt_in_at  = CASE WHEN EXCLUDED.whatsapp_opt_in_at IS NOT NULL
                                 THEN EXCLUDED.whatsapp_opt_in_at
                                 ELSE public.comunicacao_preferencias.whatsapp_opt_in_at END,
    whatsapp_opt_out_at = CASE WHEN p_acao = 'opt_in' THEN NULL
                                 WHEN EXCLUDED.whatsapp_opt_out_at IS NOT NULL THEN EXCLUDED.whatsapp_opt_out_at
                                 ELSE public.comunicacao_preferencias.whatsapp_opt_out_at END,
    source = EXCLUDED.source,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_set_whatsapp_consent(uuid,uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_admin_set_whatsapp_consent(uuid,uuid,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_whatsapp_consent(uuid,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_set_whatsapp_consent(uuid,uuid,text,text,text) TO service_role;
