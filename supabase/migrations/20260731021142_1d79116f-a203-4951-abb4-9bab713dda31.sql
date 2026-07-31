-- FASE E — correções de consistência das fases B–D (staging ikaauvsflpmamgxmkhoq)

-- 1) Superfície de escrita: apenas RPCs SECURITY DEFINER
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.commercial_payment_plan_assignments,
     public.commercial_condition_item_prices,
     public.commercial_condition_audit_log,
     public.fiscal_operation_policies,
     public.fiscal_requirement_exemptions
  FROM authenticated;

GRANT SELECT ON public.commercial_payment_plan_assignments TO authenticated;
GRANT SELECT ON public.commercial_condition_item_prices TO authenticated;
GRANT SELECT ON public.commercial_condition_audit_log TO authenticated;
GRANT SELECT ON public.fiscal_operation_policies TO authenticated;
GRANT SELECT ON public.fiscal_requirement_exemptions TO authenticated;

DROP POLICY IF EXISTS cppa_admin_manage ON public.commercial_payment_plan_assignments;
DROP POLICY IF EXISTS ccip_admin_manage ON public.commercial_condition_item_prices;
DROP POLICY IF EXISTS fop_admin_manage ON public.fiscal_operation_policies;
DROP POLICY IF EXISTS fre_admin_manage ON public.fiscal_requirement_exemptions;

CREATE POLICY cppa_admin_read ON public.commercial_payment_plan_assignments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro')
         OR public.has_role(auth.uid(),'gestor_comercial'));

CREATE POLICY ccip_admin_read ON public.commercial_condition_item_prices
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro')
         OR public.has_role(auth.uid(),'gestor_comercial'));

CREATE POLICY fop_admin_read ON public.fiscal_operation_policies
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'));

CREATE POLICY fre_admin_read ON public.fiscal_requirement_exemptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'));

-- 2) Desconto por item na matriz canônica
ALTER TABLE public.commercial_price_rules
  ADD COLUMN IF NOT EXISTS discount_percent numeric(9,4);

ALTER TABLE public.commercial_price_rules
  DROP CONSTRAINT IF EXISTS cpr_discount_percent_range;
ALTER TABLE public.commercial_price_rules
  ADD CONSTRAINT cpr_discount_percent_range
  CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));

-- 2.1) Publicação projeta o desconto do item
CREATE OR REPLACE FUNCTION public.rpc_cc_publish_item_prices(p_ids uuid[], p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_rule uuid; v_count int := 0;
BEGIN
  IF NOT public.fn_cc_can_publish(auth.uid()) THEN RAISE EXCEPTION 'not_authorized_publish'; END IF;
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RAISE EXCEPTION 'no_items'; END IF;

  FOR r IN SELECT * FROM public.commercial_condition_item_prices
            WHERE id = ANY(p_ids) AND status IN ('draft','pending_approval') FOR UPDATE
  LOOP
    IF r.buyer_scope = 'default' THEN RAISE EXCEPTION 'default_scope_not_publishable'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.commercial_payment_plan_assignments a
                    WHERE a.status='published' AND a.plan_id=r.plan_id
                      AND a.buyer_scope=r.buyer_scope
                      AND a.partner_id IS NOT DISTINCT FROM r.partner_id
                      AND a.customer_id IS NOT DISTINCT FROM r.customer_id) THEN
      RAISE EXCEPTION 'assignment_not_published';
    END IF;

    UPDATE public.commercial_price_rules
       SET active=false, updated_by=auth.uid(), updated_at=now()
     WHERE active
       AND plan_id = r.plan_id AND buyer_scope = r.buyer_scope
       AND partner_id IS NOT DISTINCT FROM r.partner_id
       AND customer_id IS NOT DISTINCT FROM r.customer_id
       AND product_id IS NOT DISTINCT FROM r.product_id
       AND microrganismo_id IS NOT DISTINCT FROM r.microrganismo_id
       AND unit_type = r.unit_type
       AND volume_ml IS NOT DISTINCT FROM r.volume_ml;

    INSERT INTO public.commercial_price_rules
      (buyer_scope,partner_id,customer_id,plan_id,product_id,microrganismo_id,unit_type,volume_ml,
       pricing_mode,condition_price,discount_percent,currency,valid_from,valid_until,active,motivo,
       created_by,updated_by)
    VALUES (r.buyer_scope,r.partner_id,r.customer_id,r.plan_id,r.product_id,r.microrganismo_id,
       r.unit_type,r.volume_ml,r.pricing_mode,
       CASE WHEN r.pricing_mode='fixed_item_price' THEN r.condition_price ELSE NULL END,
       CASE WHEN r.pricing_mode='discount_from_base' THEN r.discount_percent ELSE NULL END,
       COALESCE(r.currency,'BRL'),r.valid_from,r.valid_until,true,
       COALESCE(p_motivo, r.motivo), auth.uid(), auth.uid())
    RETURNING id INTO v_rule;

    UPDATE public.commercial_condition_item_prices
       SET status='published', published_by=auth.uid(), published_at=now(),
           published_rule_id=v_rule, updated_by=auth.uid()
     WHERE id = r.id;

    PERFORM public.fn_cc_audit('item_price', r.id, 'publish', to_jsonb(r),
      jsonb_build_object('price_rule_id', v_rule), p_motivo);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('published', v_count);
END $$;

