#!/usr/bin/env python3
"""Gera o pacote B2B_PARTNER_PACKAGING_ORDER_V1 a partir das capturas LIVE (06/11/2026, ref swzpzcwiasxmjutrmvkm).

Fonte única: ./captured/*.live-20261106.sql (corpos byte a byte de pg_get_functiondef, md5 conferido no nome).
Cada delta é uma substituição de âncora EXATA com contagem 1 — qualquer drift aborta a geração.
Saídas: 01-pre.sql.readonly, 02-install.sql.review, 03-post.sql.readonly, 04-rollback-deny.sql.review.
NADA aqui é aplicado: os arquivos são para revisão do proprietário/auditor.
"""
import hashlib, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
CAP = HERE / "captured"
CONTRACT = "B2B_PARTNER_PACKAGING_ORDER_V1"

PINS = {  # assinatura -> md5 LIVE (capturado read-only 06/11/2026)
    "public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)": "7ec41e17ca6cca8cd4ef1404a9edc936",
    "public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)": "37d4f45e388ed7b38f6f397b672629ee",
    "public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)": "e57d3a6416910937bd02c9180dff0cf1",
    "public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date)": "e8df538321d933a5ae9ef1acda4215de",
    "public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric)": "26fd3c7724a40b919f240f4021176115",
    "public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric)": "0df0d9005d46b667db4433d3eae59e27",
    "public.recorte_a_legacy_solid(uuid)": "63f70a9eb885294aa081f4ce35d183c6",
    "platform_private.b2b_partner_catalog_reader(uuid)": "bd985484b69c8fa6e63a920eff518369",
    "platform_private.solid_pack_presentation_link()": "a912476c75a46d12b4619146e26af8b0",
    "platform_private.partner_order_items_catalog_tenant_guard()": "211a5c4db841fd3e5ce3859c6477c7ae",
    "public.fn_b2b_guard_order_items_immutable()": "bc1c4dca3a9f5a247a3c098dcbe1c06f",
    "public.get_partner_catalog_secure(uuid)": "6b56cfb144ebc8dd947473e90e2d7768",
    "public.get_partner_catalog_secure(uuid,boolean)": "1391adc2133b922e2dcea4b1d3e26820",
    "public.get_partner_catalog_volumes_secure(uuid)": "efd27efca33735a9df54d5eeb2d7dfa5",
    "public.solid_pack_price_set_v1(uuid,bigint,date,uuid,text)": "0bad25e18712c0266524230a5a464a3b",
    "public.solid_pack_offers_admin_v1(uuid)": "6c2ea4feef6100986e9fe51ed4842d9e",
}
# ACL LIVE esperada (proacl::text) das funções que o pacote substitui (CREATE OR REPLACE preserva ACL).
ACL = {
    "public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)": "{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}",
    "public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date)": "{postgres=X/postgres,service_role=X/postgres}",
    "public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric)": "{postgres=X/postgres,service_role=X/postgres}",
}
PACK_COLS = ["packaging_id_snapshot", "packaging_codigo_snapshot", "packaging_version_snapshot",
             "packaging_peso_liquido_kg_snapshot", "packaging_unidade_conteudo_snapshot", "packaging_price_id_snapshot"]


def cap(name: str, md5: str) -> str:
    p = CAP / f"{name}.{md5[:8]}.live-20261106.sql"
    b = p.read_bytes()
    if hashlib.md5(b).hexdigest() != md5:
        sys.exit(f"captura divergente: {p.name}")
    return b.decode("utf-8")


def rep(body: str, a: str, b: str) -> str:
    n = body.count(a)
    if n != 1:
        sys.exit(f"âncora com contagem {n} (esperado 1): {a[:80]!r}")
    return body.replace(a, b)


def dollar(body: str) -> str:
    assert body.startswith("CREATE OR REPLACE FUNCTION"), body[:40]
    return body.rstrip("\n") + ";\n"


# ---------------------------------------------------------------- helpers novos (privados)
LINE_FN = r"""
CREATE FUNCTION platform_private.b2b_packaging_line(p_partner_id uuid, p_plan_id uuid, p_item jsonb, p_ref date)
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
END $function$;
REVOKE ALL ON FUNCTION platform_private.b2b_packaging_line(uuid,uuid,jsonb,date) FROM PUBLIC, anon, authenticated, service_role;
"""

