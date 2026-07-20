CREATE OR REPLACE FUNCTION public.convert_partner_simulation_to_order_secure(p_simulation_id uuid, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_partner_b2b boolean;
  v_is_tecnico boolean;
  v_user_partner uuid;
  v_sim record;
  v_partner_id uuid;
  v_partner_desconto numeric(5,2);
  v_order_id uuid;
  v_numero text;
  v_item record;
  v_prod_row record;
  v_micro_row record;
  v_price record;
  v_nome text;
  v_codigo text;
  v_base numeric(12,2);
  v_dose_base numeric(12,2);
  v_preco_tabela numeric(12,2);
  v_desc numeric(5,2);
  v_preco_final numeric(12,2);
  v_line_subtotal numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_desconto_total numeric(12,2) := 0;
  v_items_count int := 0;
  v_qty numeric(12,2);
  v_unidade text := 'hectare';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  v_is_admin := has_role(v_uid, 'administrador') OR has_role(v_uid, 'gestor_comercial');
  v_is_partner_b2b := has_role(v_uid, 'parceiro_b2b');
  v_is_tecnico := has_role(v_uid, 'parceiro_b2b_tecnico');

  IF v_is_tecnico AND NOT v_is_admin AND NOT v_is_partner_b2b THEN
    RAISE EXCEPTION 'forbidden_role_tecnico_cannot_convert';
  END IF;
  IF NOT (v_is_admin OR v_is_partner_b2b) THEN
    RAISE EXCEPTION 'forbidden_role';
  END IF;

  SELECT * INTO v_sim FROM public.partner_simulations WHERE id = p_simulation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'simulation_not_found'; END IF;
  IF v_sim.status = 'convertida_pedido' THEN RAISE EXCEPTION 'already_converted'; END IF;
  IF v_sim.status NOT IN ('rascunho','enviada_gestor') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  v_partner_id := v_sim.partner_id;
  IF v_is_partner_b2b AND NOT v_is_admin THEN
    v_user_partner := get_user_partner_id();
    IF v_user_partner IS NULL OR v_user_partner <> v_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  SELECT COALESCE(desconto_padrao, 0) INTO v_partner_desconto
    FROM public.partner_accounts WHERE id = v_partner_id;

  INSERT INTO public.partner_orders(
    partner_id, cliente_id, status, origin_simulation_id,
    subtotal, desconto_total, total, observacoes, created_by
  ) VALUES (
    v_partner_id, v_sim.cliente_id, 'em_analise_comercial', p_simulation_id,
    0, 0, 0, COALESCE(p_observacoes, v_sim.observacoes), v_uid
  ) RETURNING id, numero INTO v_order_id, v_numero;

  FOR v_item IN SELECT * FROM public.partner_simulation_items WHERE simulation_id = p_simulation_id LOOP
    v_qty := v_item.quantidade;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty'; END IF;
    v_base := NULL; v_dose_base := NULL; v_price := NULL;

    IF v_item.item_tipo = 'produto' THEN
      SELECT id, nome, codigo, valor_ha_brl, valor_dose_brl, valor_litro_brl, dose_ml_ha,
             ativo, COALESCE(b2b_enabled, true) AS b2b_enabled
        INTO v_prod_row FROM public.produtos WHERE id = v_item.item_id;
      IF NOT FOUND OR v_prod_row.ativo = false OR v_prod_row.b2b_enabled = false THEN
        RAISE EXCEPTION 'product_unavailable';
      END IF;
      v_nome := v_prod_row.nome; v_codigo := v_prod_row.codigo;
      v_dose_base := COALESCE(NULLIF(v_prod_row.valor_dose_brl,0), NULLIF(v_prod_row.valor_litro_brl,0)/10.0);
      v_base := COALESCE(NULLIF(v_prod_row.valor_ha_brl,0),
        CASE WHEN v_prod_row.dose_ml_ha IS NOT NULL AND v_prod_row.dose_ml_ha > 0
             THEN (v_prod_row.dose_ml_ha/100.0) * v_dose_base END);
      SELECT preco_tabela, desconto_percentual, preco_final INTO v_price
        FROM public.partner_product_prices
        WHERE partner_id = v_partner_id AND product_id = v_item.item_id AND ativo = true;
    ELSIF v_item.item_tipo = 'microrganismo' THEN
      SELECT id, nome, codigo, valor_dose_brl, valor_litro_brl, dose_ml_ha,
             ativo, COALESCE(b2b_enabled, false) AS b2b_enabled
        INTO v_micro_row FROM public.microrganismos WHERE id = v_item.item_id;
      IF NOT FOUND OR v_micro_row.ativo = false OR v_micro_row.b2b_enabled = false THEN
        RAISE EXCEPTION 'product_unavailable';
      END IF;
      v_nome := v_micro_row.nome; v_codigo := v_micro_row.codigo;
      v_dose_base := COALESCE(NULLIF(v_micro_row.valor_dose_brl,0), NULLIF(v_micro_row.valor_litro_brl,0)/10.0);
      v_base := CASE WHEN v_micro_row.dose_ml_ha IS NOT NULL AND v_micro_row.dose_ml_ha > 0
                     THEN (v_micro_row.dose_ml_ha/100.0) * v_dose_base END;
      SELECT preco_tabela, desconto_percentual, preco_final INTO v_price
        FROM public.partner_product_prices
        WHERE partner_id = v_partner_id AND microrganismo_id = v_item.item_id AND ativo = true;
    ELSE
      RAISE EXCEPTION 'invalid_item_tipo';
    END IF;

    IF v_price.preco_tabela IS NOT NULL THEN
      v_preco_tabela := v_price.preco_tabela;
      v_desc := COALESCE(v_price.desconto_percentual, 0);
      v_preco_final := COALESCE(v_price.preco_final, ROUND(v_preco_tabela * (1 - v_desc/100.0), 2));
    ELSE
      IF v_base IS NULL OR v_base <= 0 THEN RAISE EXCEPTION 'price_unavailable'; END IF;
      v_preco_tabela := ROUND(v_base, 2);
      v_desc := COALESCE(v_partner_desconto, 0);
      v_preco_final := ROUND(v_preco_tabela * (1 - v_desc/100.0), 2);
    END IF;
    IF v_preco_final IS NULL OR v_preco_final <= 0 THEN RAISE EXCEPTION 'price_unavailable'; END IF;

    v_line_subtotal := ROUND(v_preco_final * v_qty, 2);
    v_subtotal := v_subtotal + ROUND(v_preco_tabela * v_qty, 2);
    v_total := v_total + v_line_subtotal;

    INSERT INTO public.partner_order_items(
      order_id, product_id, microrganismo_id, quantidade, preco_unitario,
      desconto_percentual, subtotal, unidade_medida,
      produto_nome_snapshot, produto_codigo_snapshot,
      preco_tabela_snapshot, desconto_percentual_snapshot, preco_unitario_final_snapshot
    ) VALUES (
      v_order_id,
      CASE WHEN v_item.item_tipo = 'produto' THEN v_item.item_id END,
      CASE WHEN v_item.item_tipo = 'microrganismo' THEN v_item.item_id END,
      v_qty, v_preco_final, v_desc, v_line_subtotal, v_unidade,
      COALESCE(v_nome, v_item.nome), v_codigo,
      v_preco_tabela, v_desc, v_preco_final
    );
    v_items_count := v_items_count + 1;
  END LOOP;

  IF v_items_count = 0 THEN RAISE EXCEPTION 'empty_simulation'; END IF;
  v_desconto_total := v_subtotal - v_total;

  UPDATE public.partner_orders
     SET subtotal = v_subtotal, desconto_total = v_desconto_total, total = v_total
   WHERE id = v_order_id;

  UPDATE public.partner_simulations
     SET status = 'convertida_pedido', converted_order_id = v_order_id,
         converted_by = v_uid, converted_at = now(), updated_at = now()
   WHERE id = p_simulation_id;

  INSERT INTO public.partner_order_audit_logs(
    order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos
  ) VALUES (
    v_order_id, v_partner_id, v_uid, 'converted_from_simulation', NULL,
    jsonb_build_object(
      'simulation_id', p_simulation_id,
      'numero', v_numero,
      'cliente_id', v_sim.cliente_id,
      'subtotal', v_subtotal,
      'desconto_total', v_desconto_total,
      'total', v_total,
      'items_count', v_items_count
    )
  );

  PERFORM public.insert_partner_catalog_access_log_internal(
    'simulation_converted_to_order',
    v_partner_id,
    v_uid,
    v_sim.cliente_id,
    p_simulation_id,
    v_order_id,
    NULL,
    jsonb_build_object(
      'subtotal', v_subtotal,
      'desconto_total', v_desconto_total,
      'total', v_total,
      'items_count', v_items_count
    )
  );

  RETURN v_order_id;
END;
$function$;