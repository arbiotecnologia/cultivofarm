-- CANDIDATO 10 — NÃO APLICADO. Gerado por build-ownership10.py a partir de definições live (read-only).
-- Requer 01–06/08/09; gate OFF. Somente filtra roots a globais (owner IS NULL); não altera ACL, autorização, preços ou históricos.
-- Cada função: hash-before fixado; âncoras literais com contagem exata; aborta antes de qualquer replace em drift.
BEGIN;
DO $g$ BEGIN IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership10_gate_must_remain_off'; END IF; END $g$;
DO $p$
DECLARE v_oid regprocedure := 'public.partner_apply_default_discount(uuid)'::regprocedure; v_def text;
BEGIN
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> 'c33a667463b7f34840237ad9ba676761' THEN RAISE EXCEPTION 'ownership10_drift:public.partner_apply_default_discount'; END IF;
END $p$;
CREATE OR REPLACE FUNCTION public.partner_apply_default_discount(p_partner_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_desc numeric(5,2);
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid, 'administrador') OR has_role(v_uid, 'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT desconto_padrao INTO v_desc FROM public.partner_accounts WHERE id = p_partner_id AND ativo IS TRUE AND deleted_at IS NULL FOR UPDATE;
  IF v_desc IS NULL THEN RAISE EXCEPTION 'partner_not_found' USING ERRCODE='42501'; END IF;

  INSERT INTO public.partner_product_prices(partner_id, product_id, preco_tabela, desconto_percentual, preco_final, ativo)
  SELECT p_partner_id, p.id,
         COALESCE(p.valor_ha_brl, 0),
         v_desc,
         ROUND(COALESCE(p.valor_ha_brl, 0) * (1 - v_desc/100.0), 2),
         true
  FROM public.produtos p
  WHERE p.ativo = true AND p.owner_organization_id IS NULL
  ON CONFLICT (partner_id, product_id) WHERE product_id IS NOT NULL DO UPDATE
    SET preco_tabela = EXCLUDED.preco_tabela,
        desconto_percentual = EXCLUDED.desconto_percentual,
        preco_final = EXCLUDED.preco_final,
        ativo = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
DO $p$
DECLARE v_oid regprocedure := 'public.rpc_commercial_simulator(uuid, uuid, numeric, numeric)'::regprocedure; v_def text;
BEGIN
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> '4e324b1711f06bb556f050d8ea1aa8f0' THEN RAISE EXCEPTION 'ownership10_drift:public.rpc_commercial_simulator'; END IF;
END $p$;
CREATE OR REPLACE FUNCTION public.rpc_commercial_simulator(p_partner_id uuid, p_product_id uuid, p_quantidade numeric, p_desconto numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tabela numeric; v_final numeric; v_total numeric; v_custo numeric;
  v_source text := 'base'; v_source_label text := 'Preço base';
  v_campanha_nome text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.produtos gp WHERE gp.id = p_product_id AND gp.owner_organization_id IS NULL) THEN
    RAISE EXCEPTION 'product_unavailable' USING ERRCODE='P0002';
  END IF;

  -- 1) Campanha ativa
  SELECT c.nome INTO v_campanha_nome
    FROM public.commercial_campaigns c
    JOIN public.commercial_campaign_partners cp ON cp.campaign_id = c.id AND cp.partner_id = p_partner_id
    JOIN public.commercial_campaign_products pp ON pp.campaign_id = c.id AND pp.product_id = p_product_id
   WHERE c.ativa = true AND CURRENT_DATE BETWEEN c.data_inicio AND c.data_fim
   ORDER BY c.data_inicio DESC LIMIT 1;

  IF v_campanha_nome IS NOT NULL THEN
    SELECT COALESCE(
      ppp.preco_tabela,
      p.valor_ha_brl,
      CASE WHEN p.valor_dose_brl IS NOT NULL AND p.dose_ml_ha IS NOT NULL AND p.dose_ml_ha > 0
           THEN ROUND(p.valor_dose_brl * (p.dose_ml_ha/100.0), 2) END,
      CASE WHEN p.valor_litro_brl IS NOT NULL AND p.dose_ml_ha IS NOT NULL AND p.dose_ml_ha > 0
           THEN ROUND((p.valor_litro_brl/10.0) * (p.dose_ml_ha/100.0), 2) END,
      0
    ) INTO v_tabela
      FROM public.produtos p
      LEFT JOIN public.partner_product_prices ppp
        ON ppp.product_id = p.id AND ppp.partner_id = p_partner_id AND ppp.is_current AND ppp.ativo
     WHERE p.id = p_product_id AND p.owner_organization_id IS NULL;
    v_source := 'campanha';
    v_source_label := 'Preço aplicado pela campanha: ' || v_campanha_nome;
  ELSE
    -- 2) Tabela do parceiro
    SELECT ppp.preco_tabela INTO v_tabela
      FROM public.partner_product_prices ppp
     WHERE ppp.product_id = p_product_id AND ppp.partner_id = p_partner_id
       AND ppp.is_current AND ppp.ativo
     LIMIT 1;
    IF v_tabela IS NOT NULL THEN
      v_source := 'tabela_parceiro';
      v_source_label := 'Preço aplicado pela tabela comercial do parceiro';
    ELSE
      -- 3) Base do cadastro do produto: valor_ha_brl, ou derivado de valor_dose_brl / valor_litro_brl
      SELECT COALESCE(
        p.valor_ha_brl,
        CASE WHEN p.valor_dose_brl IS NOT NULL AND p.dose_ml_ha IS NOT NULL AND p.dose_ml_ha > 0
             THEN ROUND(p.valor_dose_brl * (p.dose_ml_ha/100.0), 2) END,
        CASE WHEN p.valor_litro_brl IS NOT NULL AND p.dose_ml_ha IS NOT NULL AND p.dose_ml_ha > 0
             THEN ROUND((p.valor_litro_brl/10.0) * (p.dose_ml_ha/100.0), 2) END,
        0
      ) INTO v_tabela
        FROM public.produtos p WHERE p.id = p_product_id AND p.owner_organization_id IS NULL;
      v_source := 'base';
      v_source_label := 'Preço base do produto';
    END IF;
  END IF;

  v_tabela := COALESCE(v_tabela, 0);
  v_final := ROUND(v_tabela * (1 - COALESCE(p_desconto,0)/100), 2);
  v_total := ROUND(v_final * p_quantidade, 2);
  v_custo := ROUND(v_tabela * 0.55, 2);

  RETURN jsonb_build_object(
    'preco_tabela', v_tabela,
    'desconto_pct', COALESCE(p_desconto,0),
    'preco_final', v_final,
    'quantidade', p_quantidade,
    'valor_total', v_total,
    'custo_estimado_unitario', v_custo,
    'margem_unitaria', v_final - v_custo,
    'margem_pct', CASE WHEN v_final > 0 THEN ROUND(((v_final - v_custo)/v_final)*100, 2) ELSE 0 END,
    'rentabilidade_total', ROUND((v_final - v_custo) * p_quantidade, 2),
    'price_source', v_source,
    'price_source_label', v_source_label,
    'campanha_nome', v_campanha_nome
  );