LOCK_FN = r"""
CREATE FUNCTION platform_private.b2b_packaging_lock(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $function$
-- Trava (FOR SHARE, ordem determinística por id) embalagens e preços vigentes citados no carrinho, para que
-- arquivamento/troca de preço concorrente espere o pedido ou seja vista por ele (sem mudança de estado aqui).
DECLARE v_ids uuid[]; v_products uuid[];
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN; END IF;
  SELECT array_agg(DISTINCT (l->>'packaging_id')::uuid ORDER BY (l->>'packaging_id')::uuid) INTO v_ids
    FROM jsonb_array_elements(p_items) l
   WHERE jsonb_typeof(l) = 'object' AND jsonb_typeof(l->'packaging_id') = 'string'
     AND (l->>'packaging_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  IF v_ids IS NULL THEN RETURN; END IF;
  -- Ordem fixa entre tabelas (produto -> unidade -> volume -> embalagem -> preço) e por id dentro de cada uma: alteração concorrente
  -- de b2b_enabled/ativo do produto, da unidade de venda, do volume/apresentação ou do preço espera este pedido terminar.
  SELECT array_agg(DISTINCT (l->>'item_id')::uuid ORDER BY (l->>'item_id')::uuid) INTO v_products
    FROM jsonb_array_elements(p_items) l
   WHERE jsonb_typeof(l) = 'object' AND jsonb_typeof(l->'packaging_id') = 'string' AND jsonb_typeof(l->'item_id') = 'string'
     AND (l->>'item_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  PERFORM 1 FROM public.produtos p WHERE p.id = ANY(v_products) ORDER BY p.id FOR SHARE;
  PERFORM 1 FROM public.product_sale_units su WHERE su.product_id = ANY(v_products) ORDER BY su.product_id FOR SHARE;
  PERFORM 1 FROM public.catalogo_volumes cv WHERE cv.id = ANY(v_ids) ORDER BY cv.id FOR SHARE;
  PERFORM 1 FROM public.product_packagings pp WHERE pp.id = ANY(v_ids) ORDER BY pp.id FOR SHARE;
  PERFORM 1 FROM public.catalogo_precos_embalagem c WHERE c.packaging_id = ANY(v_ids) AND c.ativo IS TRUE ORDER BY c.id FOR SHARE;
END $function$;
REVOKE ALL ON FUNCTION platform_private.b2b_packaging_lock(jsonb) FROM PUBLIC, anon, authenticated, service_role;
"""

SNAP_TRG = r"""
CREATE FUNCTION platform_private.b2b_packaging_item_snapshot_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
-- Snapshot de embalagem: no INSERT precisa casar com a embalagem/preço/unidade reais; depois é imutável
-- (cotação só pode mudar colunas de preço). Linhas legadas nunca ganham snapshot de embalagem por UPDATE.
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.packaging_id_snapshot IS NULL THEN RETURN NEW; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.product_packagings k
                    JOIN public.product_sale_units s ON s.product_id = k.product_id AND s.owner_organization_id = k.owner_organization_id
                    JOIN public.catalogo_precos_embalagem c ON c.id = NEW.packaging_price_id_snapshot AND c.packaging_id = k.id
                         AND c.produto_id = k.product_id AND c.owner_organization_id = k.owner_organization_id
                   WHERE k.id = NEW.packaging_id_snapshot AND k.product_id = NEW.product_id
                     AND k.codigo = NEW.packaging_codigo_snapshot AND k.version = NEW.packaging_version_snapshot
                     AND k.peso_liquido_kg = NEW.packaging_peso_liquido_kg_snapshot
                     AND s.unidade_conteudo = NEW.packaging_unidade_conteudo_snapshot) THEN
      RAISE EXCEPTION 'B2B_PACKAGING_SNAPSHOT_MISMATCH' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.packaging_id_snapshot, NEW.packaging_codigo_snapshot, NEW.packaging_version_snapshot, NEW.packaging_peso_liquido_kg_snapshot,
      NEW.packaging_unidade_conteudo_snapshot, NEW.packaging_price_id_snapshot)
     IS DISTINCT FROM
     (OLD.packaging_id_snapshot, OLD.packaging_codigo_snapshot, OLD.packaging_version_snapshot, OLD.packaging_peso_liquido_kg_snapshot,
      OLD.packaging_unidade_conteudo_snapshot, OLD.packaging_price_id_snapshot)
     OR (OLD.packaging_id_snapshot IS NOT NULL AND (NEW.product_id, NEW.quantidade, NEW.unidade_medida, NEW.volume_ml, NEW.order_id)
          IS DISTINCT FROM (OLD.product_id, OLD.quantidade, OLD.unidade_medida, OLD.volume_ml, OLD.order_id)) THEN
    RAISE EXCEPTION 'B2B_PACKAGING_SNAPSHOT_IMMUTABLE' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION platform_private.b2b_packaging_item_snapshot_guard() FROM PUBLIC, anon, authenticated, service_role;
"""

