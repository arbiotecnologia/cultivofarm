-- H5 — Reserva de estoque atômica, idempotente e fail-closed (resolve H1-013)
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq. Produção navfzbwgwzruipouyfnk NÃO autorizada.
-- Reversível: 31-rollback-h5-reserva-atomica.sql
\set ON_ERROR_STOP on

DO $guard$
DECLARE v_marker text; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: marcador de staging ausente';
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO: aplicação proibida em navfzbwgwzruipouyfnk';
  END IF;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: alvo não autorizado';
  END IF;
END
$guard$;

BEGIN;

-- 1) reservar_estoque_item: autorização fail-closed por papel operacional.
--    Corpo original preservado integralmente; apenas o gate de papel foi acrescentado.
CREATE OR REPLACE FUNCTION public.reservar_estoque_item(
  p_item_id uuid, p_qty numeric, p_os_id uuid, p_os_tipo text,
  p_cliente_id uuid DEFAULT NULL::uuid, p_partner_id uuid DEFAULT NULL::uuid,
  p_partner_order_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item public.estoque_produto%ROWTYPE;
  v_volume_reservado numeric;
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.fn_estoque_pode_operar(auth.uid(), 'reserva') THEN
    RAISE EXCEPTION 'ESTQ_SEM_PERMISSAO: perfil sem permissão para reservar estoque'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.fn_estoque_ctx_open(jsonb_build_object('acao','reserva','origem','reservar_estoque_item','usuario_id',auth.uid()::text));
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade a reservar deve ser maior que zero.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_os_id IS NULL THEN
    RAISE EXCEPTION 'Reserva requer uma OS vinculada.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_item
  FROM public.estoque_produto
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque % não encontrado.', p_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_item.status::text <> 'disponivel' THEN
    RAISE EXCEPTION 'Item % não está disponível para reserva (status: %).', p_item_id, v_item.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_qty > COALESCE(v_item.quantidade, 0) THEN
    RAISE EXCEPTION 'Quantidade solicitada (%) excede o disponível (%) para esta embalagem.',
      p_qty, COALESCE(v_item.quantidade, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  v_volume_reservado := CASE
    WHEN COALESCE(v_item.volume_total, 0) > 0 AND COALESCE(v_item.quantidade, 0) > 0
      THEN (p_qty * v_item.volume_total) / v_item.quantidade
    ELSE NULL
  END;

  IF p_qty = v_item.quantidade THEN
    UPDATE public.estoque_produto SET
      status = 'reservado',
      reservado_para_os_id = p_os_id,
      reservado_para_os_tipo = p_os_tipo,
      reservado_para_cliente_id = CASE WHEN p_os_tipo = 'b2b' THEN NULL ELSE p_cliente_id END,
      reservado_para_partner_id = CASE WHEN p_os_tipo = 'b2b' THEN p_partner_id ELSE NULL END,
      reservado_para_partner_order_id = CASE WHEN p_os_tipo = 'b2b' THEN p_partner_order_id ELSE NULL END,
      quantidade_reservada = p_qty,
      observacao_reserva = p_observacao
    WHERE id = p_item_id;
    v_new_id := p_item_id;
  ELSE
    INSERT INTO public.estoque_produto (
      produto_id, lote_id, microrganismo_id, envase_id,
      quantidade, volume_total, validade, status,
      reservado_para_os_id, reservado_para_os_tipo,
      reservado_para_cliente_id, reservado_para_partner_id, reservado_para_partner_order_id,
      quantidade_reservada, observacao_reserva
    ) VALUES (
      v_item.produto_id, v_item.lote_id, v_item.microrganismo_id, v_item.envase_id,
      p_qty, v_volume_reservado, v_item.validade, 'reservado',
      p_os_id, p_os_tipo,
      CASE WHEN p_os_tipo = 'b2b' THEN NULL ELSE p_cliente_id END,
      CASE WHEN p_os_tipo = 'b2b' THEN p_partner_id ELSE NULL END,
      CASE WHEN p_os_tipo = 'b2b' THEN p_partner_order_id ELSE NULL END,
      p_qty, p_observacao
    ) RETURNING id INTO v_new_id;

    UPDATE public.estoque_produto SET
      quantidade = v_item.quantidade - p_qty,
      volume_total = CASE
        WHEN COALESCE(v_item.volume_total, 0) > 0 THEN v_item.volume_total - v_volume_reservado
        ELSE volume_total
      END
    WHERE id = p_item_id;
  END IF;

  RETURN v_new_id;
END;
$function$;

-- 2) Motor de reserva em lote: transação única, idempotente por chave e serializado
--    por OS. Substitui o laço client-side do ReservarEstoqueDialog (H1-013).
CREATE OR REPLACE FUNCTION public.rpc_estoque_reservar_v1(
  p_os_id uuid,
  p_origem text,
  p_itens jsonb,
  p_idempotency_key text,
  p_dados jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_new uuid;
  v_qtd numeric;
  v_ref_tipo text;
  v_ref_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.fn_estoque_pode_operar(v_uid, 'reserva') THEN
    RAISE EXCEPTION 'ESTQ_SEM_PERMISSAO: perfil sem permissão para reservar estoque'
      USING ERRCODE = '42501';
  END IF;
  IF p_os_id IS NULL THEN
    RAISE EXCEPTION 'ESTQ_OS_OBRIGATORIA: reserva requer uma OS vinculada'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'ESTQ_IDEMPOTENCY_OBRIGATORIA: informe uma chave de idempotência'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'ESTQ_ITENS_VAZIOS: selecione ao menos uma embalagem'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('estoque_reserva:' || p_idempotency_key));

  -- Replay determinístico: a mesma chave nunca gera segunda movimentação.
  SELECT array_agg(DISTINCT estoque_produto_id) INTO v_ids
    FROM public.estoque_movimentacoes
   WHERE idempotency_key = p_idempotency_key
      OR idempotency_key LIKE p_idempotency_key || '#%';
  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    RETURN jsonb_build_object('ok', true, 'replay', true, 'itens', to_jsonb(v_ids));
  END IF;
  v_ids := ARRAY[]::uuid[];

  PERFORM pg_advisory_xact_lock(hashtext('estoque_reserva_os:' || p_os_id::text));

  IF p_origem = 'b2b' THEN
    v_ref_tipo := 'partner_order';
    v_ref_id := NULLIF(p_dados->>'partner_order_id','')::uuid;
  ELSIF p_origem = 'onfarm' THEN
    v_ref_tipo := 'ordem_servico_onfarm';
    v_ref_id := p_os_id;
  ELSE
    v_ref_tipo := 'ordem_servico';
    v_ref_id := p_os_id;
  END IF;

  PERFORM public.fn_estoque_ctx_open(jsonb_build_object(
    'acao','reserva',
    'origem','rpc_estoque_reservar_v1',
    'usuario_id', v_uid::text,
    'idempotency_key', p_idempotency_key,
    'referencia_tipo', v_ref_tipo,
    'referencia_id', v_ref_id,
    'motivo', NULLIF(p_dados->>'observacao',''),
    'metadata', jsonb_build_object('os_id', p_os_id, 'origem_os', p_origem)
  ));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := (v_item->>'quantidade')::numeric;
    v_new := public.reservar_estoque_item(
      (v_item->>'item_id')::uuid,
      v_qtd,
      p_os_id,
      p_origem,
      NULLIF(p_dados->>'cliente_id','')::uuid,
      NULLIF(p_dados->>'partner_id','')::uuid,
      NULLIF(p_dados->>'partner_order_id','')::uuid,
      NULLIF(p_dados->>'observacao','')
    );
    v_ids := v_ids || v_new;
  END LOOP;

  PERFORM public.fn_estoque_ctx_close();

  RETURN jsonb_build_object('ok', true, 'replay', false, 'itens', to_jsonb(v_ids));
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_estoque_reservar_v1(uuid, text, jsonb, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_estoque_reservar_v1(uuid, text, jsonb, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_estoque_reservar_v1(uuid, text, jsonb, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_estoque_reservar_v1(uuid, text, jsonb, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.reservar_estoque_item(uuid, numeric, uuid, text, uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reservar_estoque_item(uuid, numeric, uuid, text, uuid, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_item(uuid, numeric, uuid, text, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_estoque_item(uuid, numeric, uuid, text, uuid, uuid, uuid, text) TO service_role;

COMMIT;
