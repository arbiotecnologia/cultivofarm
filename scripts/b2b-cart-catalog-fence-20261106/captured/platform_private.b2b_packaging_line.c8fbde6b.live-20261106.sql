CREATE OR REPLACE FUNCTION platform_private.b2b_packaging_line(p_partner_id uuid, p_plan_id uuid, p_item jsonb, p_ref date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- B2B_PARTNER_PACKAGING_ORDER_V1: uma linha = N embalagens INTEIRAS de um produto do vendedor do parceiro.
-- Preço: catalogo_precos_embalagem vigente (fonte canônica da embalagem) do MESMO dono; o cliente nunca envia preço.
-- Peso líquido é só snapshot/frete; nunca vira quantidade vendida. Sem fallback para volume/litro/hectare.
DECLARE
  v_seller uuid; v_iid uuid; v_pid uuid; v_qty numeric; v_nome text; v_codigo text;
  v_unit text; k record; v_price_id uuid; v_base numeric(14,2); v_n integer;
  v_plan record; v_mode text; v_disc numeric(9,4); v_final numeric(14,2); v_quote boolean := false;
BEGIN
  IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' THEN RAISE EXCEPTION 'B2B_PACKAGING_LINE_INVALID' USING ERRCODE='22023'; END IF;
  IF p_item ?| ARRAY['preco','preco_unitario','preco_brl','price','unit_price','final_unit_price','base_price',
                     'subtotal','line_final_amount','line_table_amount','desconto_percentual','discount_percent','total'] THEN
    RAISE EXCEPTION 'B2B_PACKAGING_CLIENT_PRICE_FORBIDDEN' USING ERRCODE='22023'; END IF;
  IF p_item ?| ARRAY['volume_ml','volume_id','unidade_medida','area_ha','unidade_pedido'] THEN
    RAISE EXCEPTION 'B2B_PACKAGING_VOLUME_MIXED' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_item) x WHERE x NOT IN ('item_id','item_tipo','packaging_id','quantidade')) THEN
    RAISE EXCEPTION 'B2B_PACKAGING_LINE_INVALID' USING ERRCODE='22023'; END IF;
  IF p_item->>'item_tipo' IS DISTINCT FROM 'produto' THEN RAISE EXCEPTION 'B2B_PACKAGING_PRODUCT_ONLY' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_item->'item_id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_item->'packaging_id') IS DISTINCT FROM 'string'
     OR (p_item->>'item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR (p_item->>'packaging_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'B2B_PACKAGING_LINE_INVALID' USING ERRCODE='22023'; END IF;
  v_iid := (p_item->>'item_id')::uuid; v_pid := (p_item->>'packaging_id')::uuid;
  -- Quantidade: número JSON inteiro > 0 (limite apenas do tipo integer; nenhum limite comercial inventado).
  IF jsonb_typeof(p_item->'quantidade') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'B2B_PACKAGING_QTY_NOT_INTEGER' USING ERRCODE='22023'; END IF;
  v_qty := (p_item->>'quantidade')::numeric;
  IF v_qty <= 0 OR v_qty <> trunc(v_qty) OR v_qty > 2147483647 THEN RAISE EXCEPTION 'B2B_PACKAGING_QTY_NOT_INTEGER' USING ERRCODE='22023'; END IF;

  SELECT pa.commercial_owner_organization_id INTO v_seller FROM public.partner_accounts pa
   WHERE pa.id = p_partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
  IF v_seller IS NULL THEN RAISE EXCEPTION 'partner_not_found' USING ERRCODE='42501'; END IF;

  SELECT pr.nome, pr.codigo INTO v_nome, v_codigo FROM public.produtos pr
   WHERE pr.id = v_iid AND pr.owner_organization_id = v_seller AND pr.ativo IS TRUE AND COALESCE(pr.b2b_enabled, true) IS TRUE;
  IF v_nome IS NULL THEN RAISE EXCEPTION 'product_unavailable' USING ERRCODE='P0001'; END IF;
  -- Publicação para ESTE parceiro: o item precisa estar no catálogo canônico do comprador (guard canônico incluso).
  IF NOT EXISTS (SELECT 1 FROM public.get_partner_catalog_secure(p_partner_id) c WHERE c.item_id = v_iid AND c.item_tipo = 'produto') THEN
    RAISE EXCEPTION 'B2B_PACKAGING_NOT_PUBLISHED' USING ERRCODE='42501'; END IF;

  SELECT pp.* INTO k FROM public.product_packagings pp WHERE pp.id = v_pid;
  IF NOT FOUND OR k.product_id IS DISTINCT FROM v_iid OR k.owner_organization_id IS DISTINCT FROM v_seller THEN
    RAISE EXCEPTION 'B2B_PACKAGING_FOREIGN' USING ERRCODE='42501'; END IF;
  IF k.ativo IS NOT TRUE OR k.valid_from > now() OR (k.valid_to IS NOT NULL AND k.valid_to <= now()) THEN
    RAISE EXCEPTION 'B2B_PACKAGING_INACTIVE' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalogo_volumes cv WHERE cv.id = k.id AND cv.medida = 'embalagem' AND cv.ativo IS TRUE
                   AND cv.produto_id = v_iid AND cv.owner_organization_id = v_seller) THEN
    RAISE EXCEPTION 'B2B_PACKAGING_NOT_PUBLISHED' USING ERRCODE='42501'; END IF;
  SELECT s.unidade_conteudo INTO v_unit FROM public.product_sale_units s
   WHERE s.product_id = v_iid AND s.owner_organization_id = v_seller AND s.unidade_conteudo IN ('kg','g','ml','l');
  IF v_unit IS NULL THEN RAISE EXCEPTION 'B2B_PACKAGING_SALE_UNIT_MISSING' USING ERRCODE='42501'; END IF;

  SELECT count(*), min(c.id::text)::uuid, min(c.preco_brl) INTO v_n, v_price_id, v_base
    FROM public.catalogo_precos_embalagem c
   WHERE c.packaging_id = k.id AND c.produto_id = v_iid AND c.owner_organization_id = v_seller AND c.ativo IS TRUE
     AND c.valid_from <= p_ref AND (c.valid_until IS NULL OR c.valid_until >= p_ref);
  IF v_n IS DISTINCT FROM 1 OR v_base IS NULL OR v_base <= 0 THEN RAISE EXCEPTION 'B2B_PACKAGING_UNPRICED' USING ERRCODE='42501'; END IF;

  SELECT pl.* INTO v_plan FROM public.commercial_payment_plans pl WHERE pl.id = p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found' USING ERRCODE='P0001'; END IF;
  IF v_plan.active IS NOT TRUE THEN RAISE EXCEPTION 'plan_inactive' USING ERRCODE='P0001'; END IF;
  v_mode := COALESCE(v_plan.pricing_mode, 'discount_from_base');
  IF v_mode = 'quote_only' THEN
    v_quote := true; v_disc := NULL; v_final := NULL;
  ELSIF v_mode = 'discount_from_base' THEN
    -- Mesma semântica do motor canônico para o plano (desconto do plano sobre o preço-base); sem regra por item.
    v_disc := COALESCE(v_plan.discount_percent, 0);
    v_final := round(v_base * (1 - v_disc / 100.0), 2);
    IF v_final <= 0 THEN RAISE EXCEPTION 'ITEM_WITHOUT_PRICE' USING ERRCODE='P0001'; END IF;
  ELSE
    -- Decisão do proprietário (06/11/2026): fixed_item_price recusado sem configuração específica de embalagem.
    RAISE EXCEPTION 'B2B_PACKAGING_PRICING_MODE_UNSUPPORTED' USING ERRCODE='P0001';
  END IF;

  RETURN jsonb_build_object(
    'item_id', v_iid, 'item_tipo', 'produto', 'quantidade', v_qty,
    'unidade_medida', 'unidade', 'volume_ml', NULL,
    'nome', v_nome, 'codigo', v_codigo,
    'pricing_mode', CASE WHEN v_quote THEN 'quote_only' ELSE 'discount_from_base' END,
    'price_source', CASE WHEN v_quote THEN 'quote_only' ELSE 'packaging_price' END,
    'reason_code', CASE WHEN v_quote THEN 'QUOTE_REQUIRED' ELSE 'OK' END,
    'quote_required', v_quote,
    'base_price', CASE WHEN v_quote THEN NULL ELSE v_base END,
    'condition_price', NULL,
    'plan_discount_percent', v_disc,
    'min_quantity', 0,
    'final_unit_price', v_final,
    'rule_id', NULL,
    'line_table_amount', CASE WHEN v_quote THEN 0 ELSE round(v_base * v_qty, 2) END,
    'line_final_amount', CASE WHEN v_quote THEN 0 ELSE round(v_final * v_qty, 2) END,
    'packaging_id', k.id, 'packaging_codigo', k.codigo, 'packaging_version', k.version,
    'peso_liquido_kg', k.peso_liquido_kg, 'unidade_conteudo', v_unit, 'packaging_price_id', v_price_id);
END $function$