END $function$;
DO $p$
DECLARE v_oid regprocedure := 'public.fn_resolve_commercial_price(text, uuid, uuid, uuid, uuid, uuid, text, numeric, date, numeric)'::regprocedure; v_def text;
BEGIN
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> '0df0d9005d46b667db4433d3eae59e27' THEN RAISE EXCEPTION 'ownership10_drift:public.fn_resolve_commercial_price'; END IF;
END $p$;
CREATE OR REPLACE FUNCTION public.fn_resolve_commercial_price(p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_plan_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric, p_ref_date date DEFAULT CURRENT_DATE, p_quantity numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan record; v_rule record; v_quote record;
  v_mode text; v_base numeric(18,6); v_src text; v_unit numeric(14,2);
  v_disc numeric(9,4) := 0; v_disc_src text := 'plan';
  v_ref date := COALESCE(p_ref_date, current_date);
  v_minq numeric(14,3) := 0;
BEGIN
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 THEN
    RETURN jsonb_build_object('ok',false,'reason_code','ITEM_INVALID','quote_required',false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.produtos gp WHERE gp.id = p_product_id AND gp.owner_organization_id IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.microrganismos gm WHERE gm.id = p_microrganismo_id AND gm.owner_organization_id IS NULL) THEN
    RETURN jsonb_build_object('ok',false,'reason_code','ITEM_INVALID','quote_required',false);
  END IF;
  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN
    RETURN jsonb_build_object('ok',false,'reason_code','UNIT_INVALID','quote_required',false);
  END IF;
  IF p_unit_type = 'unidade' AND COALESCE(p_volume_ml,0) <= 0 THEN
    RETURN jsonb_build_object('ok',false,'reason_code','VOLUME_REQUIRED','quote_required',false);
  END IF;
  IF p_plan_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason_code','PLAN_REQUIRED','quote_required',false);
  END IF;
  IF p_quantity IS NOT NULL AND p_quantity <= 0 THEN
    RETURN jsonb_build_object('ok',false,'reason_code','QUANTITY_INVALID','quote_required',false);
  END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'reason_code','PLAN_NOT_FOUND','quote_required',false);
  END IF;
  IF NOT v_plan.active THEN
    RETURN jsonb_build_object('ok',false,'reason_code','PLAN_INACTIVE','quote_required',false);
  END IF;

  v_mode := COALESCE(v_plan.pricing_mode,'discount_from_base');

  IF v_mode = 'quote_only' THEN
    RETURN jsonb_build_object('ok',false,'reason_code','QUOTE_REQUIRED','quote_required',true,
      'pricing_mode','quote_only','price_source','quote_only','plan_id',p_plan_id,'currency','BRL',
      'base_price',NULL,'plan_discount_percent',NULL,'unit_price',NULL,'final_unit_price',NULL,
      'resolved_at', now());
  END IF;

  SELECT * INTO v_rule
  FROM public.commercial_price_rules r
  WHERE r.active
    AND r.pricing_mode = v_mode
    AND r.unit_type = p_unit_type
    AND r.volume_ml IS NOT DISTINCT FROM (CASE WHEN p_unit_type='unidade' THEN p_volume_ml ELSE NULL END)
    AND r.product_id IS NOT DISTINCT FROM p_product_id
    AND r.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
    AND r.valid_from <= v_ref
    AND (r.valid_until IS NULL OR r.valid_until >= v_ref)
    AND ( (p_buyer_scope='partner'  AND r.buyer_scope='partner'  AND r.partner_id  = p_partner_id)
       OR (p_buyer_scope='producer' AND r.buyer_scope='producer' AND r.customer_id = p_customer_id) )
    AND (r.plan_id IS NULL OR r.plan_id = p_plan_id)
    AND ( NOT EXISTS (SELECT 1 FROM public.commercial_condition_item_prices ip
                       WHERE ip.published_rule_id = r.id)
          OR EXISTS (SELECT 1 FROM public.commercial_payment_plan_assignments a
                      WHERE a.status = 'published'
                        AND a.plan_id = r.plan_id
                        AND a.buyer_scope = r.buyer_scope
                        AND a.partner_id IS NOT DISTINCT FROM r.partner_id
                        AND a.customer_id IS NOT DISTINCT FROM r.customer_id
                        AND a.valid_from <= v_ref
                        AND (a.valid_until IS NULL OR a.valid_until >= v_ref)) )
  ORDER BY (r.plan_id IS NOT NULL) DESC, r.valid_from DESC
  LIMIT 1;

  SELECT * INTO v_quote
  FROM public.commercial_price_rules r
  WHERE r.active AND r.pricing_mode = 'quote_only'
    AND r.unit_type = p_unit_type
    AND r.volume_ml IS NOT DISTINCT FROM (CASE WHEN p_unit_type='unidade' THEN p_volume_ml ELSE NULL END)
    AND r.product_id IS NOT DISTINCT FROM p_product_id
    AND r.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
    AND r.valid_from <= v_ref
    AND (r.valid_until IS NULL OR r.valid_until >= v_ref)
    AND ( (p_buyer_scope='partner'  AND r.buyer_scope='partner'  AND r.partner_id  = p_partner_id)
       OR (p_buyer_scope='producer' AND r.buyer_scope='producer' AND r.customer_id = p_customer_id) )
    AND (r.plan_id IS NULL OR r.plan_id = p_plan_id)
    AND ( NOT EXISTS (SELECT 1 FROM public.commercial_condition_item_prices ip
                       WHERE ip.published_rule_id = r.id)
          OR EXISTS (SELECT 1 FROM public.commercial_payment_plan_assignments a
                      WHERE a.status = 'published'
                        AND a.plan_id = r.plan_id
                        AND a.buyer_scope = r.buyer_scope
                        AND a.partner_id IS NOT DISTINCT FROM r.partner_id
                        AND a.customer_id IS NOT DISTINCT FROM r.customer_id
                        AND a.valid_from <= v_ref
                        AND (a.valid_until IS NULL OR a.valid_until >= v_ref)) )
  LIMIT 1;

  IF v_quote.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'reason_code','QUOTE_REQUIRED','quote_required',true,
      'pricing_mode','quote_only','price_source','quote_only','rule_id',v_quote.id,'plan_id',p_plan_id,
      'currency','BRL','base_price',NULL,'plan_discount_percent',NULL,
      'unit_price',NULL,'final_unit_price',NULL,'resolved_at', now());
  END IF;

  v_minq := COALESCE(v_rule.min_quantity, 0);
  IF v_minq > 0 THEN
    IF p_quantity IS NULL THEN
      RETURN jsonb_build_object('ok',false,'reason_code','QUANTITY_REQUIRED','quote_required',false,
        'min_quantity', v_minq, 'rule_id', v_rule.id, 'plan_id', p_plan_id, 'resolved_at', now());
    ELSIF p_quantity < v_minq THEN
      RETURN jsonb_build_object('ok',false,'reason_code','MIN_QUANTITY_NOT_MET','quote_required',false,
        'min_quantity', v_minq, 'quantity', p_quantity, 'rule_id', v_rule.id,
        'plan_id', p_plan_id, 'resolved_at', now());
    END IF;
  END IF;

  IF v_mode = 'fixed_item_price' THEN
    IF v_rule.id IS NULL THEN
      RETURN jsonb_build_object('ok',false,'reason_code','PRICE_RULE_MISSING','quote_required',false,
        'pricing_mode','fixed_item_price','price_source',NULL,'plan_id',p_plan_id,'currency','BRL',
        'base_price',NULL,'plan_discount_percent',NULL,'unit_price',NULL,'final_unit_price',NULL,
        'resolved_at', now());
    END IF;
    v_unit := round(v_rule.condition_price, 2);
    RETURN jsonb_build_object('ok',true,'reason_code','OK','quote_required',false,
      'pricing_mode','fixed_item_price','price_source','condition_fixed_price',
      'base_price', v_unit, 'condition_price', v_unit, 'plan_discount_percent', 0,
      'discount_source','none','min_quantity', v_minq,
      'unit_price', v_unit, 'final_unit_price', v_unit,
      'currency','BRL','rule_id',v_rule.id,'plan_id',p_plan_id,
      'valid_from',v_rule.valid_from,'valid_until',v_rule.valid_until,'resolved_at', now());
  END IF;

  v_disc := COALESCE(v_plan.discount_percent, 0);
  IF v_rule.id IS NOT NULL AND v_rule.discount_percent IS NOT NULL THEN
    v_disc := v_rule.discount_percent;
    v_disc_src := 'item_rule';
  END IF;

  IF p_buyer_scope = 'partner' THEN
    SELECT ppp.preco_tabela INTO v_base
    FROM public.partner_product_prices ppp
    WHERE ppp.partner_id = p_partner_id
      AND ppp.ativo
      AND ppp.product_id IS NOT DISTINCT FROM p_product_id
      AND ppp.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
      AND (ppp.valid_from IS NULL OR ppp.valid_from <= v_ref)
      AND (ppp.valid_until IS NULL OR ppp.valid_until >= v_ref)
    ORDER BY ppp.is_current DESC, ppp.valid_from DESC NULLS LAST
    LIMIT 1;
    IF COALESCE(v_base,0) > 0 THEN v_src := 'partner_base_price'; ELSE v_base := NULL; END IF;
  END IF;

  -- H3b: fonte canonica de preco comercial = catalogo_volumes (apresentacao ativa).
  IF v_base IS NULL THEN
    v_base := public.fn_catalogo_preco_canonico(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml);
    IF COALESCE(v_base,0) > 0 THEN v_src := 'catalog_volume_price'; ELSE v_base := NULL; END IF;
  END IF;

  -- Fallback legado documentado: mestre produtos/microrganismos (nao canonico).
  IF v_base IS NULL THEN
    IF p_product_id IS NOT NULL THEN
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN COALESCE(NULLIF(pr.valor_ha_brl,0), (pr.dose_ml_ha/100.0) * pr.valor_dose_brl)
               WHEN 'litro'   THEN COALESCE(NULLIF(pr.valor_litro_brl,0), pr.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(NULLIF(pr.valor_dose_brl,0), pr.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * COALESCE(NULLIF(pr.valor_litro_brl,0), pr.valor_dose_brl*10)
             END
        INTO v_base
      FROM public.produtos pr WHERE pr.id = p_product_id;
    ELSE
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN (mo.dose_ml_ha/100.0) * mo.valor_dose_brl
               WHEN 'litro'   THEN COALESCE(NULLIF(mo.valor_litro_brl,0), mo.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(NULLIF(mo.valor_dose_brl,0), mo.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * COALESCE(NULLIF(mo.valor_litro_brl,0), mo.valor_dose_brl*10)
             END
        INTO v_base
      FROM public.microrganismos mo WHERE mo.id = p_microrganismo_id;
    END IF;
    IF COALESCE(v_base,0) > 0 THEN v_src := 'catalog_base_price'; ELSE v_base := NULL; END IF;
  END IF;

  IF v_base IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason_code','ITEM_WITHOUT_PRICE','quote_required',false,
      'pricing_mode','discount_from_base','price_source',NULL,'plan_id',p_plan_id,'currency','BRL',
      'base_price',NULL,'plan_discount_percent',v_disc,'unit_price',NULL,'final_unit_price',NULL,
      'rule_id', v_rule.id, 'resolved_at', now());
  END IF;

  v_unit := round(v_base * (1 - v_disc/100.0), 2);
  IF v_unit <= 0 THEN
    RETURN jsonb_build_object('ok',false,'reason_code','ITEM_WITHOUT_PRICE','quote_required',false,
      'pricing_mode','discount_from_base','currency','BRL','plan_id',p_plan_id,'resolved_at', now());
  END IF;

  RETURN jsonb_build_object('ok',true,'reason_code','OK','quote_required',false,
    'pricing_mode','discount_from_base','price_source',v_src,
    'base_price', round(v_base,2), 'condition_price', NULL, 'plan_discount_percent', v_disc,
    'discount_source', v_disc_src, 'min_quantity', v_minq,
    'unit_price', v_unit, 'final_unit_price', v_unit,
    'currency','BRL','rule_id',v_rule.id,'plan_id',p_plan_id,
    'valid_from',v_rule.valid_from,'valid_until',v_rule.valid_until,'resolved_at', now());
END $function$;
DO $p$
DECLARE v_oid regprocedure := 'public.fn_b2b_resolve_base_unit_price(uuid, uuid, uuid, text, numeric, date)'::regprocedure; v_def text;
BEGIN
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> '60651fe823452436d807b9b175c3865c' THEN RAISE EXCEPTION 'ownership10_drift:public.fn_b2b_resolve_base_unit_price'; END IF;
END $p$;
CREATE OR REPLACE FUNCTION public.fn_b2b_resolve_base_unit_price(p_partner_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric DEFAULT NULL::numeric, p_ref_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref  date := COALESCE(p_ref_date, current_date);
  v_base numeric(18,6);
  v_src  text;
BEGIN
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'ITEM_INVALID');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.produtos gp WHERE gp.id = p_product_id AND gp.owner_organization_id IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.microrganismos gm WHERE gm.id = p_microrganismo_id AND gm.owner_organization_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'ITEM_INVALID');
  END IF;
  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'UNIT_INVALID');
  END IF;
  IF p_unit_type = 'unidade' AND COALESCE(p_volume_ml, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'VOLUME_REQUIRED');
  END IF;

  IF p_partner_id IS NOT NULL THEN
    SELECT ppp.preco_tabela INTO v_base
    FROM public.partner_product_prices ppp
    WHERE ppp.partner_id = p_partner_id
      AND ppp.ativo
      AND ppp.product_id IS NOT DISTINCT FROM p_product_id
      AND ppp.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
      AND (ppp.valid_from IS NULL OR ppp.valid_from <= v_ref)
      AND (ppp.valid_until IS NULL OR ppp.valid_until >= v_ref)
    ORDER BY ppp.is_current DESC, ppp.valid_from DESC NULLS LAST
    LIMIT 1;
    IF COALESCE(v_base, 0) > 0 THEN v_src := 'partner_base_price'; ELSE v_base := NULL; END IF;
  END IF;

  -- H3b: fonte canonica de preco comercial = catalogo_volumes (apresentacao ativa).
  IF v_base IS NULL THEN
    v_base := public.fn_catalogo_preco_canonico(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml);
    IF COALESCE(v_base,0) > 0 THEN v_src := 'catalog_volume_price'; ELSE v_base := NULL; END IF;
  END IF;

  -- Fallback legado documentado: mestre produtos/microrganismos (nao canonico).
  IF v_base IS NULL THEN
    IF p_product_id IS NOT NULL THEN
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN COALESCE(NULLIF(pr.valor_ha_brl,0), (pr.dose_ml_ha/100.0) * pr.valor_dose_brl)
               WHEN 'litro'   THEN COALESCE(NULLIF(pr.valor_litro_brl,0), pr.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(NULLIF(pr.valor_dose_brl,0), pr.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * COALESCE(NULLIF(pr.valor_litro_brl,0), pr.valor_dose_brl*10)
             END
        INTO v_base
      FROM public.produtos pr WHERE pr.id = p_product_id;
    ELSE
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN (mo.dose_ml_ha/100.0) * mo.valor_dose_brl
               WHEN 'litro'   THEN COALESCE(NULLIF(mo.valor_litro_brl,0), mo.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(NULLIF(mo.valor_dose_brl,0), mo.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * COALESCE(NULLIF(mo.valor_litro_brl,0), mo.valor_dose_brl*10)
             END
        INTO v_base
      FROM public.microrganismos mo WHERE mo.id = p_microrganismo_id;
    END IF;
    IF COALESCE(v_base, 0) > 0 THEN v_src := 'catalog_base_price'; ELSE v_base := NULL; END IF;
  END IF;

  IF v_base IS NULL OR v_base <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'ITEM_WITHOUT_PRICE');
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'reason_code', 'OK',
    'price_source', v_src,
    'base_price', round(v_base, 2),
    'currency', 'BRL',
    'resolved_at', now()
  );
END
$function$;
DO $p$
DECLARE v_oid regprocedure := 'public.fn_resolve_b2b_cart(uuid, uuid, jsonb, date)'::regprocedure; v_def text;
BEGIN
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> 'c8b4584475698835b786dacdf1e0fc14' THEN RAISE EXCEPTION 'ownership10_drift:public.fn_resolve_b2b_cart'; END IF;
END $p$;
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
        FROM public.produtos WHERE id = v_iid AND owner_organization_id IS NULL;
    ELSIF v_itipo = 'microrganismo' THEN
      SELECT nome, codigo, ativo, COALESCE(b2b_enabled,false) INTO v_nome, v_codigo, v_active, v_b2b
        FROM public.microrganismos WHERE id = v_iid AND owner_organization_id IS NULL;
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
DO $p$
DECLARE v_oid regprocedure := 'platform_private.b2b_save_technical_simulation(jsonb)'::regprocedure; v_def text;
BEGIN
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> 'daad3c1554f370bb0456b4ea3afdeea7' THEN RAISE EXCEPTION 'ownership10_drift:platform_private.b2b_save_technical_simulation'; END IF;
END $p$;
CREATE OR REPLACE FUNCTION platform_private.b2b_save_technical_simulation(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE u uuid:=auth.uid(); p uuid; s uuid; i jsonb; iid uuid; kind text; qty numeric; nm text; cl uuid;
BEGIN
 IF u IS NULL OR NOT public.has_role(u,'parceiro_b2b_tecnico') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 p:=(p_payload->>'partner_id')::uuid;
 IF NOT platform_private.b2b_phase1_partner_visible(p,true) THEN RAISE EXCEPTION 'scope_denied' USING ERRCODE='42501'; END IF;
 IF NOT public._saas_user_has_feature(u,'simulacoes') THEN RAISE EXCEPTION 'feature_not_entitled' USING ERRCODE='42501'; END IF;
 IF coalesce(p_payload->>'status','rascunho') NOT IN ('rascunho','enviada_gestor') THEN RAISE EXCEPTION 'invalid_status'; END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items')=0 THEN RAISE EXCEPTION 'empty_simulation'; END IF;
 cl:=nullif(p_payload->>'cliente_id','')::uuid;
 IF cl IS NOT NULL AND NOT (EXISTS (SELECT 1 FROM public.partner_user_clients puc WHERE puc.cliente_id=cl AND puc.user_id=u AND puc.partner_id=p AND puc.active=true) OR EXISTS (SELECT 1 FROM public.partner_technician_clients ptc WHERE ptc.cliente_id=cl AND ptc.technician_user_id=u AND ptc.partner_id=p AND ptc.active=true)) THEN RAISE EXCEPTION 'client_scope_denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.partner_simulations(partner_id,created_by,titulo,observacoes,cultura,area_total_ha,objetivo_tecnico,status,total_cheio,valid_until,cliente_id)
 VALUES(p,u,left(p_payload->>'titulo',200),left(p_payload->>'observacoes',4000),left(p_payload->>'cultura',200),(p_payload->>'area_total_ha')::numeric,left(p_payload->>'objetivo_tecnico',2000),'rascunho',0,(p_payload->>'valid_until')::date,cl) RETURNING id INTO s;
 FOR i IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
  iid:=(i->>'item_id')::uuid; kind:=i->>'item_tipo'; qty:=(i->>'quantidade')::numeric;
  IF qty IS NULL OR qty<=0 OR qty::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_qty'; END IF;
  IF kind='produto' THEN SELECT nome INTO nm FROM public.produtos WHERE id=iid AND ativo AND b2b_enabled AND owner_organization_id IS NULL;
  ELSIF kind='microrganismo' THEN SELECT nome INTO nm FROM public.microrganismos WHERE id=iid AND ativo AND b2b_enabled AND owner_organization_id IS NULL;
  ELSE RAISE EXCEPTION 'invalid_item'; END IF;
  IF nm IS NULL THEN RAISE EXCEPTION 'product_unavailable'; END IF;
  IF coalesce(i->>'unidade_medida','hectare') NOT IN ('hectare','litro','dose','unidade') THEN RAISE EXCEPTION 'invalid_unit'; END IF;
  IF i->>'unidade_medida'='unidade' AND coalesce((i->>'volume_ml')::numeric,0)<=0 THEN RAISE EXCEPTION 'invalid_volume'; END IF;
  INSERT INTO public.partner_simulation_items(simulation_id,item_tipo,item_id,nome,quantidade,valor_unitario_cheio,subtotal,unidade_medida,volume_ml,area_ha)
  VALUES(s,kind,iid,nm,qty,0,0,coalesce(i->>'unidade_medida','hectare'),(i->>'volume_ml')::numeric,(i->>'area_ha')::numeric);
 END LOOP;
 IF p_payload->>'status'='enviada_gestor' THEN PERFORM public.send_partner_simulation_to_manager_secure(s); END IF;
 RETURN s;
END $function$;
DO $p$
DECLARE v_oid regprocedure := 'public.rpc_associate_microorganism_fiscal_product(uuid, uuid)'::regprocedure; v_def text;
BEGIN
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> 'da0d679779e9d57558a3a203219b4afc' THEN RAISE EXCEPTION 'ownership10_drift:public.rpc_associate_microorganism_fiscal_product'; END IF;
END $p$;
CREATE OR REPLACE FUNCTION public.rpc_associate_microorganism_fiscal_product(p_microorganism_id uuid, p_product_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, product_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'administrador'::public.app_role)
    OR public.has_role(v_uid, 'financeiro'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_microorganism_id IS NULL THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.microrganismos m WHERE m.id = p_microorganism_id AND m.owner_organization_id IS NULL) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_product_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = p_product_id AND p.owner_organization_id IS NULL) THEN
      RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.microrganismos m
     SET product_id = p_product_id
   WHERE m.id = p_microorganism_id AND m.owner_organization_id IS NULL
  RETURNING m.id, m.product_id;
END;
$function$;
DO $p$
DECLARE v_oid regprocedure := 'public.rpc_regulatory_dossier_ensure_draft(uuid)'::regprocedure; v_def text;
BEGIN
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> '56076bccafd27aa8c95473ac38e73422' THEN RAISE EXCEPTION 'ownership10_drift:public.rpc_regulatory_dossier_ensure_draft'; END IF;
END $p$;
CREATE OR REPLACE FUNCTION public.rpc_regulatory_dossier_ensure_draft(p_microorganism_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_next int;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.microrganismos WHERE id = p_microorganism_id AND owner_organization_id IS NULL) THEN
    RAISE EXCEPTION 'REGULATORY_MICROORGANISM_NOT_FOUND' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('regulatory_dossier:'||p_microorganism_id::text, 0));

  SELECT id INTO v_id FROM public.microorganism_regulatory_dossiers
   WHERE microorganism_id = p_microorganism_id
     AND status IN ('DRAFT','PENDING_REVIEW') AND deleted_at IS NULL
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT coalesce(max(version),0)+1 INTO v_next
    FROM public.microorganism_regulatory_dossiers WHERE microorganism_id = p_microorganism_id;

  INSERT INTO public.microorganism_regulatory_dossiers
    (microorganism_id, version, status, created_by, updated_by)
  VALUES (p_microorganism_id, v_next, 'DRAFT', auth.uid(), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.microorganism_regulatory_checklist (dossier_id, item_key, state)
  SELECT v_id, k, 'PENDING' FROM unnest(ARRAY[
    'FINALIDADE_REGULATORIA','CEPA','FORMULACAO','GARANTIA_ROTULO','REGISTRO_MAPA',
    'TITULAR_FABRICANTE','NCM_CEST_TIPI','GTIN','UNIDADE_CONVERSAO','ORIGEM',
    'CFOP','TRIBUTACAO']) k
  ON CONFLICT (dossier_id, item_key) DO NOTHING;

  RETURN v_id;
END $function$;
DO $p$
DECLARE v_oid regprocedure := 'public.rpc_fiscal_draft_save(uuid, jsonb, jsonb, integer)'::regprocedure; v_def text;
BEGIN
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> '5e364c8f67c92fb31ff9568310eb876c' THEN RAISE EXCEPTION 'ownership10_drift:public.rpc_fiscal_draft_save'; END IF;
END $p$;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_draft_save(p_invoice_id uuid, p_invoice jsonb, p_items jsonb, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_user           uuid := auth.uid();
  v_row            public.fiscal_invoices;
  v_new_id         uuid;
  v_total          numeric(14,2) := 0;
  v_item           jsonb;
  v_seq            integer := 0;
  v_env            text;
  v_invoice_type   text;
  v_customer_id    uuid;
  v_qty            numeric;
  v_unit           numeric;
  v_gross          numeric;
  v_disc           numeric;
  v_net            numeric;
  v_kind           text;
  v_items_count    integer;
  v_emit_uf        text;
  v_dest_uf        text;
  v_freight_total  numeric := 0;
  v_insurance_total numeric := 0;
  v_other_total    numeric := 0;
  v_gross_arr      numeric[];
  v_fr_arr         numeric[];
  v_in_arr         numeric[];
  v_ot_arr         numeric[];
  v_computed_items jsonb := '[]'::jsonb;
  v_profile_snap   jsonb;
  v_tax_snap       jsonb;
  FORBIDDEN_KEYS   text[] := ARRAY[
    'sefaz_key','access_key','protocol_number','authorization_number',
    'authorized_at','authorization_xml','xml','pdf','signed_xml',
    'cancel_protocol','provider_response'
  ];
  k text;
BEGIN
  PERFORM public.h15_require_staff();
  IF p_invoice_id IS NOT NULL THEN PERFORM public.h15_require_invoice(p_invoice_id); END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_user, 'administrador'::app_role)
          OR public.has_role(v_user, 'financeiro'::app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object' THEN
    RAISE EXCEPTION 'invoice_object_required' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items_array_required' USING ERRCODE = '22023';
  END IF;

  IF public.fiscal_json_has_sensitive_key(p_invoice)
     OR public.fiscal_json_has_sensitive_key(p_items) THEN
    RAISE EXCEPTION 'sensitive_key_in_payload' USING ERRCODE = '22023';
  END IF;

  FOREACH k IN ARRAY FORBIDDEN_KEYS LOOP
    IF p_invoice ? k THEN
      RAISE EXCEPTION 'emission_field_forbidden' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_items_count := jsonb_array_length(p_items);
  IF v_items_count < 1 OR v_items_count > 500 THEN
    RAISE EXCEPTION 'items_count_out_of_range' USING ERRCODE = '22023';
  END IF;

  v_invoice_type := COALESCE(p_invoice->>'invoice_type','');
  IF v_invoice_type NOT IN ('NFE','NFSE') THEN
    RAISE EXCEPTION 'invoice_type_invalid' USING ERRCODE = '22023';
  END IF;

  v_env := COALESCE(p_invoice->>'environment','NOT_CONFIGURED');
  IF v_env NOT IN ('HOMOLOGATION','NOT_CONFIGURED') THEN
    RAISE EXCEPTION 'environment_not_allowed' USING ERRCODE = '22023';
  END IF;

  v_customer_id := NULLIF(p_invoice->>'customer_id','')::uuid;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = v_customer_id) THEN
    RAISE EXCEPTION 'customer_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- FASE C2/C3: UFs e encargos resolvidos no servidor (o cliente nao e autoridade).
  SELECT upper(coalesce(state,'')) INTO v_emit_uf
    FROM (SELECT * FROM public.company_fiscal_settings WHERE id = COALESCE((SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id),public.h15_active_company())) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  SELECT upper(coalesce(fiscal_state,'')) INTO v_dest_uf
    FROM public.customer_fiscal_profiles WHERE customer_id = v_customer_id;
  v_dest_uf := coalesce(nullif(v_dest_uf,''), v_emit_uf);

  v_freight_total   := round(coalesce(nullif(p_invoice->>'freight_value','')::numeric, 0), 2);
  v_insurance_total := round(coalesce(nullif(p_invoice->>'insurance_value','')::numeric, 0), 2);
  v_other_total     := round(coalesce(nullif(p_invoice->>'other_value','')::numeric, 0), 2);
  IF v_freight_total < 0 OR v_insurance_total < 0 OR v_other_total < 0 THEN
    RAISE EXCEPTION 'invoice_charges_negative' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_seq  := v_seq + 1;
    v_kind := COALESCE(v_item->>'item_kind','');
    IF v_invoice_type = 'NFE'  AND v_kind <> 'PRODUCT' THEN
      RAISE EXCEPTION 'nfe_requires_product_items' USING ERRCODE = '22023';
    END IF;
    IF v_invoice_type = 'NFSE' AND v_kind <> 'SERVICE' THEN
      RAISE EXCEPTION 'nfse_requires_service_items' USING ERRCODE = '22023';
    END IF;

    v_qty  := COALESCE(NULLIF(v_item->>'quantity','')::numeric, 0);
    v_unit := COALESCE(NULLIF(v_item->>'unit_value','')::numeric, 0);
    v_disc := COALESCE(NULLIF(v_item->>'discount_value','')::numeric, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'item_quantity_must_be_positive' USING ERRCODE = '22023';
    END IF;
    IF v_unit < 0 THEN
      RAISE EXCEPTION 'item_unit_value_negative' USING ERRCODE = '22023';
    END IF;
    IF v_disc < 0 THEN
      RAISE EXCEPTION 'item_discount_negative' USING ERRCODE = '22023';
    END IF;

    v_gross := round(v_qty * v_unit, 2);
    IF v_disc > v_gross THEN
      RAISE EXCEPTION 'item_discount_gt_gross' USING ERRCODE = '22023';
    END IF;
    v_net  := round(v_gross - v_disc, 2);

    -- 3.16.2-C: whitelist FAIL-CLOSED por item + verificação de source_item_id
    DECLARE
      v_item_profile jsonb := COALESCE(v_item->'fiscal_profile_snapshot', '{}'::jsonb);
      v_item_tax     jsonb := COALESCE(v_item->'tax_snapshot', '{}'::jsonb);
      v_item_input   jsonb := COALESCE(v_item->'tax_input_snapshot', '{}'::jsonb);
      v_source_id    uuid  := NULLIF(v_item->>'source_item_id','')::uuid;
      v_icms_obj     jsonb;
      v_pis_obj      jsonb;
      v_cofins_obj   jsonb;
      v_ipi_obj      jsonb;
      v_rate         numeric;
      v_pfp          public.product_fiscal_profiles%ROWTYPE;
      v_ncm_s        text;
      v_cest_s       text;
      v_orig_s       text;
      v_cfop_s       text;
      v_cst_s        text;
      v_csosn_s      text;
      v_withheld     jsonb;
      v_rets         jsonb;
    BEGIN
      IF jsonb_typeof(v_item_profile) <> 'object' THEN v_item_profile := '{}'::jsonb; END IF;
      IF jsonb_typeof(v_item_tax)     <> 'object' THEN v_item_tax     := '{}'::jsonb; END IF;
      IF jsonb_typeof(v_item_input)   <> 'object' THEN v_item_input   := '{}'::jsonb; END IF;
      IF NOT public.fn_fiscal_tax_input_valid(v_item_input) THEN
        RAISE EXCEPTION 'tax_input_snapshot_invalid:%', v_seq USING ERRCODE = '22023';
      END IF;
      IF public.fiscal_json_has_sensitive_key(v_item_profile)
         OR public.fiscal_json_has_sensitive_key(v_item_tax) THEN
        RAISE EXCEPTION 'sensitive_key_in_snapshot' USING ERRCODE = '22023';
      END IF;

      IF v_invoice_type = 'NFE' THEN
        -- Whitelist do perfil NF-e
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_profile,
          ARRAY['ncm','cest','cfop','origem_mercadoria','cst_icms','csosn','unidade'],
          'nfe_profile'
        );
        -- Whitelist da tributação NF-e (somente configuração preparatória)
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_tax, ARRAY['pis','cofins','ipi','icms'], 'nfe_tax'
        );
        v_icms_obj   := v_item_tax->'icms';
        v_pis_obj    := v_item_tax->'pis';
        v_cofins_obj := v_item_tax->'cofins';
        v_ipi_obj    := v_item_tax->'ipi';
        IF v_icms_obj IS NOT NULL THEN
          IF jsonb_typeof(v_icms_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_icms_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(
            v_icms_obj, ARRAY['cst','csosn','aliquota','base_calculo_modalidade'], 'nfe_tax.icms'
          );
        END IF;
        IF v_pis_obj IS NOT NULL THEN
          IF jsonb_typeof(v_pis_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_pis_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_pis_obj, ARRAY['cst','aliquota'], 'nfe_tax.pis');
        END IF;
        IF v_cofins_obj IS NOT NULL THEN
          IF jsonb_typeof(v_cofins_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_cofins_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_cofins_obj, ARRAY['cst','aliquota'], 'nfe_tax.cofins');
        END IF;
        IF v_ipi_obj IS NOT NULL THEN
          IF jsonb_typeof(v_ipi_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_ipi_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_ipi_obj, ARRAY['cst','aliquota'], 'nfe_tax.ipi');
        END IF;

        -- Verificação de existência do source_item_id (produto + perfil)
        IF v_source_id IS NOT NULL THEN
          IF NOT EXISTS (SELECT 1 FROM public.produtos pr WHERE pr.id = v_source_id AND pr.owner_organization_id IS NULL) THEN
            RAISE EXCEPTION 'source_item_product_not_found:%', v_seq USING ERRCODE = 'P0002';
          END IF;
          SELECT * INTO v_pfp FROM public.product_fiscal_profiles pfp
            WHERE pfp.product_id = v_source_id AND pfp.is_active = true LIMIT 1;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'source_item_product_profile_missing:%', v_seq USING ERRCODE = 'P0002';
          END IF;
        END IF;

        -- FASE C2: materializacao server-side dos snapshots fisicos do item.
        v_ncm_s   := nullif(btrim(coalesce(v_pfp.ncm,        v_item_profile->>'ncm',              '')), '');
        v_cest_s  := nullif(btrim(coalesce(v_pfp.cest,       v_item_profile->>'cest',             '')), '');
        v_orig_s  := nullif(btrim(coalesce(v_pfp.origin_code,v_item_profile->>'origem_mercadoria','')), '');
        v_cfop_s  := nullif(btrim(coalesce(
                        CASE WHEN v_dest_uf = v_emit_uf THEN v_pfp.cfop_in_state ELSE v_pfp.cfop_interstate END,
                        v_item_profile->>'cfop', '')), '');
        v_cst_s   := nullif(btrim(coalesce(v_pfp.icms_cst,   v_item_profile->>'cst_icms', '')), '');
        v_csosn_s := nullif(btrim(coalesce(v_pfp.icms_csosn, v_item_profile->>'csosn',    '')), '');
        IF v_ncm_s IS NULL THEN
          RAISE EXCEPTION 'item_ncm_unresolved:%', v_seq USING ERRCODE = '22023';
        END IF;
      ELSE
        -- NFS-e
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_profile,
          ARRAY['lc116_item','cnae','municipal_tax_code','national_tax_code','municipality_ibge_code'],
          'nfse_profile'
        );
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_tax, ARRAY['iss_rate','iss_withheld','retencoes_suportadas'], 'nfse_tax'
        );
        IF v_item_tax ? 'iss_rate' THEN
          IF jsonb_typeof(v_item_tax->'iss_rate') <> 'number' THEN
            RAISE EXCEPTION 'nfse_iss_rate_not_number' USING ERRCODE = '22023';
          END IF;
          v_rate := (v_item_tax->>'iss_rate')::numeric;
          IF v_rate < 0 OR v_rate > 100 THEN
            RAISE EXCEPTION 'nfse_iss_rate_out_of_range' USING ERRCODE = '22023';
          END IF;
        END IF;
        v_withheld := v_item_tax->'iss_withheld';
        IF v_withheld IS NOT NULL AND jsonb_typeof(v_withheld) <> 'boolean' THEN
          RAISE EXCEPTION 'nfse_iss_withheld_not_boolean' USING ERRCODE = '22023';
        END IF;
        v_rets := v_item_tax->'retencoes_suportadas';
        IF v_rets IS NOT NULL THEN
          IF jsonb_typeof(v_rets) <> 'object' THEN
            RAISE EXCEPTION 'nfse_retencoes_not_object' USING ERRCODE = '22023';
          END IF;
          PERFORM public.fiscal_validate_snapshot_keys(
            v_rets, ARRAY['pis','cofins','csll','irrf','inss'], 'nfse_tax.retencoes_suportadas'
          );
        END IF;

        IF v_source_id IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.service_fiscal_profiles sfp
            WHERE sfp.service_id = v_source_id AND sfp.is_active = true
          ) THEN
            RAISE EXCEPTION 'source_item_service_profile_missing:%', v_seq USING ERRCODE = 'P0002';
          END IF;
        END IF;
      END IF;

      v_computed_items := v_computed_items || jsonb_build_object(
        'seq', v_seq,
        'item_kind', v_kind,
        'description', COALESCE(v_item->>'description',''),
        'quantity', v_qty,
        'commercial_unit', v_item->>'commercial_unit',
        'unit_value', v_unit,
        'gross_value', v_gross,
        'discount_value', v_disc,
        'net_value', v_net,
        'source_item_type', v_item->>'source_item_type',
        'source_item_id',   NULLIF(v_item->>'source_item_id','')::uuid,
        'fiscal_profile_snapshot', v_item_profile,
        'tax_snapshot',            v_item_tax,
        'tax_input_snapshot',      v_item_input,
        'ncm_snapshot',       v_ncm_s,
        'cest_snapshot',      v_cest_s,
        'origem_snapshot',    v_orig_s,
        'cfop_snapshot',      v_cfop_s,
        'cst_icms_snapshot',  v_cst_s,
        'csosn_snapshot',     v_csosn_s
      );
    END;
    v_total := v_total + v_net;
  END LOOP;

  -- FASE C3: rateio canonico server-side, proporcional ao valor bruto, sem perder centavos.
  SELECT array_agg((it->>'gross_value')::numeric ORDER BY (it->>'seq')::integer)
    INTO v_gross_arr FROM jsonb_array_elements(v_computed_items) it;
  v_fr_arr := public.fn_fiscal_apportion_v1(v_freight_total,   v_gross_arr);
  v_in_arr := public.fn_fiscal_apportion_v1(v_insurance_total, v_gross_arr);
  v_ot_arr := public.fn_fiscal_apportion_v1(v_other_total,     v_gross_arr);
  v_total := round(v_total + v_freight_total + v_insurance_total + v_other_total, 2);

  v_profile_snap := COALESCE(p_invoice->'fiscal_profile_snapshot', '{}'::jsonb);
  v_tax_snap     := COALESCE(p_invoice->'tax_snapshot', '{}'::jsonb);
  IF jsonb_typeof(v_profile_snap) <> 'object' THEN v_profile_snap := '{}'::jsonb; END IF;
  IF jsonb_typeof(v_tax_snap)     <> 'object' THEN v_tax_snap     := '{}'::jsonb; END IF;
  IF public.fiscal_json_has_sensitive_key(v_profile_snap)
     OR public.fiscal_json_has_sensitive_key(v_tax_snap) THEN
    RAISE EXCEPTION 'sensitive_key_in_snapshot' USING ERRCODE = '22023';
  END IF;

  IF p_invoice_id IS NULL THEN
    INSERT INTO public.fiscal_invoices (company_settings_id, 
      invoice_type, document_model, document_origin, environment, provider,
      status, normalized_status, series, issue_date, notes,
      company_cnpj, customer_id, receivable_id, delivery_id,
      customer_snapshot, company_snapshot, fiscal_totals_snapshot,
      fiscal_profile_snapshot, tax_snapshot,
      draft_version, created_by, total_amount
    ) VALUES (public.h15_active_company(), 
      v_invoice_type,
      p_invoice->>'document_model',
      'MANUAL_RECORD',
      v_env,
      'NONE',
      'DRAFT',
      'DRAFT',
      p_invoice->>'series',
      NULLIF(p_invoice->>'issue_date','')::date,
      p_invoice->>'notes',
      p_invoice->>'company_cnpj',
      v_customer_id,
      NULLIF(p_invoice->>'receivable_id','')::uuid,
      NULLIF(p_invoice->>'delivery_id','')::uuid,
      COALESCE(p_invoice->'customer_snapshot','{}'::jsonb),
      COALESCE(p_invoice->'company_snapshot','{}'::jsonb),
      jsonb_build_object('total_net', v_total, 'vFrete', v_freight_total, 'vSeg', v_insurance_total, 'vOutro', v_other_total, 'computed_at', now()),
      v_profile_snap,
      v_tax_snap,
      1,
      v_user,
      v_total
    ) RETURNING id INTO v_new_id;
  ELSE
    SELECT * INTO v_row FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;
    IF v_row.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'invoice_locked' USING ERRCODE = '55006';
    END IF;
    IF v_row.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'invoice_not_editable' USING ERRCODE = '22023';
    END IF;
    IF v_row.provider <> 'NONE' THEN
      RAISE EXCEPTION 'invoice_has_provider' USING ERRCODE = '22023';
    END IF;
    IF v_row.document_origin <> 'MANUAL_RECORD' THEN
      RAISE EXCEPTION 'invoice_origin_forbidden' USING ERRCODE = '22023';
    END IF;
    IF v_row.draft_version <> p_expected_version THEN
      RAISE EXCEPTION 'conflict' USING ERRCODE = '40001';
    END IF;

    UPDATE public.fiscal_invoices SET
      invoice_type      = v_invoice_type,
      document_model    = COALESCE(p_invoice->>'document_model', document_model),
      document_origin   = 'MANUAL_RECORD',
      environment       = v_env,
      provider          = 'NONE',
      status            = 'DRAFT',
      normalized_status = 'DRAFT',
      series            = COALESCE(p_invoice->>'series', series),
      issue_date        = COALESCE(NULLIF(p_invoice->>'issue_date','')::date, issue_date),
      notes             = COALESCE(p_invoice->>'notes', notes),
      customer_id       = v_customer_id,
      customer_snapshot = COALESCE(p_invoice->'customer_snapshot', customer_snapshot),
      fiscal_profile_snapshot = v_profile_snap,
      tax_snapshot            = v_tax_snap,
      fiscal_totals_snapshot  = jsonb_build_object('total_net', v_total, 'vFrete', v_freight_total, 'vSeg', v_insurance_total, 'vOutro', v_other_total, 'computed_at', now()),
      total_amount            = v_total,
      draft_version           = draft_version + 1,
      updated_at              = now()
    WHERE id = p_invoice_id;
    v_new_id := p_invoice_id;
  END IF;

  DELETE FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = v_new_id;

  INSERT INTO public.fiscal_invoice_items (
    fiscal_invoice_id, item_sequence, item_kind, description,
    quantity, commercial_unit, unit_value, gross_value, discount_value, net_value,
    source_item_type, source_item_id,
    fiscal_profile_snapshot, tax_snapshot, tax_input_snapshot,
    ncm_snapshot, cest_snapshot, origem_snapshot, cfop_snapshot,
    cst_icms_snapshot, csosn_snapshot,
    freight_value, insurance_value, other_value
  )
  SELECT
    v_new_id,
    (it->>'seq')::integer,
    it->>'item_kind',
    it->>'description',
    (it->>'quantity')::numeric,
    it->>'commercial_unit',
    (it->>'unit_value')::numeric,
    (it->>'gross_value')::numeric,
    (it->>'discount_value')::numeric,
    (it->>'net_value')::numeric,
    it->>'source_item_type',
    NULLIF(it->>'source_item_id','')::uuid,
    COALESCE(it->'fiscal_profile_snapshot','{}'::jsonb),
    COALESCE(it->'tax_snapshot','{}'::jsonb),
    COALESCE(it->'tax_input_snapshot','{}'::jsonb),
    it->>'ncm_snapshot',
    it->>'cest_snapshot',
    it->>'origem_snapshot',
    it->>'cfop_snapshot',
    it->>'cst_icms_snapshot',
    it->>'csosn_snapshot',
    COALESCE(v_fr_arr[(it->>'seq')::integer], 0),
    COALESCE(v_in_arr[(it->>'seq')::integer], 0),
    COALESCE(v_ot_arr[(it->>'seq')::integer], 0)
  FROM jsonb_array_elements(v_computed_items) AS it;

  SELECT * INTO v_row FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = v_new_id;
  RETURN jsonb_build_object(
    'id',            v_row.id,
    'draft_version', v_row.draft_version,
    'total_amount',  v_row.total_amount
  );
END;
$function$;
COMMIT;