READER_FN = r"""
CREATE FUNCTION public.get_partner_packaging_offers_secure(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
-- Leitor do comprador: embalagens inteiras ativas, publicadas e com preço vigente do vendedor do parceiro.
-- Mesmo guard canônico do catálogo; preco_tabela_brl é só exibição — o pedido é sempre recalculado no servidor.
DECLARE v_seller uuid; v_offers jsonb; v_solids jsonb;
BEGIN
  v_seller := platform_private.b2b_partner_catalog_reader(p_partner_id);
  IF v_seller IS NULL THEN RAISE EXCEPTION 'partner_not_found' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'product_id', k.product_id, 'unidade_conteudo', s.unidade_conteudo,
           'packaging_id', k.id, 'codigo', k.codigo, 'descricao', k.descricao, 'rotulo', cv.rotulo,
           'peso_liquido_kg', k.peso_liquido_kg, 'version', k.version, 'preco_tabela_brl', c.preco_brl)
         ORDER BY k.product_id, k.peso_liquido_kg, k.codigo, k.id), '[]'::jsonb)
    INTO v_offers
    FROM public.product_packagings k
    JOIN (SELECT DISTINCT g.item_id FROM public.get_partner_catalog_secure(p_partner_id) g WHERE g.item_tipo = 'produto') g ON g.item_id = k.product_id
    JOIN public.produtos pr ON pr.id = k.product_id AND pr.owner_organization_id = v_seller AND pr.ativo IS TRUE AND COALESCE(pr.b2b_enabled, true) IS TRUE
    JOIN public.product_sale_units s ON s.product_id = k.product_id AND s.owner_organization_id = v_seller AND s.unidade_conteudo IN ('kg','g','ml','l')
    JOIN public.catalogo_volumes cv ON cv.id = k.id AND cv.medida = 'embalagem' AND cv.ativo IS TRUE AND cv.produto_id = k.product_id AND cv.owner_organization_id = v_seller
    JOIN LATERAL (SELECT min(c.preco_brl) AS preco_brl, count(*) AS n FROM public.catalogo_precos_embalagem c
                   WHERE c.packaging_id = k.id AND c.produto_id = k.product_id AND c.owner_organization_id = v_seller AND c.ativo IS TRUE
                     AND c.valid_from <= current_date AND (c.valid_until IS NULL OR c.valid_until >= current_date)) c ON c.n = 1
   WHERE k.owner_organization_id = v_seller AND k.ativo IS TRUE AND k.valid_from <= now() AND (k.valid_to IS NULL OR k.valid_to > now());
  -- Sólidos confirmados (kg/g) do catálogo autorizado, COM ou SEM oferta vigente: o comprador nunca cai no modo líquido
  -- por falta de preço/apresentação; a ausência de oferta é dita como tal. Sem preço, sem embalagem.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', pr.id, 'unidade_conteudo', s.unidade_conteudo) ORDER BY pr.id), '[]'::jsonb)
    INTO v_solids
    FROM (SELECT DISTINCT g.item_id FROM public.get_partner_catalog_secure(p_partner_id) g WHERE g.item_tipo = 'produto') g
    JOIN public.produtos pr ON pr.id = g.item_id AND pr.owner_organization_id = v_seller AND pr.ativo IS TRUE AND COALESCE(pr.b2b_enabled, true) IS TRUE
    JOIN public.product_sale_units s ON s.product_id = pr.id AND s.owner_organization_id = v_seller AND s.unidade_conteudo IN ('kg','g');
  RETURN jsonb_build_object('contract', 'B2B_PARTNER_PACKAGING_ORDER_V1', 'partner_id', p_partner_id, 'offers', v_offers, 'solid_products', v_solids);
END $function$;
REVOKE ALL ON FUNCTION public.get_partner_packaging_offers_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_packaging_offers_secure(uuid) TO authenticated;
"""

