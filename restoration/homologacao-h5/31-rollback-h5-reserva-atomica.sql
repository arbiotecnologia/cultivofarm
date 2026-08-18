-- Rollback do kit H5 (30-h5-reserva-atomica-idempotente.sql).
-- Remove o motor de reserva em lote e restaura reservar_estoque_item sem o gate de papel.
-- Alvo EXCLUSIVO staging ikaauvsflpmamgxmkhoq.
\set ON_ERROR_STOP on

DO $guard$
DECLARE v_marker text; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: marcador ausente';
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO: rollback proibido em navfzbwgwzruipouyfnk';
  END IF;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: alvo nao autorizado';
  END IF;
END
$guard$;

BEGIN;

DROP FUNCTION IF EXISTS public.rpc_estoque_reservar_v1(uuid, text, jsonb, text, jsonb);

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
  PERFORM public.fn_estoque_ctx_open(jsonb_build_object('acao','reserva','origem','reservar_estoque_item','usuario_id',auth.uid()::text));
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade a reservar deve ser maior que zero.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_os_id IS NULL THEN
    RAISE EXCEPTION 'Reserva requer uma OS vinculada.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_item FROM public.estoque_produto WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque % não encontrado.', p_item_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_item.status::text <> 'disponivel' THEN
    RAISE EXCEPTION 'Item % não está disponível para reserva (status: %).', p_item_id, v_item.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_qty > COALESCE(v_item.quantidade, 0) THEN
    RAISE EXCEPTION 'Quantidade solicitada (%) excede o disponível (%) para esta embalagem.',
      p_qty, COALESCE(v_item.quantidade, 0) USING ERRCODE = 'check_violation';
  END IF;

  v_volume_reservado := CASE
    WHEN COALESCE(v_item.volume_total, 0) > 0 AND COALESCE(v_item.quantidade, 0) > 0
      THEN (p_qty * v_item.volume_total) / v_item.quantidade
    ELSE NULL END;

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
        ELSE volume_total END
    WHERE id = p_item_id;
  END IF;

  RETURN v_new_id;
END;
$function$;

COMMIT;
