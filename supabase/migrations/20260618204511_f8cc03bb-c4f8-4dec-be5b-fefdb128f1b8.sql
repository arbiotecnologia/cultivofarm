
-- 1) microrganismos: novas colunas
ALTER TABLE public.microrganismos
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS b2b_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS preco_tabela numeric(12,2);

CREATE UNIQUE INDEX IF NOT EXISTS microrganismos_codigo_uniq
  ON public.microrganismos(codigo) WHERE codigo IS NOT NULL;

-- 2) partner_product_prices: aceitar microrganismo_id
ALTER TABLE public.partner_product_prices
  ADD COLUMN IF NOT EXISTS microrganismo_id uuid REFERENCES public.microrganismos(id) ON DELETE CASCADE,
  ALTER COLUMN product_id DROP NOT NULL;

-- Substituir unique constraint antiga por índices parciais (um por tipo)
ALTER TABLE public.partner_product_prices
  DROP CONSTRAINT IF EXISTS partner_product_prices_partner_product_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS ppp_partner_product_uniq
  ON public.partner_product_prices(partner_id, product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ppp_partner_microrganismo_uniq
  ON public.partner_product_prices(partner_id, microrganismo_id) WHERE microrganismo_id IS NOT NULL;

-- CHECK: exatamente um dos dois
ALTER TABLE public.partner_product_prices
  DROP CONSTRAINT IF EXISTS ppp_item_xor;
ALTER TABLE public.partner_product_prices
  ADD CONSTRAINT ppp_item_xor CHECK (
    (product_id IS NOT NULL AND microrganismo_id IS NULL) OR
    (product_id IS NULL AND microrganismo_id IS NOT NULL)
  );

-- 3) partner_order_items: aceitar microrganismo_id
ALTER TABLE public.partner_order_items
  ADD COLUMN IF NOT EXISTS microrganismo_id uuid REFERENCES public.microrganismos(id),
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.partner_order_items
  DROP CONSTRAINT IF EXISTS poi_item_xor;
ALTER TABLE public.partner_order_items
  ADD CONSTRAINT poi_item_xor CHECK (
    (product_id IS NOT NULL AND microrganismo_id IS NULL) OR
    (product_id IS NULL AND microrganismo_id IS NOT NULL)
  );

-- 4) RPC create_partner_order_secure: aceitar item_tipo + item_id
CREATE OR REPLACE FUNCTION public.create_partner_order_secure(
  p_partner_id uuid,
  p_observacoes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_requested_delivery_date date DEFAULT NULL,
  p_partner_notes text DEFAULT NULL
)
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
  v_iid uuid;
  v_itipo text;
  v_qty numeric(12,2);
  v_nome text;
  v_codigo text;
  v_base numeric(12,2);
  v_price record;
  v_preco_tabela numeric(12,2);
  v_desc numeric(5,2);
  v_preco_final numeric(12,2);
  v_line_subtotal numeric(12,2);
  v_admin record;
  v_prod_row record;
  v_micro_row record;
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
    v_iid := COALESCE((v_item->>'item_id')::uuid, (v_item->>'product_id')::uuid);
    v_itipo := COALESCE(v_item->>'item_tipo', 'produto');
    v_qty := COALESCE((v_item->>'quantidade')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty'; END IF;

    IF v_itipo = 'produto' THEN
      SELECT id, nome, codigo, valor_ha_brl, ativo, COALESCE(b2b_enabled, true) AS b2b_enabled
        INTO v_prod_row FROM public.produtos WHERE id = v_iid;
      IF NOT FOUND OR v_prod_row.ativo = false OR v_prod_row.b2b_enabled = false THEN
        RAISE EXCEPTION 'product_unavailable';
      END IF;
      v_nome := v_prod_row.nome;
      v_codigo := v_prod_row.codigo;
      v_base := COALESCE(v_prod_row.valor_ha_brl, 0);

      SELECT preco_tabela, desconto_percentual, preco_final INTO v_price
        FROM public.partner_product_prices
        WHERE partner_id = p_partner_id AND product_id = v_iid AND ativo = true;

    ELSIF v_itipo = 'microrganismo' THEN
      SELECT id, nome, codigo, preco_tabela, ativo, COALESCE(b2b_enabled, false) AS b2b_enabled
        INTO v_micro_row FROM public.microrganismos WHERE id = v_iid;
      IF NOT FOUND OR v_micro_row.ativo = false OR v_micro_row.b2b_enabled = false THEN
        RAISE EXCEPTION 'product_unavailable';
      END IF;
      v_nome := v_micro_row.nome;
      v_codigo := v_micro_row.codigo;
      v_base := COALESCE(v_micro_row.preco_tabela, 0);

      SELECT preco_tabela, desconto_percentual, preco_final INTO v_price
        FROM public.partner_product_prices
        WHERE partner_id = p_partner_id AND microrganismo_id = v_iid AND ativo = true;
    ELSE
      RAISE EXCEPTION 'invalid_item_tipo';
    END IF;

    IF v_price.preco_tabela IS NOT NULL THEN
      v_preco_tabela := v_price.preco_tabela;
      v_desc := COALESCE(v_price.desconto_percentual, 0);
      v_preco_final := COALESCE(v_price.preco_final, ROUND(v_preco_tabela * (1 - v_desc/100.0), 2));
    ELSE
      v_preco_tabela := v_base;
      v_desc := COALESCE(v_partner_desconto, 0);
      v_preco_final := ROUND(v_preco_tabela * (1 - v_desc/100.0), 2);
    END IF;

    IF v_preco_final IS NULL OR v_preco_final <= 0 THEN
      RAISE EXCEPTION 'price_unavailable';
    END IF;

    v_line_subtotal := ROUND(v_preco_final * v_qty, 2);
    v_subtotal := v_subtotal + ROUND(v_preco_tabela * v_qty, 2);
    v_total := v_total + v_line_subtotal;

    INSERT INTO public.partner_order_items(
      order_id, product_id, microrganismo_id, quantidade, preco_unitario,
      desconto_percentual, subtotal,
      produto_nome_snapshot, produto_codigo_snapshot,
      preco_tabela_snapshot, desconto_percentual_snapshot, preco_unitario_final_snapshot
    ) VALUES (
      v_order_id,
      CASE WHEN v_itipo='produto' THEN v_iid END,
      CASE WHEN v_itipo='microrganismo' THEN v_iid END,
      v_qty, v_preco_final, v_desc, v_line_subtotal,
      v_nome, v_codigo,
      v_preco_tabela, v_desc, v_preco_final
    );

    v_price := NULL;
  END LOOP;

  v_desconto := ROUND(v_subtotal - v_total, 2);
  UPDATE public.partner_orders
    SET subtotal = v_subtotal, desconto_total = v_desconto, total = v_total
    WHERE id = v_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_order_id, p_partner_id, v_uid, 'created_via_rpc',
          jsonb_build_object('numero', v_numero, 'total', v_total, 'items', jsonb_array_length(p_items),
                             'requested_delivery_date', p_requested_delivery_date));

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
$function$;

GRANT EXECUTE ON FUNCTION public.create_partner_order_secure(uuid, text, jsonb, date, text) TO authenticated;