DDL = """
ALTER TABLE public.partner_order_items
  ADD COLUMN packaging_id_snapshot uuid,
  ADD COLUMN packaging_codigo_snapshot text,
  ADD COLUMN packaging_version_snapshot integer,
  ADD COLUMN packaging_peso_liquido_kg_snapshot numeric(14,3),
  ADD COLUMN packaging_unidade_conteudo_snapshot text,
  ADD COLUMN packaging_price_id_snapshot uuid;
ALTER TABLE public.partner_order_items ADD CONSTRAINT poi_packaging_snapshot_shape CHECK (
  (packaging_id_snapshot IS NULL AND packaging_codigo_snapshot IS NULL AND packaging_version_snapshot IS NULL
   AND packaging_peso_liquido_kg_snapshot IS NULL AND packaging_unidade_conteudo_snapshot IS NULL AND packaging_price_id_snapshot IS NULL)
  -- Segunda alternativa com IS NOT NULL explícito em todo operando: nenhuma comparação nula vira UNKNOWN (que o CHECK aceitaria).
  OR (packaging_id_snapshot IS NOT NULL AND product_id IS NOT NULL AND microrganismo_id IS NULL
      AND packaging_codigo_snapshot IS NOT NULL AND btrim(packaging_codigo_snapshot) <> ''
      AND packaging_version_snapshot IS NOT NULL AND packaging_version_snapshot >= 1
      AND packaging_peso_liquido_kg_snapshot IS NOT NULL AND packaging_peso_liquido_kg_snapshot > 0
      AND packaging_unidade_conteudo_snapshot IS NOT NULL AND packaging_unidade_conteudo_snapshot IN ('kg','g','ml','l')
      AND packaging_price_id_snapshot IS NOT NULL AND volume_ml IS NULL AND volume_ml_snapshot IS NULL
      AND unidade_medida IS NOT NULL AND unidade_medida = 'unidade'
      AND quantidade IS NOT NULL AND quantidade > 0 AND quantidade = trunc(quantidade)));
CREATE TRIGGER a001_b2b_packaging_item_snapshot BEFORE INSERT OR UPDATE ON public.partner_order_items
  FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_packaging_item_snapshot_guard();
"""


