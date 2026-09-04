CREATE OR REPLACE FUNCTION public.rpc_substituir_etiqueta_produto(p_etiqueta_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.produto_etiquetas%ROWTYPE;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatório para substituição (mínimo 5 caracteres)';
  END IF;

  SELECT * INTO v_old FROM public.produto_etiquetas WHERE id = p_etiqueta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etiqueta não encontrada'; END IF;
  IF v_old.status = 'cancelada' THEN RAISE EXCEPTION 'Etiqueta já cancelada'; END IF;
  IF v_old.substituida_por_id IS NOT NULL THEN RAISE EXCEPTION 'Etiqueta já substituída'; END IF;

  v_res := public.rpc_gerar_etiqueta_produto(jsonb_build_object(
    'lote_id', v_old.lote_id,
    'produto_id', v_old.produto_id,
    'envase_id', v_old.envase_id,
    'envase_item_id', v_old.envase_item_id,
    'estoque_item_id', v_old.estoque_item_id,
    'entrega_id', v_old.entrega_id,
    'entrega_item_id', v_old.entrega_item_id,
    'cliente_id', v_old.cliente_id,
    'fazenda_id', v_old.fazenda_id,
    'tipo_etiqueta', v_old.tipo_etiqueta,
    'volume', v_old.volume,
    'unidade', v_old.unidade,
    'quantidade_embalagens', v_old.quantidade_embalagens,
    'conservacao', v_old.conservacao,
    'uso_recomendado', v_old.uso_recomendado,
    'observacoes', v_old.observacoes,
    'substitui_etiqueta_id', v_old.id
  ));

  PERFORM public.rpc_cancelar_etiqueta_produto(p_etiqueta_id, 'Substituída: ' || trim(p_motivo));

  RETURN jsonb_build_object(
    'success', true,
    'etiqueta_anterior_id', p_etiqueta_id,
    'nova_etiqueta_id', v_res->>'etiqueta_id',
    'novo_codigo', v_res->>'codigo_etiqueta'
  );
END;
$function$

--ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

