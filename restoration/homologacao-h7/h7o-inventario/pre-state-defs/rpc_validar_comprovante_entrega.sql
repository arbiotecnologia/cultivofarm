CREATE OR REPLACE FUNCTION public.rpc_validar_comprovante_entrega(p_validation_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comp public.entrega_comprovantes%ROWTYPE;
  v_msg text;
BEGIN
  SELECT * INTO v_comp FROM public.entrega_comprovantes WHERE validation_token = p_validation_token;
  IF NOT FOUND OR NOT v_comp.validation_public_enabled THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante não encontrado ou indisponível.');
  END IF;
  IF v_comp.validation_expires_at IS NOT NULL AND v_comp.validation_expires_at < now() THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante expirado.');
  END IF;
  IF v_comp.status IN ('cancelado','rejeitado') THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante cancelado.');
  END IF;

  v_msg := CASE v_comp.assinatura_tipo
    WHEN 'dispensada' THEN 'Comprovante registrado com dispensa formal de assinatura no sistema AR Bio.'
    WHEN 'digital_tela' THEN 'Comprovante registrado com assinatura digital operacional no sistema AR Bio.'
    WHEN 'fisica_anexada' THEN 'Comprovante registrado com formulário físico assinado no sistema AR Bio.'
    ELSE 'Comprovante de entrega registrado no sistema AR Bio.'
  END;

  RETURN jsonb_build_object(
    'valido', true,
    'status', v_comp.status,
    'assinatura_tipo', v_comp.assinatura_tipo,
    'possui_ressalvas', COALESCE(v_comp.possui_ressalvas, false),
    'numero_formulario', v_comp.numero_formulario,
    'data_confirmacao', v_comp.confirmado_em,
    'data_assinatura', v_comp.data_assinatura,
    'validation_hash', v_comp.validation_hash,
    'mensagem', v_msg
  );
END $function$

--ACL: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