def build():
    cart = cap("public.fn_resolve_b2b_cart", PINS["public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date)"])
    cart = rep(cart, "  v_ok boolean; v_active boolean; v_b2b boolean;\n",
               "  v_ok boolean; v_active boolean; v_b2b boolean;\n  v_pk jsonb; v_pk_seen uuid[] := ARRAY[]::uuid[]; -- b2b_pack_v1\n")
    cart = rep(cart, "  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP\n",
               "  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP\n"
               "    -- b2b_pack_v1: linha de embalagem inteira; nunca cai no ramo volume/litro/hectare.\n"
               "    IF jsonb_typeof(v_item) = 'object' AND v_item ? 'packaging_id' THEN\n"
               "      v_pk := platform_private.b2b_packaging_line(p_partner_id, p_plan_id, v_item, COALESCE(p_ref_date, current_date));\n"
               "      IF (v_pk->>'packaging_id')::uuid = ANY(v_pk_seen) THEN RAISE EXCEPTION 'B2B_PACKAGING_DUPLICATE_LINE' USING ERRCODE='22023'; END IF;\n"
               "      v_pk_seen := v_pk_seen || (v_pk->>'packaging_id')::uuid;\n"
               "      IF (v_pk->>'quote_required')::boolean THEN v_quote := true;\n"
               "      ELSE v_table := v_table + (v_pk->>'line_table_amount')::numeric; v_net := v_net + (v_pk->>'line_final_amount')::numeric; END IF;\n"
               "      v_lines := v_lines || jsonb_build_array(v_pk);\n"
               "      CONTINUE;\n"
               "    END IF;\n")
    hsh = cap("public.fn_b2b_cart_hash", PINS["public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric)"])
    hsh = rep(hsh, "to_char(ROUND(COALESCE((l->>'line_final_amount')::numeric,0),2),'FM9999999999990.00'),\n",
              "to_char(ROUND(COALESCE((l->>'line_final_amount')::numeric,0),2),'FM9999999999990.00')\n"
              "        || CASE WHEN l ? 'packaging_id' THEN '~pk:' || COALESCE(l->>'packaging_id','') || ':' || COALESCE(l->>'packaging_version','')\n"
              "                || ':' || COALESCE(l->>'packaging_price_id','') || ':' || COALESCE(l->>'peso_liquido_kg','') || ':' || COALESCE(l->>'unidade_conteudo','')\n"
              "                ELSE '' END,\n")
    hsh = rep(hsh, "                     COALESCE(l->>'rule_id',''))\n",
              "                     COALESCE(l->>'rule_id',''),\n                     COALESCE(l->>'packaging_id',''))\n")
    crt = cap("public.create_partner_order_secure", PINS["public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)"])
    crt = rep(crt, "                                   'FM9999999990.000000')), '0') AS t\n",
              "                                   'FM9999999990.000000')), '0')\n"
              "             || CASE WHEN jsonb_typeof(l) = 'object' AND l ? 'packaging_id' THEN '|pk=' || lower(COALESCE(btrim(l->>'packaging_id'),'-')) ELSE '' END AS t\n")
    crt = rep(crt, "  v_cart  := public.fn_resolve_b2b_cart(p_partner_id, p_payment_plan_id, p_items, current_date);\n",
              "  PERFORM platform_private.b2b_packaging_lock(p_items); -- b2b_pack_v1\n"
              "  v_cart  := public.fn_resolve_b2b_cart(p_partner_id, p_payment_plan_id, p_items, current_date);\n")
    crt = rep(crt, "      unit_type_snapshot, volume_ml_snapshot, price_rule_id_snapshot\n    ) VALUES (\n",
              "      unit_type_snapshot, volume_ml_snapshot, price_rule_id_snapshot,\n"
              "      packaging_id_snapshot, packaging_codigo_snapshot, packaging_version_snapshot,\n"
              "      packaging_peso_liquido_kg_snapshot, packaging_unidade_conteudo_snapshot, packaging_price_id_snapshot\n    ) VALUES (\n")
    crt = rep(crt, "      NULLIF(v_line->>'rule_id','')::uuid\n    );\n",
              "      NULLIF(v_line->>'rule_id','')::uuid,\n"
              "      NULLIF(v_line->>'packaging_id','')::uuid, v_line->>'packaging_codigo', NULLIF(v_line->>'packaging_version','')::integer,\n"
              "      NULLIF(v_line->>'peso_liquido_kg','')::numeric, v_line->>'unidade_conteudo', NULLIF(v_line->>'packaging_price_id','')::uuid\n    );\n")
    return cart, hsh, crt


