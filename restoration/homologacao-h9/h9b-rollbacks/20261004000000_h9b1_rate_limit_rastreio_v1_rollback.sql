-- ROLLBACK H9-B1 — restaura a definição vigente antes da correção (staging ikaauvsflpmamgxmkhoq)
BEGIN;
CREATE OR REPLACE FUNCTION public.rpc_validar_rastreio_produto(p_trace_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.produto_etiquetas%ROWTYPE;
  v_msg text;
  v_status text;
  v_hits integer;
  v_limite constant integer := 60;
BEGIN
  SELECT * INTO v_row FROM public.produto_etiquetas WHERE trace_token = p_trace_token;
  IF NOT FOUND THEN
    INSERT INTO public.produto_etiqueta_consultas(etiqueta_id, resultado) VALUES (NULL, 'nao_encontrada');
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Etiqueta não encontrada ou indisponível.');
  END IF;

  -- rate limit por etiqueta/hora
  SELECT count(*) INTO v_hits
  FROM public.produto_etiqueta_consultas
  WHERE etiqueta_id = v_row.id AND janela_hora = date_trunc('hour', now());

  IF v_hits >= v_limite THEN
    INSERT INTO public.produto_etiqueta_consultas(etiqueta_id, resultado) VALUES (v_row.id, 'rate_limited');
    RETURN jsonb_build_object('valido', false, 'status', 'rate_limited',
      'mensagem', 'Muitas consultas para esta etiqueta. Tente novamente mais tarde.');
  END IF;

  IF NOT v_row.public_trace_enabled THEN
    INSERT INTO public.produto_etiqueta_consultas(etiqueta_id, resultado) VALUES (v_row.id, 'revogada');
    RETURN jsonb_build_object('valido', false, 'status', 'revogada',
      'mensagem', 'Rastreio público desabilitado para esta etiqueta.');
  END IF;

  IF v_row.trace_expires_at IS NOT NULL AND v_row.trace_expires_at < now() THEN
    INSERT INTO public.produto_etiqueta_consultas(etiqueta_id, resultado) VALUES (v_row.id, 'expirada');
    RETURN jsonb_build_object('valido', false, 'status', 'expirado', 'mensagem', 'Rastreio expirado.');
  END IF;

  IF v_row.status = 'cancelada' THEN
    v_status := CASE WHEN v_row.substituida_por_id IS NOT NULL THEN 'substituida' ELSE 'cancelada' END;
    v_msg := CASE WHEN v_row.substituida_por_id IS NOT NULL
                  THEN 'Etiqueta substituída por nova emissão. Confirme com a AR Bio.'
                  ELSE 'Etiqueta cancelada ou substituída. Confirme com a AR Bio.' END;
  ELSIF v_row.validade_em IS NOT NULL AND v_row.validade_em < CURRENT_DATE THEN
    v_status := 'vencido';
    v_msg := 'Produto com validade expirada. Confirme condições com a AR Bio.';
  ELSE
    v_status := 'ativo';
    v_msg := 'Produto registrado no sistema AR Bio.';
  END IF;

  INSERT INTO public.produto_etiqueta_consultas(etiqueta_id, resultado) VALUES (v_row.id, v_status);

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, descricao, metadata)
    VALUES (v_row.id, 'qr_validado', 'Validação pública via QR Code', jsonb_build_object('status', v_status));

  IF v_status IN ('cancelada','substituida') THEN
    RETURN jsonb_build_object('valido', false, 'status', v_status, 'mensagem', v_msg,
                              'codigo_etiqueta', v_row.codigo_etiqueta);
  END IF;

  RETURN jsonb_build_object(
    'valido', true,
    'status', v_status,
    'codigo_etiqueta', v_row.codigo_etiqueta,
    'produto_nome', v_row.produto_nome,
    'lote_codigo', v_row.lote_codigo,
    'fabricado_em', v_row.fabricado_em,
    'validade_em', v_row.validade_em,
    'volume', v_row.volume,
    'unidade', v_row.unidade,
    'tipo_etiqueta', v_row.tipo_etiqueta,
    'mensagem', v_msg
  );
END;
$function$

COMMIT;
