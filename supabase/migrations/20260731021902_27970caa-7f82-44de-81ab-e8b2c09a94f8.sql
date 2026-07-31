-- FASE E — correção obrigatória (staging ikaauvsflpmamgxmkhoq)

-- 1) min_quantity canônico
ALTER TABLE public.commercial_price_rules
  ADD COLUMN IF NOT EXISTS min_quantity numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE public.commercial_price_rules
  DROP CONSTRAINT IF EXISTS cpr_min_quantity_nonneg;
ALTER TABLE public.commercial_price_rules
  ADD CONSTRAINT cpr_min_quantity_nonneg CHECK (min_quantity >= 0);

-- 2) tabela canônica somente leitura para o app
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.commercial_price_rules FROM authenticated;
GRANT SELECT ON public.commercial_price_rules TO authenticated;
GRANT ALL ON public.commercial_price_rules TO service_role;
DROP POLICY IF EXISTS cpr_pricing_authority_write ON public.commercial_price_rules;

-- 3) publicação projeta min_quantity
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
       pricing_mode,condition_price,discount_percent,min_quantity,currency,valid_from,valid_until,active,motivo,
       created_by,updated_by)
    VALUES (r.buyer_scope,r.partner_id,r.customer_id,r.plan_id,r.product_id,r.microrganismo_id,
       r.unit_type,r.volume_ml,r.pricing_mode,
       CASE WHEN r.pricing_mode='fixed_item_price' THEN r.condition_price ELSE NULL END,
       CASE WHEN r.pricing_mode='discount_from_base' THEN r.discount_percent ELSE NULL END,
       COALESCE(r.min_quantity,0),
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

-- 4) resolver: quantidade + assignment publicado/vigente
CREATE OR REPLACE FUNCTION public.fn_resolve_commercial_price(
  p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_plan_id uuid,
  p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric,
  p_ref_date date DEFAULT CURRENT_DATE, p_quantity numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
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
END $$;

-- 5) carrinho canônico passa quantidade
CREATE OR REPLACE FUNCTION public.fn_resolve_b2b_cart(p_partner_id uuid, p_plan_id uuid, p_items jsonb, p_ref_date date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
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
END $$;

-- 6) entradas seguras repassam quantidade
CREATE OR REPLACE FUNCTION public.rpc_resolve_commercial_prices(p_items jsonb, p_plan_id uuid, p_ref_date date DEFAULT CURRENT_DATE, p_buyer jsonb DEFAULT NULL::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_staff boolean; v_scope text; v_partner uuid; v_cnt int;
  v_item jsonb; v_res jsonb; v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='P0001'; END IF;

  v_is_staff := public.has_role(v_uid,'administrador')
             OR public.has_role(v_uid,'financeiro')
             OR public.has_role(v_uid,'gestor_comercial');

  IF v_is_staff THEN
    v_scope := COALESCE(p_buyer->>'buyer_scope','partner');
    IF v_scope <> 'partner' OR NULLIF(p_buyer->>'customer_id','') IS NOT NULL THEN
      RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
    END IF;
    v_partner := NULLIF(p_buyer->>'partner_id','')::uuid;
  ELSIF public.has_role(v_uid,'parceiro_b2b') THEN
    IF NULLIF(p_buyer->>'customer_id','') IS NOT NULL THEN
      RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
    END IF;
    SELECT count(*) INTO v_cnt FROM public.partner_users WHERE user_id = v_uid;
    IF v_cnt <> 1 THEN RAISE EXCEPTION 'partner_link_ambiguous' USING ERRCODE='P0001'; END IF;
    SELECT partner_id INTO v_partner FROM public.partner_users WHERE user_id = v_uid;
    v_scope := 'partner';
  ELSIF public.has_role(v_uid,'cliente_produtor') THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
  ELSE
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE='P0001';
  END IF;

  IF v_partner IS NULL THEN RAISE EXCEPTION 'buyer_required' USING ERRCODE='P0001'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb))
  LOOP
    v_res := public.fn_resolve_commercial_price(
      'partner', v_partner, NULL, p_plan_id,
      NULLIF(v_item->>'product_id','')::uuid,
      NULLIF(v_item->>'microrganismo_id','')::uuid,
      v_item->>'unit_type',
      NULLIF(v_item->>'volume_ml','')::numeric,
      COALESCE(p_ref_date, current_date),
      NULLIF(v_item->>'quantity','')::numeric);
    v_out := v_out || jsonb_build_array(v_res || jsonb_build_object('item_ref', v_item->>'item_ref'));
  END LOOP;

  RETURN jsonb_build_object('buyer_scope','partner','plan_id',p_plan_id,
                            'ref_date',COALESCE(p_ref_date,current_date),'items',v_out);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_cc_simulate_price(
  p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_plan_id uuid,
  p_product_id uuid, p_microrganismo_id uuid, p_unit_type text,
  p_volume_ml numeric DEFAULT NULL, p_ref_date date DEFAULT CURRENT_DATE,
  p_quantity numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN public.fn_resolve_commercial_price(p_buyer_scope,p_partner_id,p_customer_id,p_plan_id,
    p_product_id,p_microrganismo_id,p_unit_type,p_volume_ml,p_ref_date,p_quantity);
END $$;

-- 7) ACL: helpers internos não executáveis pelo app
REVOKE ALL ON FUNCTION public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cc_validate_item_input(uuid,text,numeric,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cc_audit(text,uuid,text,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cc_can_prepare(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cc_can_publish(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_b2b_order_billing_eligibility(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_b2b_order_billing_eligibility(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric) TO service_role;

-- pontos de entrada oficiais
GRANT EXECUTE ON FUNCTION public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cc_simulate_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_cc_simulate_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date) FROM PUBLIC, anon, authenticated;