def pin_block(label: str) -> str:
    lines = [f"DO $pre$\nBEGIN"]
    for sig, md in PINS.items():
        lines.append(f"  IF to_regprocedure('{sig}') IS NULL OR md5(pg_get_functiondef('{sig}'::regprocedure)) <> '{md}' THEN\n"
                     f"    RAISE EXCEPTION '{label}: {sig} divergente da captura 06/11'; END IF;")
    for sig, acl in ACL.items():
        lines.append(f"  IF (SELECT proacl::text FROM pg_proc WHERE oid = '{sig}'::regprocedure) IS DISTINCT FROM '{acl}' THEN\n"
                     f"    RAISE EXCEPTION '{label}: ACL de {sig} divergente'; END IF;")
    lines.append("  IF to_regprocedure('public.get_partner_packaging_offers_secure(uuid)') IS NOT NULL\n"
                 "     OR to_regprocedure('platform_private.b2b_packaging_line(uuid,uuid,jsonb,date)') IS NOT NULL\n"
                 "     OR to_regprocedure('platform_private.b2b_packaging_lock(jsonb)') IS NOT NULL\n"
                 "     OR to_regprocedure('platform_private.b2b_packaging_item_snapshot_guard()') IS NOT NULL\n"
                 f"     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_order_items' AND column_name IN ({', '.join(repr(c) for c in PACK_COLS)}))\n"
                 "     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_order_items'::regclass AND tgname='a001_b2b_packaging_item_snapshot') THEN\n"
                 f"    RAISE EXCEPTION '{label}: alvo B2B_PACKAGING_ORDER_V1 já existe (rerun recusado)'; END IF;")
    lines.append("  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_order_items'::regclass AND conname='partner_order_items_unidade_check'\n"
                 "                   AND pg_get_constraintdef(oid) LIKE '%''unidade''::text%') THEN\n"
                 f"    RAISE EXCEPTION '{label}: check de unidade_medida divergente'; END IF;")
    lines.append("END $pre$;")
    return "\n".join(lines) + "\n"


