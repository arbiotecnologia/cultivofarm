CREATE OR REPLACE FUNCTION public.fn_resolve_b2b_cart(p_partner_id uuid, p_plan_id uuid, p_items jsonb, p_ref_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb; v_iid uuid; v_itipo text; v_qty numeric(12,2);
  v_unidade text; v_volume_ml numeric(12,2);
  v_nome text; v_codigo text; v_res jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_table numeric(14,2) := 0; v_net numeric(14,2) := 0;
  v_quote boolean := false;
  v_line_table numeric(14,2); v_line_final numeric(14,2);
  v_ok boolean; v_active boolean; v_b2b boolean;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart' USING ERRCODE='P0001';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_iid     := COALESCE(NULLIF(v_item->>'item_id','')::uuid, NULLIF(v_item->>'product_id','')::uuid);
    v_itipo   := COALESCE(NULLIF(v_item->>'item_tipo',''), 'produto');
    v_qty     := COALESCE((v_item->>'quantidade')::numeric, 0);
    v_unidade := COALESCE(NULLIF(v_item->>'unidade_medida',''), 'hectare');
    v_volume_ml := NULLIF((v_item->>'volume_ml')::numeric, 0);

    IF v_iid IS NULL THEN RAISE EXCEPTION 'invalid_item' USING ERRCODE='P0001'; END IF;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty' USING ERRCODE='P0001'; END IF;
    IF v_unidade NOT IN ('hectare','litro','dose','unidade') THEN
      RAISE EXCEPTION 'invalid_unidade_medida' USING ERRCODE='P0001'; END IF;
    IF v_unidade = 'unidade' AND COALESCE(v_volume_ml,0) <= 0 THEN
      RAISE EXCEPTION 'invalid_volume_ml' USING ERRCODE='P0001'; END IF;

    IF v_itipo = 'produto' THEN
      SELECT nome, codigo, ativo, COALESCE(b2b_enabled,true) INTO v_nome, v_codigo, v_active, v_b2b
        FROM public.produtos WHERE id = v_iid;
    ELSIF v_itipo = 'microrganismo' THEN
      SELECT nome, codigo, ativo, COALESCE(b2b_enabled,false) INTO v_nome, v_codigo, v_active, v_b2b
        FROM public.microrganismos WHERE id = v_iid;
    ELSE
      RAISE EXCEPTION 'invalid_item_tipo' USING ERRCODE='P0001';
    END IF;
    IF v_nome IS NULL OR v_active IS NOT TRUE OR v_b2b IS NOT TRUE THEN
      RAISE EXCEPTION 'product_unavailable' USING ERRCODE='P0001';
    END IF;

    v_res := public.fn_resolve_commercial_price(
      'partner', p_partner_id, NULL, p_plan_id,
      CASE WHEN v_itipo='produto' THEN v_iid END,
      CASE WHEN v_itipo='microrganismo' THEN v_iid END,
      v_unidade, v_volume_ml, COALESCE(p_ref_date, current_date), v_qty);

    v_ok := COALESCE((v_res->>'ok')::boolean,false);

    IF COALESCE((v_res->>'quote_required')::boolean,false) THEN
      v_quote := true;
      v_line_table := 0; v_line_final := 0;
    ELSIF NOT v_ok THEN
      RAISE EXCEPTION '%', v_res->>'reason_code' USING ERRCODE='P0001';
    ELSE
      v_line_table := ROUND((v_res->>'base_price')::numeric * v_qty, 2);
      v_line_final := ROUND((v_res->>'final_unit_price')::numeric * v_qty, 2);
      v_table := v_table + v_line_table;
      v_net   := v_net + v_line_final;
    END IF;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'item_id', v_iid, 'item_tipo', v_itipo, 'quantidade', v_qty,
      'unidade_medida', v_unidade, 'volume_ml', v_volume_ml,
      'nome', v_nome, 'codigo', v_codigo,
      'pricing_mode', v_res->>'pricing_mode',
      'price_source', v_res->>'price_source',
      'reason_code',  v_res->>'reason_code',
      'quote_required', COALESCE((v_res->>'quote_required')::boolean,false),
      'base_price', (v_res->>'base_price')::numeric,
      'condition_price', (v_res->>'condition_price')::numeric,
      'plan_discount_percent', (v_res->>'plan_discount_percent')::numeric,
      'min_quantity', (v_res->>'min_quantity')::numeric,
      'final_unit_price', (v_res->>'final_unit_price')::numeric,
      'rule_id', v_res->>'rule_id',
      'line_table_amount', v_line_table,
      'line_final_amount', v_line_final
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'quote_required', v_quote,
    'table_amount', CASE WHEN v_quote THEN 0 ELSE v_table END,
    'discount_amount', CASE WHEN v_quote THEN 0 ELSE ROUND(v_table - v_net,2) END,
    'net_amount', CASE WHEN v_quote THEN 0 ELSE v_net END,
    'lines', v_lines);
END $function$;
