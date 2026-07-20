
-- 1. Drop partner direct insert; only admin/gestor_comercial keep insert via RLS.
--    Partner inserts must go through SECURITY DEFINER RPC.
DROP POLICY IF EXISTS partner_orders_insert ON public.partner_orders;
CREATE POLICY partner_orders_insert ON public.partner_orders
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial'));

DROP POLICY IF EXISTS partner_order_items_insert ON public.partner_order_items;
CREATE POLICY partner_order_items_insert ON public.partner_order_items
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial'));

-- 2. Block partner direct read on partner_product_prices (only via RPC)
DROP POLICY IF EXISTS partner_product_prices_select ON public.partner_product_prices;
CREATE POLICY partner_product_prices_select ON public.partner_product_prices
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial'));

-- 3. Update RPC to use new initial status 'solicitado'
CREATE OR REPLACE FUNCTION public.create_partner_order_secure(p_partner_id uuid, p_observacoes text, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_user_partner uuid;
  v_order_id uuid;
  v_numero text;
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_desconto numeric(12,2) := 0;
  v_partner_desconto numeric(5,2);
  v_item jsonb;
  v_pid uuid;
  v_qty numeric(12,2);
  v_prod record;
  v_price record;
  v_preco_tabela numeric(12,2);
  v_desc numeric(5,2);
  v_preco_final numeric(12,2);
  v_line_subtotal numeric(12,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;

  v_is_admin := has_role(v_uid, 'administrador') OR has_role(v_uid, 'gestor_comercial');
  v_user_partner := public.get_user_partner_id();

  IF NOT v_is_admin THEN
    IF NOT has_role(v_uid, 'parceiro_b2b') OR v_user_partner IS NULL OR v_user_partner <> p_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  SELECT desconto_padrao INTO v_partner_desconto
    FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF v_partner_desconto IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  INSERT INTO public.partner_orders(partner_id, status, subtotal, desconto_total, total, observacoes, created_by)
  VALUES (p_partner_id, 'solicitado', 0, 0, 0, NULLIF(p_observacoes,''), v_uid)
  RETURNING id, numero INTO v_order_id, v_numero;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantidade')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty'; END IF;

    SELECT id, nome, codigo, valor_ha_brl, ativo INTO v_prod
      FROM public.produtos WHERE id = v_pid;
    IF NOT FOUND OR v_prod.ativo = false THEN RAISE EXCEPTION 'product_unavailable'; END IF;

    SELECT preco_tabela, desconto_percentual, preco_final INTO v_price
      FROM public.partner_product_prices
      WHERE partner_id = p_partner_id AND product_id = v_pid AND ativo = true;

    IF FOUND THEN
      v_preco_tabela := v_price.preco_tabela;
      v_desc := v_price.desconto_percentual;
      v_preco_final := COALESCE(v_price.preco_final, ROUND(v_preco_tabela * (1 - v_desc/100.0), 2));
    ELSE
      v_preco_tabela := COALESCE(v_prod.valor_ha_brl, 0);
      v_desc := COALESCE(v_partner_desconto, 0);
      v_preco_final := ROUND(v_preco_tabela * (1 - v_desc/100.0), 2);
    END IF;

    v_line_subtotal := ROUND(v_preco_final * v_qty, 2);
    v_subtotal := v_subtotal + ROUND(v_preco_tabela * v_qty, 2);
    v_total := v_total + v_line_subtotal;

    INSERT INTO public.partner_order_items(
      order_id, product_id, quantidade, preco_unitario, desconto_percentual, subtotal,
      produto_nome_snapshot, produto_codigo_snapshot,
      preco_tabela_snapshot, desconto_percentual_snapshot, preco_unitario_final_snapshot
    ) VALUES (
      v_order_id, v_pid, v_qty, v_preco_final, v_desc, v_line_subtotal,
      v_prod.nome, v_prod.codigo,
      v_preco_tabela, v_desc, v_preco_final
    );
  END LOOP;

  v_desconto := ROUND(v_subtotal - v_total, 2);
  UPDATE public.partner_orders
    SET subtotal = v_subtotal, desconto_total = v_desconto, total = v_total
    WHERE id = v_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_order_id, p_partner_id, v_uid, 'created_via_rpc',
          jsonb_build_object('numero', v_numero, 'total', v_total, 'items', jsonb_array_length(p_items)));

  RETURN jsonb_build_object('id', v_order_id, 'numero', v_numero, 'subtotal', v_subtotal, 'desconto_total', v_desconto, 'total', v_total);
END;
$function$;

-- 4. Catalog RPC — returns only partner-facing price
CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
RETURNS TABLE (
  product_id uuid,
  produto_nome text,
  produto_codigo text,
  preco_parceiro numeric,
  ativo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_user_partner uuid;
  v_partner_desconto numeric(5,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  v_is_admin := has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial');
  v_user_partner := public.get_user_partner_id();

  IF NOT v_is_admin AND (NOT has_role(v_uid,'parceiro_b2b') OR v_user_partner IS NULL OR v_user_partner <> p_partner_id) THEN
    RAISE EXCEPTION 'forbidden_partner';
  END IF;

  SELECT desconto_padrao INTO v_partner_desconto
    FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF v_partner_desconto IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    p.codigo,
    COALESCE(
      pp.preco_final,
      ROUND(COALESCE(pp.preco_tabela, p.valor_ha_brl, 0) * (1 - COALESCE(pp.desconto_percentual, v_partner_desconto, 0)/100.0), 2)
    )::numeric AS preco_parceiro,
    p.ativo
  FROM public.produtos p
  LEFT JOIN public.partner_product_prices pp
    ON pp.product_id = p.id AND pp.partner_id = p_partner_id AND pp.ativo = true
  WHERE p.ativo = true
  ORDER BY p.nome;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_partner_catalog_secure(uuid) TO authenticated;

-- 5. Order status update RPC (admin/gestor only) with audit
CREATE OR REPLACE FUNCTION public.update_partner_order_status(p_order_id uuid, p_status partner_order_status, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prev partner_order_status;
  v_pid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT status, partner_id INTO v_prev, v_pid FROM public.partner_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  UPDATE public.partner_orders SET status = p_status, updated_at = now() WHERE id = p_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'status_changed',
          jsonb_build_object('status', v_prev),
          jsonb_build_object('status', p_status, 'motivo', p_motivo));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_partner_order_status(uuid, partner_order_status, text) TO authenticated;