def main():
    cart, hsh, crt = build()
    hdr = f"-- {CONTRACT} — pedido B2B por embalagem inteira (sólidos e pedido misto). Gerado por generate.py.\n" \
          "-- REVISÃO: NÃO APLICAR sem 01-pre aprovado no ref swzpzcwiasxmjutrmvkm e autorização do proprietário.\n"
    pre = hdr + "-- 01-pre (somente leitura): confirma pins/ACL/ausência de alvo. Rodar em transação READ ONLY.\n" \
          "BEGIN READ ONLY;\n" + pin_block("PRE_DRIFT") + "SELECT 'PRE_OK' AS result;\nROLLBACK;\n"
    install = (hdr + "-- Muda: +6 colunas de snapshot/CHECK/trigger em partner_order_items; +3 helpers privados; +1 leitor;\n"
               "-- delta de fn_resolve_b2b_cart (ramo embalagem), fn_b2b_cart_hash (sufixo só para embalagem) e create_partner_order_secure\n"
               "-- (fingerprint inclui packaging_id, trava FOR SHARE, grava snapshot). Simulação e cotação: corpos inalterados (pinados).\n"
               "-- Não muda RLS/policies, papéis, features, gates, crédito, fiscal, recebíveis, envios nem linhas líquidas.\n"
               "BEGIN;\nSET LOCAL lock_timeout = '5s';\n" + pin_block("PRE_DRIFT") + DDL + LINE_FN + LOCK_FN + SNAP_TRG +
               "-- trigger criado após a função\n" + "" + dollar(cart) + dollar(hsh) + dollar(crt) + READER_FN + "COMMIT;\n")
    # o trigger referencia a função: reordenar DDL para depois de SNAP_TRG
    install = install.replace(DDL + LINE_FN + LOCK_FN + SNAP_TRG, LINE_FN + LOCK_FN + SNAP_TRG + DDL)
    post_md5 = {"cart": hashlib.md5(cart.encode()).hexdigest(), "hash": hashlib.md5(hsh.encode()).hexdigest(),
                "create": hashlib.md5(crt.encode()).hexdigest()}
    post = hdr + "-- 03-post (somente leitura): confirma instalação exata; não escreve.\nBEGIN READ ONLY;\nDO $post$\nBEGIN\n" + \
        f"  IF md5(pg_get_functiondef('public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date)'::regprocedure)) <> '{post_md5['cart']}'\n" \
        f"  OR md5(pg_get_functiondef('public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric)'::regprocedure)) <> '{post_md5['hash']}'\n" \
        f"  OR md5(pg_get_functiondef('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'::regprocedure)) <> '{post_md5['create']}' THEN\n" \
        "    RAISE EXCEPTION 'POST_FAIL: corpo divergente do gerado'; END IF;\n" + \
        "".join(f"  IF md5(pg_get_functiondef('{s}'::regprocedure)) <> '{m}' THEN RAISE EXCEPTION 'POST_FAIL: {s} alterada'; END IF;\n"
                for s, m in PINS.items() if s not in ("public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date)", "public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric)",
                                                     "public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)")) + \
        "".join(f"  IF (SELECT proacl::text FROM pg_proc WHERE oid = '{s}'::regprocedure) IS DISTINCT FROM '{a}' THEN RAISE EXCEPTION 'POST_FAIL: ACL {s}'; END IF;\n"
                for s, a in ACL.items()) + \
        "  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.get_partner_packaging_offers_secure(uuid)'::regprocedure) IS NOT TRUE\n" \
        "  OR NOT has_function_privilege('authenticated','public.get_partner_packaging_offers_secure(uuid)','EXECUTE')\n" \
        "  OR has_function_privilege('anon','public.get_partner_packaging_offers_secure(uuid)','EXECUTE')\n" \
        "  OR has_function_privilege('authenticated','platform_private.b2b_packaging_line(uuid,uuid,jsonb,date)','EXECUTE')\n" \
        "  OR has_function_privilege('authenticated','platform_private.b2b_packaging_lock(jsonb)','EXECUTE')\n" \
        "  OR has_function_privilege('authenticated','platform_private.b2b_packaging_item_snapshot_guard()','EXECUTE')\n" \
        "  OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_order_items' AND column_name LIKE 'packaging\\_%\\_snapshot') <> 6\n" \
        "  OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_order_items'::regclass AND conname='poi_packaging_snapshot_shape' AND convalidated)\n" \
        "  OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_order_items'::regclass AND tgname='a001_b2b_packaging_item_snapshot' AND tgenabled='O') THEN\n" \
        "    RAISE EXCEPTION 'POST_FAIL: ACL/colunas/constraint/trigger'; END IF;\nEND $post$;\nSELECT 'POST_OK' AS result;\nROLLBACK;\n"
    # rollback deny-only: fecha leitor e ramo; mantém colunas, snapshots, CHECK e trigger (histórico preservado).
    deny_cart = rep(cart, "    IF jsonb_typeof(v_item) = 'object' AND v_item ? 'packaging_id' THEN\n",
                    "    IF jsonb_typeof(v_item) = 'object' AND v_item ? 'packaging_id' THEN\n"
                    "      RAISE EXCEPTION 'B2B_PACKAGING_ORDER_CLOSED' USING ERRCODE='42501';\n")
    rollback = hdr + "-- 04-rollback-deny: FECHA o contrato sem restaurar nada vulnerável nem apagar histórico.\n" \
        "-- Mantém colunas/snapshots/CHECK/trigger e pedidos já gravados; leitor passa a negar e perde EXECUTE; linha de embalagem é recusada.\n" \
        "BEGIN;\nSET LOCAL lock_timeout = '5s';\nDO $rb$\nBEGIN\n" \
        f"  IF md5(pg_get_functiondef('public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date)'::regprocedure)) <> '{post_md5['cart']}' THEN\n" \
        "    RAISE EXCEPTION 'ROLLBACK_PRE: resolver não é o instalado por este pacote'; END IF;\nEND $rb$;\n" + \
        dollar(deny_cart) + \
        "CREATE OR REPLACE FUNCTION public.get_partner_packaging_offers_secure(p_partner_id uuid)\nRETURNS jsonb\nLANGUAGE plpgsql\nSTABLE SECURITY DEFINER\nSET search_path TO ''\n" \
        "AS $function$\nBEGIN\n  RAISE EXCEPTION 'B2B_PACKAGING_ORDER_CLOSED' USING ERRCODE='42501';\nEND $function$;\n" \
        "REVOKE ALL ON FUNCTION public.get_partner_packaging_offers_secure(uuid) FROM PUBLIC, anon, authenticated;\nCOMMIT;\n"
    (HERE / "01-pre.sql.readonly").write_text(pre)
    (HERE / "02-install.sql.review").write_text(install)
    (HERE / "03-post.sql.readonly").write_text(post)
    (HERE / "04-rollback-deny.sql.review").write_text(rollback)
    (HERE / "generated-md5.json").write_text(__import__("json").dumps(post_md5, indent=2) + "\n")
    print("OK", post_md5)


if __name__ == "__main__":
    main()
