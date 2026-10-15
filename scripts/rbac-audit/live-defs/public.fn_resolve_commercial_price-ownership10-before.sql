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
