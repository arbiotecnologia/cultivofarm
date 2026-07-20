-- FASE 18D.2: corrige get_partner_catalog_secure, create_partner_order_secure e RLS de catalogo_volumes

-- 1) get_partner_catalog_secure: unidade_preco_principal = dose_100ml para microrganismo;
--    aplica desconto nos 3 valores; preenche valor_litro/dose por fallback; calcula valor_ha do microrganismo.
CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
RETURNS TABLE(
  item_id uuid, item_tipo text, product_id uuid, produto_nome text, produto_codigo text,
  descricao_curta text, preco_tabela numeric, desconto_percentual numeric, preco_parceiro numeric,
  produto_ativo boolean, resumo_curto text, explicacao_b2b text, beneficios_principais text,
  ficha_status text, ficha_aprovada boolean,
  valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric,
  unidade_preco_principal text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_user_partner uuid;
  v_d numeric(5,2);
  v_f numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  v_is_admin := has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial');
  v_user_partner := public.get_user_partner_id();
  IF NOT v_is_admin AND (NOT has_role(v_uid,'parceiro_b2b') OR v_user_partner IS NULL OR v_user_partner <> p_partner_id) THEN
    RAISE EXCEPTION 'forbidden_partner';
  END IF;
  SELECT pa.desconto_padrao INTO v_d
    FROM public.partner_accounts pa WHERE pa.id = p_partner_id AND pa.ativo = true;
  IF v_d IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;
  v_f := 1 - v_d/100.0;

  RETURN QUERY
  WITH prod AS (
    SELECT
      p.id, p.nome, p.codigo, p.ativo,
      ROUND(COALESCE(p.valor_ha_brl, 0)::numeric * v_f, 2) AS v_ha,
      ROUND(COALESCE(
        NULLIF(p.valor_dose_brl, 0),
        NULLIF(p.valor_litro_brl, 0) / 10.0,
        0
      )::numeric * v_f, 2) AS v_dose,
      ROUND(COALESCE(
        NULLIF(p.valor_litro_brl, 0),
        NULLIF(p.valor_dose_brl, 0) * 10.0,
        0
      )::numeric * v_f, 2) AS v_litro,
      ptp.status_validacao, ptp.resumo_curto, ptp.explicacao_b2b, ptp.beneficio_combinado
    FROM public.produtos p
    LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
    WHERE p.ativo = true AND COALESCE(p.b2b_enabled, true) = true
  )
  SELECT
    pr.id, 'produto'::text, pr.id, pr.nome, pr.codigo,
    CASE WHEN pr.status_validacao = 'aprovado' THEN LEFT(COALESCE(pr.resumo_curto, ''), 220) END,
    pr.v_ha, v_d, pr.v_ha, pr.ativo,
    CASE WHEN pr.status_validacao = 'aprovado' THEN pr.resumo_curto END,
    CASE WHEN pr.status_validacao = 'aprovado' THEN pr.explicacao_b2b END,
    CASE WHEN pr.status_validacao = 'aprovado' THEN pr.beneficio_combinado END,
    COALESCE(pr.status_validacao, 'sem_ficha'),
    (pr.status_validacao = 'aprovado'),
    pr.v_dose, pr.v_litro, pr.v_ha, 'hectare'::text
  FROM prod pr
  UNION ALL
  SELECT
    m.id, 'microrganismo'::text, NULL::uuid, m.nome, m.codigo,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN LEFT(COALESCE(mtp.resumo_curto, ''), 220) END,
    ROUND(COALESCE(m.valor_dose_brl, 0)::numeric * v_f, 2),
    v_d,
    ROUND(COALESCE(m.valor_dose_brl, 0)::numeric * v_f, 2),
    m.ativo,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.resumo_curto END,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.explicacao_b2b END,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.beneficios_agronomicos END,
    COALESCE(mtp.status_validacao, 'sem_ficha'),
    (mtp.status_validacao = 'aprovado'),
    ROUND(COALESCE(
      NULLIF(m.valor_dose_brl, 0),
      NULLIF(m.valor_litro_brl, 0) / 10.0,
      0
    )::numeric * v_f, 2),
    ROUND(COALESCE(
      NULLIF(m.valor_litro_brl, 0),
      NULLIF(m.valor_dose_brl, 0) * 10.0,
      0
    )::numeric * v_f, 2),
    CASE WHEN m.dose_ml_ha IS NOT NULL AND m.dose_ml_ha > 0
         THEN ROUND((m.dose_ml_ha / 100.0) * (COALESCE(m.valor_dose_brl, 0) * v_f), 2)
         ELSE NULL END,
    'dose_100ml'::text
  FROM public.microrganismos m
  LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
  WHERE m.ativo = true AND m.b2b_enabled = true;
END;
$function$;

-- 2) create_partner_order_secure: aceita unidade_medida no JSON, valida, grava no item,
--    usa preço por hectare (produto) ou por dose 100mL (microrganismo) com desconto.
CREATE OR REPLACE FUNCTION public.create_partner_order_secure(
  p_partner_id uuid,
  p_observacoes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_requested_delivery_date date DEFAULT NULL,
  p_partner_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  v_unidade text;
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
    v_unidade := NULLIF(v_item->>'unidade_medida', '');
    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty'; END IF;

    IF v_itipo = 'produto' THEN
      IF v_unidade IS NULL THEN v_unidade := 'hectare'; END IF;
      IF v_unidade NOT IN ('hectare','litro','unidade','dose') THEN
        RAISE EXCEPTION 'invalid_unidade_medida';
      END IF;

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
      IF v_unidade IS NULL THEN v_unidade := 'dose'; END IF;
      IF v_unidade NOT IN ('dose','litro','unidade','hectare') THEN
        RAISE EXCEPTION 'invalid_unidade_medida';
      END IF;

      SELECT id, nome, codigo, valor_dose_brl, ativo, COALESCE(b2b_enabled, false) AS b2b_enabled
        INTO v_micro_row FROM public.microrganismos WHERE id = v_iid;
      IF NOT FOUND OR v_micro_row.ativo = false OR v_micro_row.b2b_enabled = false THEN
        RAISE EXCEPTION 'product_unavailable';
      END IF;
      v_nome := v_micro_row.nome;
      v_codigo := v_micro_row.codigo;
      v_base := COALESCE(v_micro_row.valor_dose_brl, 0);

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
      desconto_percentual, subtotal, unidade_medida,
      produto_nome_snapshot, produto_codigo_snapshot,
      preco_tabela_snapshot, desconto_percentual_snapshot, preco_unitario_final_snapshot
    ) VALUES (
      v_order_id,
      CASE WHEN v_itipo='produto' THEN v_iid END,
      CASE WHEN v_itipo='microrganismo' THEN v_iid END,
      v_qty, v_preco_final, v_desc, v_line_subtotal, v_unidade,
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

-- 3) RLS catalogo_volumes: gestor_comercial só lê; admin/gestor editam; leitores internos ampliados.
DROP POLICY IF EXISTS "Staff manage catalogo_volumes" ON public.catalogo_volumes;
DROP POLICY IF EXISTS "Staff read all catalogo_volumes" ON public.catalogo_volumes;

CREATE POLICY "Staff read catalogo_volumes" ON public.catalogo_volumes
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'administrador')
    OR has_role(auth.uid(),'gestor')
    OR has_role(auth.uid(),'gestor_comercial')
    OR has_role(auth.uid(),'consultor_tecnico')
    OR has_role(auth.uid(),'tecnico_agronomo')
    OR has_role(auth.uid(),'producao')
  );

CREATE POLICY "Admin gestor manage catalogo_volumes" ON public.catalogo_volumes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor'))
  WITH CHECK (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor'));