-- 2.2) Resolver: desconto do item tem precedência sobre o desconto do plano
CREATE OR REPLACE FUNCTION public.fn_resolve_commercial_price(
  p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_plan_id uuid,
  p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric,
  p_ref_date date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_plan record; v_rule record; v_quote record;
  v_mode text; v_base numeric(18,6); v_src text; v_unit numeric(14,2);
  v_disc numeric(9,4) := 0; v_disc_src text := 'plan';
  v_ref date := COALESCE(p_ref_date, current_date);
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
  LIMIT 1;

  IF v_quote.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'reason_code','QUOTE_REQUIRED','quote_required',true,
      'pricing_mode','quote_only','price_source','quote_only','rule_id',v_quote.id,'plan_id',p_plan_id,
      'currency','BRL','base_price',NULL,'plan_discount_percent',NULL,
      'unit_price',NULL,'final_unit_price',NULL,'resolved_at', now());
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
      'discount_source','none',
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
    'discount_source', v_disc_src,
    'unit_price', v_unit, 'final_unit_price', v_unit,
    'currency','BRL','rule_id',v_rule.id,'plan_id',p_plan_id,
    'valid_from',v_rule.valid_from,'valid_until',v_rule.valid_until,'resolved_at', now());
END $$;

-- 3) Coerência fail-closed no cadastro da matriz
CREATE OR REPLACE FUNCTION public.fn_cc_validate_item_input(
  p_plan_id uuid, p_pricing_mode text, p_condition_price numeric, p_discount_percent numeric)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_plan_mode text;
BEGIN
  IF p_pricing_mode NOT IN ('fixed_item_price','discount_from_base','quote_only') THEN
    RAISE EXCEPTION 'invalid_pricing_mode';
  END IF;
  SELECT pricing_mode INTO v_plan_mode FROM public.commercial_payment_plans WHERE id = p_plan_id;
  IF v_plan_mode IS NULL THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF p_pricing_mode <> 'quote_only' AND p_pricing_mode <> v_plan_mode THEN
    RAISE EXCEPTION 'pricing_mode_conflicts_plan';
  END IF;
  IF p_pricing_mode = 'fixed_item_price' AND COALESCE(p_condition_price,0) <= 0 THEN
    RAISE EXCEPTION 'condition_price_required';
  END IF;
  IF p_pricing_mode = 'discount_from_base'
     AND p_discount_percent IS NOT NULL
     AND (p_discount_percent < 0 OR p_discount_percent > 100) THEN
    RAISE EXCEPTION 'discount_percent_out_of_range';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.fn_cc_validate_item_input(uuid,text,numeric,numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_cc_upsert_item_price(
  p_id uuid, p_assignment_id uuid, p_plan_id uuid, p_buyer_scope text, p_partner_id uuid,
  p_customer_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text,
  p_volume_ml numeric, p_min_quantity numeric, p_pricing_mode text, p_condition_price numeric,
  p_discount_percent numeric, p_valid_from date, p_valid_until date, p_is_exception boolean, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_before jsonb;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_is_exception AND (p_motivo IS NULL OR length(btrim(p_motivo))=0) THEN
    RAISE EXCEPTION 'motivo_required_for_exception';
  END IF;
  PERFORM public.fn_cc_validate_item_input(p_plan_id, p_pricing_mode, p_condition_price, p_discount_percent);

  IF p_id IS NULL THEN
    INSERT INTO public.commercial_condition_item_prices
      (assignment_id,plan_id,buyer_scope,partner_id,customer_id,product_id,microrganismo_id,
       unit_type,volume_ml,min_quantity,pricing_mode,condition_price,discount_percent,
       valid_from,valid_until,is_exception,motivo,created_by,updated_by)
    VALUES (p_assignment_id,p_plan_id,p_buyer_scope,p_partner_id,p_customer_id,p_product_id,p_microrganismo_id,
       p_unit_type,p_volume_ml,COALESCE(p_min_quantity,0),p_pricing_mode,p_condition_price,p_discount_percent,
       COALESCE(p_valid_from,CURRENT_DATE),p_valid_until,COALESCE(p_is_exception,false),p_motivo,auth.uid(),auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.fn_cc_audit('item_price',v_id,'create',NULL,
      to_jsonb((SELECT i FROM public.commercial_condition_item_prices i WHERE i.id=v_id)),p_motivo);
  ELSE
    SELECT to_jsonb(i) INTO v_before FROM public.commercial_condition_item_prices i WHERE i.id=p_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'item_price_not_found'; END IF;
    IF (v_before->>'status') NOT IN ('draft','pending_approval') THEN RAISE EXCEPTION 'item_price_not_editable'; END IF;
    UPDATE public.commercial_condition_item_prices
       SET assignment_id=p_assignment_id, plan_id=p_plan_id, buyer_scope=p_buyer_scope,
           partner_id=p_partner_id, customer_id=p_customer_id, product_id=p_product_id,
           microrganismo_id=p_microrganismo_id, unit_type=p_unit_type, volume_ml=p_volume_ml,
           min_quantity=COALESCE(p_min_quantity,0), pricing_mode=p_pricing_mode,
           condition_price=p_condition_price, discount_percent=p_discount_percent,
           valid_from=COALESCE(p_valid_from,valid_from), valid_until=p_valid_until,
           is_exception=COALESCE(p_is_exception,false), motivo=p_motivo, updated_by=auth.uid()
     WHERE id=p_id RETURNING id INTO v_id;
    PERFORM public.fn_cc_audit('item_price',v_id,'update',v_before,
      to_jsonb((SELECT i FROM public.commercial_condition_item_prices i WHERE i.id=v_id)),p_motivo);
  END IF;
  RETURN v_id;
END $$;