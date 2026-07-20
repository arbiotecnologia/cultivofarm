
-- =========================================================
-- Updated catalog RPC: filter b2b_enabled, include descricao_curta
-- =========================================================
DROP FUNCTION IF EXISTS public.get_partner_catalog_secure(uuid);
CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
RETURNS TABLE(product_id uuid, produto_nome text, produto_codigo text, descricao_curta text, preco_parceiro numeric, ativo boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
    p.id, p.nome, p.codigo,
    LEFT(COALESCE(p.descricao, ''), 160) AS descricao_curta,
    COALESCE(
      pp.preco_final,
      ROUND(COALESCE(pp.preco_tabela, p.valor_ha_brl, 0) * (1 - COALESCE(pp.desconto_percentual, v_partner_desconto, 0)/100.0), 2)
    )::numeric AS preco_parceiro,
    p.ativo
  FROM public.produtos p
  LEFT JOIN public.partner_product_prices pp
    ON pp.product_id = p.id AND pp.partner_id = p_partner_id AND pp.ativo = true
  WHERE p.ativo = true AND COALESCE(p.b2b_enabled, true) = true
  ORDER BY p.nome;
END;
$$;

-- =========================================================
-- Updated create_partner_order_secure: accept dates + partner_notes, status = em_analise_comercial
-- =========================================================
DROP FUNCTION IF EXISTS public.create_partner_order_secure(uuid, text, jsonb);
CREATE OR REPLACE FUNCTION public.create_partner_order_secure(
  p_partner_id uuid,
  p_observacoes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_requested_delivery_date date DEFAULT NULL,
  p_partner_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  v_admin record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;

  v_is_admin := has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial');
  v_user_partner := public.get_user_partner_id();
  IF NOT v_is_admin THEN
    IF NOT has_role(v_uid,'parceiro_b2b') OR v_user_partner IS NULL OR v_user_partner <> p_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  SELECT desconto_padrao INTO v_partner_desconto
    FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF v_partner_desconto IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  INSERT INTO public.partner_orders(
    partner_id, status, subtotal, desconto_total, total, observacoes, created_by,
    requested_delivery_date, partner_notes, ready_for_production
  )
  VALUES (
    p_partner_id, 'em_analise_comercial', 0, 0, 0, NULLIF(p_observacoes,''), v_uid,
    p_requested_delivery_date, NULLIF(p_partner_notes,''), false
  )
  RETURNING id, numero INTO v_order_id, v_numero;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantidade')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty'; END IF;

    SELECT id, nome, codigo, valor_ha_brl, ativo, COALESCE(b2b_enabled, true) AS b2b_enabled
      INTO v_prod FROM public.produtos WHERE id = v_pid;
    IF NOT FOUND OR v_prod.ativo = false OR v_prod.b2b_enabled = false THEN
      RAISE EXCEPTION 'product_unavailable';
    END IF;

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
          jsonb_build_object('numero', v_numero, 'total', v_total, 'items', jsonb_array_length(p_items),
                             'requested_delivery_date', p_requested_delivery_date));

  -- Notify admins/gestores comerciais
  FOR v_admin IN
    SELECT DISTINCT ur.user_id
      FROM public.user_roles ur
     WHERE ur.role IN ('administrador','gestor_comercial')
  LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_admin.user_id, 'pedido_b2b_novo',
            'Novo pedido B2B ' || v_numero,
            'Novo pedido B2B aguardando análise comercial. Total: R$ ' || to_char(v_total,'FM999G999G990D00'),
            '/comercial/pedidos-b2b');
  END LOOP;

  RETURN jsonb_build_object('id', v_order_id, 'numero', v_numero, 'subtotal', v_subtotal, 'desconto_total', v_desconto, 'total', v_total);
END;
$$;

-- =========================================================
-- Approve / Reject / Set delivery date / Update notes RPCs
-- =========================================================
CREATE OR REPLACE FUNCTION public.approve_partner_order(
  p_order_id uuid,
  p_approval_notes text DEFAULT NULL,
  p_estimated_delivery_date date DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid; v_prev partner_order_status; v_partner_user uuid; v_numero text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT partner_id, status, numero INTO v_pid, v_prev, v_numero
    FROM public.partner_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_prev NOT IN ('em_analise_comercial','solicitado','rascunho') THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;

  UPDATE public.partner_orders
     SET status = 'aprovado',
         approved_by = v_uid,
         approved_at = now(),
         approval_notes = NULLIF(p_approval_notes,''),
         estimated_delivery_date = COALESCE(p_estimated_delivery_date, estimated_delivery_date),
         ready_for_production = true,
         updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'approved',
          jsonb_build_object('status', v_prev),
          jsonb_build_object('status','aprovado','approval_notes',p_approval_notes,'estimated_delivery_date',p_estimated_delivery_date));

  FOR v_partner_user IN SELECT user_id FROM public.partner_users WHERE partner_id = v_pid LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user, 'pedido_b2b_aprovado',
            'Pedido ' || v_numero || ' aprovado',
            'Seu pedido foi aprovado e seguirá para planejamento de produção.',
            '/portal-parceiro/pedidos');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_partner_order(
  p_order_id uuid,
  p_approval_notes text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid; v_prev partner_order_status; v_partner_user uuid; v_numero text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_approval_notes IS NULL OR length(trim(p_approval_notes)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  SELECT partner_id, status, numero INTO v_pid, v_prev, v_numero
    FROM public.partner_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  UPDATE public.partner_orders
     SET status = 'reprovado',
         approved_by = v_uid,
         approved_at = now(),
         approval_notes = p_approval_notes,
         ready_for_production = false,
         updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'rejected',
          jsonb_build_object('status', v_prev),
          jsonb_build_object('status','reprovado','approval_notes',p_approval_notes));

  FOR v_partner_user IN SELECT user_id FROM public.partner_users WHERE partner_id = v_pid LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user, 'pedido_b2b_reprovado',
            'Pedido ' || v_numero || ' necessita revisão',
            'Seu pedido necessita revisão comercial. Motivo: ' || p_approval_notes,
            '/portal-parceiro/pedidos');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_partner_order_delivery_date(
  p_order_id uuid,
  p_estimated_delivery_date date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid; v_prev date; v_partner_user uuid; v_numero text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT partner_id, estimated_delivery_date, numero INTO v_pid, v_prev, v_numero
    FROM public.partner_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  UPDATE public.partner_orders
     SET estimated_delivery_date = p_estimated_delivery_date, updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'delivery_date_changed',
          jsonb_build_object('estimated_delivery_date', v_prev),
          jsonb_build_object('estimated_delivery_date', p_estimated_delivery_date));

  FOR v_partner_user IN SELECT user_id FROM public.partner_users WHERE partner_id = v_pid LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user, 'pedido_b2b_previsao',
            'Previsão de entrega atualizada — ' || v_numero,
            'A previsão de entrega do pedido foi atualizada para ' || to_char(p_estimated_delivery_date,'DD/MM/YYYY'),
            '/portal-parceiro/pedidos');
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_partner_order_notes(
  p_order_id uuid,
  p_commercial_notes text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid; v_prev text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT partner_id, commercial_notes INTO v_pid, v_prev
    FROM public.partner_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  UPDATE public.partner_orders
     SET commercial_notes = NULLIF(p_commercial_notes,''), updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'commercial_notes_updated',
          jsonb_build_object('commercial_notes', v_prev),
          jsonb_build_object('commercial_notes', p_commercial_notes));
END;
$$;
