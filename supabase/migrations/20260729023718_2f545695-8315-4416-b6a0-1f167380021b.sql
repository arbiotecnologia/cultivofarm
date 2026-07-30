-- STAGING_GUARD normalizado (portatil / forward-only):
-- recusa apenas ambiente comprovadamente de PRODUCAO. Em banco novo (marker ausente)
-- a migration segue adiante, tornando o replay reprodutivel fora deste projeto.
DO $guard$
DECLARE v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NOT NULL THEN
    EXECUTE 'SELECT project_ref FROM public._fiscal_staging_marker WHERE marker = ''STAGING'' LIMIT 1'
      INTO v_ref;
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref de PRODUCAO recusado';
  END IF;
END
$guard$;

-- =====================================================================
-- 1. RESOLVER CANONICO (unico lugar com formula de preco unitario)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_resolve_commercial_price(
  p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_plan_id uuid,
  p_product_id uuid, p_microrganismo_id uuid, p_unit_type text,
  p_volume_ml numeric, p_ref_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan record;
  v_rule record;
  v_quote record;
  v_mode text;
  v_base numeric(18,6);
  v_src  text;
  v_unit numeric(14,2);
  v_disc numeric(9,4) := 0;
  v_ref  date := COALESCE(p_ref_date, current_date);
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

  -- PRIORIDADE 4 (plano) — sob consulta: nunca precifica
  IF v_mode = 'quote_only' THEN
    RETURN jsonb_build_object('ok',false,'reason_code','QUOTE_REQUIRED','quote_required',true,
      'pricing_mode','quote_only','price_source','quote_only','plan_id',p_plan_id,'currency','BRL',
      'base_price',NULL,'plan_discount_percent',NULL,'unit_price',NULL,'final_unit_price',NULL,
      'resolved_at', now());
  END IF;

  -- Regra vigente coerente com o modo do plano
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

  -- Regra explicita de "sob consulta" vence qualquer base
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

  -- PRIORIDADE 1 — preco fixo da condicao (obrigatorio quando o plano e fixed_item_price)
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
      'unit_price', v_unit, 'final_unit_price', v_unit,
      'currency','BRL','rule_id',v_rule.id,'plan_id',p_plan_id,
      'valid_from',v_rule.valid_from,'valid_until',v_rule.valid_until,'resolved_at', now());
  END IF;

  -- PRIORIDADE 2/3 — discount_from_base
  v_disc := COALESCE(v_plan.discount_percent, 0);

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
    'unit_price', v_unit, 'final_unit_price', v_unit,
    'currency','BRL','rule_id',v_rule.id,'plan_id',p_plan_id,
    'valid_from',v_rule.valid_from,'valid_until',v_rule.valid_until,'resolved_at', now());
END $function$;

-- =====================================================================
-- 2. RESOLUCAO DE CARRINHO (item -> linha) — unica fonte de agregacao
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_resolve_b2b_cart(
  p_partner_id uuid, p_plan_id uuid, p_items jsonb, p_ref_date date DEFAULT CURRENT_DATE)
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
      v_unidade, v_volume_ml, COALESCE(p_ref_date, current_date));

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

-- =====================================================================
-- 3. JUROS (unica formula)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_b2b_apply_interest(
  p_net numeric, p_interest_type text, p_monthly_pct numeric, p_months numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_interest_type = 'none' OR COALESCE(p_monthly_pct,0) = 0 OR COALESCE(p_months,0) = 0
      THEN ROUND(p_net,2)
    WHEN p_interest_type = 'simple'
      THEN ROUND(p_net * (1 + (p_monthly_pct/100.0) * p_months), 2)
    ELSE ROUND(p_net * POWER(1 + (p_monthly_pct/100.0), p_months), 2)
  END
$function$;

-- =====================================================================
-- 4. SIMULACAO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.simulate_b2b_payment_plan_secure(
  p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb, p_first_due_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean; v_is_finance boolean; v_is_gestor boolean;
  v_is_partner boolean; v_is_tech boolean; v_user_partner uuid;
  v_partner record; v_plan record; v_cart jsonb;
  v_table numeric(14,2); v_disc numeric(14,2); v_net numeric(14,2);
  v_interest numeric(14,2); v_final numeric(14,2);
  v_first_due date; v_installments integer;
  v_schedule jsonb := '[]'::jsonb; v_warnings jsonb := '[]'::jsonb;
  v_credit jsonb; v_inst numeric(14,2); v_accum numeric(14,2) := 0;
  v_amount_i numeric(14,2); v_principal_i numeric(14,2); v_interest_i numeric(14,2);
  v_due_i date; v_quote boolean; i integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  v_is_admin   := has_role(v_uid,'administrador'::app_role);
  v_is_finance := has_role(v_uid,'financeiro'::app_role);
  v_is_gestor  := has_role(v_uid,'gestor_comercial'::app_role);
  v_is_partner := has_role(v_uid,'parceiro_b2b'::app_role);
  v_is_tech    := has_role(v_uid,'parceiro_b2b_tecnico'::app_role);
  v_user_partner := public.get_user_partner_id();

  IF NOT (v_is_admin OR v_is_finance OR v_is_gestor) THEN
    IF NOT ((v_is_partner OR v_is_tech) AND v_user_partner IS NOT NULL AND v_user_partner = p_partner_id) THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
      VALUES (NULL, p_partner_id, v_uid, 'simulate_payment_plan_forbidden',
              jsonb_build_object('plan_id', p_payment_plan_id));
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  SELECT id, ativo INTO v_partner FROM public.partner_accounts WHERE id = p_partner_id;
  IF NOT FOUND OR v_partner.ativo = false THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;
  IF v_plan.monthly_interest_percent < 0 THEN RAISE EXCEPTION 'invalid_interest_rate'; END IF;
  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;

  v_cart  := public.fn_resolve_b2b_cart(p_partner_id, p_payment_plan_id, p_items, current_date);
  v_quote := COALESCE((v_cart->>'quote_required')::boolean,false);
  v_table := (v_cart->>'table_amount')::numeric;
  v_disc  := (v_cart->>'discount_amount')::numeric;
  v_net   := (v_cart->>'net_amount')::numeric;

  v_final    := CASE WHEN v_quote THEN 0
                     ELSE public.fn_b2b_apply_interest(v_net, v_plan.interest_type,
                            v_plan.monthly_interest_percent, v_plan.months_count) END;
  v_interest := ROUND(v_final - v_net, 2);

  IF p_first_due_date IS NOT NULL AND p_first_due_date < current_date THEN
    RAISE EXCEPTION 'invalid_due_date';
  END IF;
  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);
  IF v_first_due > current_date + v_plan.max_days AND NOT (v_is_admin OR v_is_finance OR v_is_gestor) THEN
    v_first_due := current_date + v_plan.max_days;
    v_warnings := v_warnings || jsonb_build_array('Data de vencimento ajustada ao limite do plano.');
  END IF;

  v_installments := GREATEST(COALESCE(v_plan.installment_count,1), 1);

  IF v_quote THEN
    v_warnings := v_warnings || to_jsonb('Condicao sob consulta: preco sera definido em cotacao.'::text);
  ELSIF v_installments = 1 THEN
    v_schedule := jsonb_build_array(jsonb_build_object(
      'installment_number',1,'due_date',v_first_due,'amount',v_final,
      'principal_amount',v_net,'interest_amount',v_interest));
  ELSE
    v_inst := ROUND(v_final / v_installments, 2);
    FOR i IN 1..v_installments LOOP
      IF i < v_installments THEN v_amount_i := v_inst; ELSE v_amount_i := ROUND(v_final - v_accum,2); END IF;
      v_accum := v_accum + v_amount_i;
      v_principal_i := ROUND(v_amount_i * (v_net / NULLIF(v_final,0)), 2);
      v_interest_i  := ROUND(v_amount_i - v_principal_i, 2);
      v_due_i := v_first_due + ((i-1) * 30);
      v_schedule := v_schedule || jsonb_build_array(jsonb_build_object(
        'installment_number', i, 'due_date', v_due_i, 'amount', v_amount_i,
        'principal_amount', v_principal_i, 'interest_amount', v_interest_i));
    END LOOP;
  END IF;

  IF v_plan.requires_financial_approval THEN
    v_warnings := v_warnings || to_jsonb('Plano exige aprovação financeira'::text); END IF;
  IF v_plan.requires_guarantee THEN
    v_warnings := v_warnings || to_jsonb('Plano exige garantia'::text); END IF;
  IF v_plan.requires_credit_approval THEN
    v_warnings := v_warnings || to_jsonb('Plano depende de limite de crédito'::text); END IF;
  IF NOT v_quote AND v_plan.minimum_order_amount IS NOT NULL AND v_table < v_plan.minimum_order_amount THEN
    v_warnings := v_warnings || to_jsonb('Pedido abaixo do valor mínimo para este plano'::text); END IF;

  BEGIN
    v_credit := public.fn_b2b_credit_exposure(p_partner_id, v_final, NULL);
    IF COALESCE((v_credit->>'tem_vencidos')::boolean,false) THEN
      v_warnings := v_warnings || to_jsonb('Parceiro possui saldo vencido'::text);
    END IF;
    IF COALESCE((v_credit->>'credit_limit')::numeric,0) > 0
       AND (v_credit->>'exposicao_projetada')::numeric > (v_credit->>'credit_limit')::numeric THEN
      v_warnings := v_warnings || to_jsonb('Pedido excede o limite de crédito projetado'::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
    'quote_required', v_quote,
    'items', v_cart->'lines',
    'payment_plan', jsonb_build_object(
      'id', v_plan.id, 'name', v_plan.name, 'code', v_plan.code,
      'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
      'discount_percent', v_plan.discount_percent,
      'monthly_interest_percent', v_plan.monthly_interest_percent,
      'months_count', v_plan.months_count,
      'installment_count', v_installments,
      'requires_financial_approval', v_plan.requires_financial_approval,
      'requires_credit_approval', v_plan.requires_credit_approval,
      'requires_guarantee', v_plan.requires_guarantee),
    'amounts', jsonb_build_object(
      'table_amount', v_table, 'discount_amount', v_disc,
      'net_amount_after_discount', v_net,
      'financial_interest_amount', v_interest, 'final_amount', v_final),
    'table_amount', v_table, 'discount_amount', v_disc,
    'net_amount_after_discount', v_net,
    'financial_interest_amount', v_interest, 'final_amount', v_final,
    'first_due_date', v_first_due,
    'schedule', v_schedule,
    'credit', v_credit,
    'warnings', v_warnings);
END $function$;

-- =====================================================================
-- 5. CRIACAO DE PEDIDO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_partner_order_secure(
  p_partner_id uuid, p_observacoes text DEFAULT NULL, p_items jsonb DEFAULT '[]'::jsonb,
  p_requested_delivery_date date DEFAULT NULL, p_payment_plan_id uuid DEFAULT NULL,
  p_first_due_date date DEFAULT NULL, p_installment_count integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean; v_is_finance boolean; v_is_gestor boolean; v_is_internal boolean;
  v_is_partner boolean; v_is_partner_tech boolean; v_user_partner uuid;
  v_order_id uuid; v_numero text; v_plan record; v_cart jsonb; v_line jsonb;
  v_quote boolean; v_table numeric(14,2); v_disc numeric(14,2); v_net numeric(14,2);
  v_interest numeric(14,2); v_final numeric(14,2);
  v_installments integer; v_first_due date; v_terms_id uuid;
  v_status partner_order_status; v_fin_status text; v_approval_status text;
  v_credit jsonb; v_block_reason text := NULL;
  v_inst numeric(14,2); v_accum numeric(14,2) := 0;
  v_amount_i numeric(14,2); v_principal_i numeric(14,2); v_interest_i numeric(14,2);
  v_due_i date; v_admin record; i integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;
  IF p_payment_plan_id IS NULL THEN RAISE EXCEPTION 'payment_plan_required'; END IF;

  v_is_admin        := has_role(v_uid,'administrador'::app_role);
  v_is_finance      := has_role(v_uid,'financeiro'::app_role);
  v_is_gestor       := has_role(v_uid,'gestor_comercial'::app_role);
  v_is_internal     := v_is_admin OR v_is_finance OR v_is_gestor;
  v_is_partner      := has_role(v_uid,'parceiro_b2b'::app_role);
  v_is_partner_tech := has_role(v_uid,'parceiro_b2b_tecnico'::app_role);
  v_user_partner    := public.get_user_partner_id();

  IF v_is_partner_tech AND NOT (v_is_internal OR v_is_partner) THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
      VALUES (NULL, p_partner_id, v_uid, 'partner_tech_cannot_create_order',
              jsonb_build_object('payment_plan_id', p_payment_plan_id));
    RAISE EXCEPTION 'partner_tech_cannot_create_order';
  END IF;

  IF NOT v_is_internal THEN
    IF NOT v_is_partner OR v_user_partner IS NULL OR v_user_partner <> p_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  PERFORM 1 FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;
  IF v_plan.monthly_interest_percent < 0 THEN RAISE EXCEPTION 'invalid_interest_rate'; END IF;
  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;

  -- inadimplencia: barreira antecipada (regra canonica unica)
  v_credit := public.fn_b2b_credit_exposure(p_partner_id, 0, NULL);
  IF COALESCE((v_credit->>'block_if_overdue')::boolean,false)
     AND COALESCE((v_credit->>'tem_vencidos')::boolean,false) THEN
    RAISE EXCEPTION 'credit_blocked_overdue';
  END IF;

  IF NOT v_is_internal THEN
    v_installments := GREATEST(COALESCE(v_plan.installment_count,1),1);
  ELSE
    IF p_installment_count IS NOT NULL AND p_installment_count <= 0 THEN
      RAISE EXCEPTION 'invalid_installment_count';
    END IF;
    v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);
  END IF;

  -- ===== resolucao canonica (mesma da simulacao) =====
  v_cart  := public.fn_resolve_b2b_cart(p_partner_id, p_payment_plan_id, p_items, current_date);
  v_quote := COALESCE((v_cart->>'quote_required')::boolean,false);
  v_table := (v_cart->>'table_amount')::numeric;
  v_disc  := (v_cart->>'discount_amount')::numeric;
  v_net   := (v_cart->>'net_amount')::numeric;
  v_final := CASE WHEN v_quote THEN 0
                  ELSE public.fn_b2b_apply_interest(v_net, v_plan.interest_type,
                         v_plan.monthly_interest_percent, v_plan.months_count) END;
  v_interest := ROUND(v_final - v_net, 2);

  IF NOT v_quote AND v_plan.minimum_order_amount IS NOT NULL AND v_table < v_plan.minimum_order_amount THEN
    RAISE EXCEPTION 'below_minimum_order_amount';
  END IF;

  IF p_first_due_date IS NOT NULL AND p_first_due_date < current_date THEN
    RAISE EXCEPTION 'invalid_due_date';
  END IF;
  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);

  IF v_plan.requires_financial_approval OR v_plan.requires_guarantee THEN
    v_fin_status := 'pending'; v_approval_status := 'pending';
  ELSE
    v_fin_status := 'not_required'; v_approval_status := 'not_required';
  END IF;

  IF v_first_due > current_date + v_plan.max_days THEN
    IF NOT v_is_internal OR NOT (v_plan.requires_financial_approval OR v_plan.requires_guarantee) THEN
      v_first_due := current_date + v_plan.max_days;
    ELSE
      v_fin_status := 'pending'; v_approval_status := 'pending';
    END IF;
  END IF;

  -- ===== decisao de credito ANTES de confirmar o status =====
  IF v_quote THEN
    v_status := 'aguardando_cotacao'::partner_order_status;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || p_partner_id::text, 0));
    v_credit := public.fn_b2b_credit_exposure(p_partner_id, v_final, NULL);

    IF COALESCE((v_credit->>'block_if_overdue')::boolean,false)
       AND COALESCE((v_credit->>'tem_vencidos')::boolean,false) THEN
      RAISE EXCEPTION 'credit_blocked_overdue';
    END IF;

    IF COALESCE((v_credit->>'credit_limit')::numeric,0) > 0
       AND (v_credit->>'exposicao_projetada')::numeric > (v_credit->>'credit_limit')::numeric THEN
      IF COALESCE(v_credit->>'credit_limit_action','block') = 'approval_required' THEN
        v_status := 'aguardando_aprovacao_credito'::partner_order_status;
        v_block_reason := 'limite_excedido';
      ELSE
        RAISE EXCEPTION 'credit_limit_exceeded';
      END IF;
    ELSE
      v_status := 'em_analise_comercial'::partner_order_status;
    END IF;
  END IF;

  -- ===== persistencia =====
  INSERT INTO public.partner_orders(
    partner_id, status, subtotal, desconto_total, total, observacoes, created_by,
    requested_delivery_date, ready_for_production, payment_plan_id, payment_condition_status,
    credit_block_reason
  ) VALUES (
    p_partner_id, v_status, 0, 0, 0, NULLIF(p_observacoes,''), v_uid,
    p_requested_delivery_date, false, p_payment_plan_id,
    CASE WHEN v_quote THEN 'quote_required' ELSE 'defined' END,
    v_block_reason
  ) RETURNING id, numero INTO v_order_id, v_numero;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_cart->'lines') LOOP
    INSERT INTO public.partner_order_items(
      order_id, product_id, microrganismo_id, quantidade, preco_unitario,
      desconto_percentual, subtotal, unidade_medida, volume_ml,
      produto_nome_snapshot, produto_codigo_snapshot,
      preco_tabela_snapshot, desconto_percentual_snapshot, preco_unitario_final_snapshot,
      pricing_mode_snapshot, price_source_snapshot, base_price_snapshot,
      condition_price_snapshot, plan_discount_percent_snapshot,
      unit_type_snapshot, volume_ml_snapshot, price_rule_id_snapshot
    ) VALUES (
      v_order_id,
      CASE WHEN v_line->>'item_tipo'='produto' THEN (v_line->>'item_id')::uuid END,
      CASE WHEN v_line->>'item_tipo'='microrganismo' THEN (v_line->>'item_id')::uuid END,
      (v_line->>'quantidade')::numeric,
      COALESCE((v_line->>'final_unit_price')::numeric, 0),
      COALESCE((v_line->>'plan_discount_percent')::numeric, 0),
      COALESCE((v_line->>'line_final_amount')::numeric, 0),
      v_line->>'unidade_medida',
      NULLIF(v_line->>'volume_ml','')::numeric,
      v_line->>'nome', v_line->>'codigo',
      COALESCE((v_line->>'base_price')::numeric, 0),
      COALESCE((v_line->>'plan_discount_percent')::numeric, 0),
      COALESCE((v_line->>'final_unit_price')::numeric, 0),
      v_line->>'pricing_mode', v_line->>'price_source',
      NULLIF(v_line->>'base_price','')::numeric,
      NULLIF(v_line->>'condition_price','')::numeric,
      NULLIF(v_line->>'plan_discount_percent','')::numeric,
      v_line->>'unidade_medida',
      NULLIF(v_line->>'volume_ml','')::numeric,
      NULLIF(v_line->>'rule_id','')::uuid
    );
  END LOOP;

  IF NOT v_quote THEN
    INSERT INTO public.partner_order_payment_terms(
      partner_order_id, payment_plan_id, plan_name_snapshot, plan_code_snapshot,
      discount_percent_snapshot, monthly_interest_percent_snapshot, months_count_snapshot,
      installment_count, first_due_date, interest_type_snapshot,
      table_amount, discount_amount, net_amount_after_discount,
      financial_interest_amount, final_amount, approval_status, created_by,
      pricing_mode_snapshot, credit_decision_snapshot
    ) VALUES (
      v_order_id, v_plan.id, v_plan.name, v_plan.code,
      v_plan.discount_percent, v_plan.monthly_interest_percent, v_plan.months_count,
      v_installments, v_first_due, v_plan.interest_type,
      v_table, v_disc, v_net, v_interest, v_final, v_approval_status, v_uid,
      COALESCE(v_plan.pricing_mode,'discount_from_base'), v_credit
    ) RETURNING id INTO v_terms_id;

    IF v_installments = 1 THEN
      INSERT INTO public.partner_order_payment_schedule(
        partner_order_id, payment_terms_id, installment_number, due_date,
        amount, principal_amount, interest_amount)
      VALUES (v_order_id, v_terms_id, 1, v_first_due, v_final, v_net, v_interest);
    ELSE
      v_inst := ROUND(v_final / v_installments, 2);
      FOR i IN 1..v_installments LOOP
        IF i < v_installments THEN v_amount_i := v_inst; ELSE v_amount_i := ROUND(v_final - v_accum,2); END IF;
        v_accum := v_accum + v_amount_i;
        v_principal_i := ROUND(v_amount_i * (v_net / NULLIF(v_final,0)), 2);
        v_interest_i  := ROUND(v_amount_i - v_principal_i, 2);
        v_due_i := v_first_due + ((i-1)*30);
        INSERT INTO public.partner_order_payment_schedule(
          partner_order_id, payment_terms_id, installment_number, due_date,
          amount, principal_amount, interest_amount)
        VALUES (v_order_id, v_terms_id, i, v_due_i, v_amount_i, v_principal_i, v_interest_i);
      END LOOP;
    END IF;
  END IF;

  UPDATE public.partner_orders SET
    subtotal = v_table, desconto_total = v_disc, total = v_final,
    payment_terms_id = v_terms_id,
    table_amount = v_table, commercial_discount_amount = v_disc,
    net_amount_after_discount = v_net, financial_interest_amount = v_interest,
    final_amount_with_interest = v_final,
    requires_financial_approval = (NOT v_quote AND (v_plan.requires_financial_approval OR v_plan.requires_guarantee)),
    financial_approval_status = CASE WHEN v_quote THEN 'not_required' ELSE v_fin_status END
  WHERE id = v_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_order_id, p_partner_id, v_uid, 'created_via_rpc',
          jsonb_build_object('numero', v_numero, 'total', v_final,
                             'items', jsonb_array_length(p_items),
                             'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
                             'quote_required', v_quote,
                             'credit_reason_code', v_credit->>'reason_code',
                             'requested_delivery_date', p_requested_delivery_date));

  IF NOT v_quote THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
    VALUES (v_order_id, p_partner_id, v_uid, 'payment_terms_defined',
            jsonb_build_object('payment_plan_id', v_plan.id, 'plan_code', v_plan.code,
              'table_amount', v_table, 'discount_amount', v_disc,
              'net_amount_after_discount', v_net, 'financial_interest_amount', v_interest,
              'final_amount', v_final, 'first_due_date', v_first_due,
              'installment_count', v_installments,
              'requires_financial_approval', (v_plan.requires_financial_approval OR v_plan.requires_guarantee)));
  END IF;

  IF COALESCE((v_credit->>'credit_limit')::numeric,0) <= 0 THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
    VALUES (v_order_id, p_partner_id, v_uid, 'credit_limit_not_defined',
            jsonb_build_object('reason_code', v_credit->>'reason_code',
                               'exposicao_projetada', v_credit->>'exposicao_projetada'));
  END IF;

  FOR v_admin IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
     WHERE ur.role IN ('administrador','gestor_comercial')
  LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_admin.user_id,
            CASE WHEN v_quote THEN 'pedido_b2b_cotacao' ELSE 'pedido_b2b_novo' END,
            CASE WHEN v_quote THEN 'Cotação B2B ' || v_numero ELSE 'Novo pedido B2B ' || v_numero END,
            CASE WHEN v_quote THEN 'Pedido sob consulta aguardando cotação comercial.'
                 ELSE 'Novo pedido B2B aguardando análise comercial. Total: R$ ' || to_char(v_final,'FM999G999G990D00') END,
            '/comercial/pedidos-b2b');
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_order_id, 'numero', v_numero,
    'status', v_status::text,
    'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
    'quote_required', v_quote,
    'subtotal', v_table, 'desconto_total', v_disc, 'total', v_final,
    'table_amount', v_table, 'discount_amount', v_disc,
    'net_amount_after_discount', v_net, 'financial_interest_amount', v_interest,
    'final_amount', v_final,
    'payment_terms_id', v_terms_id,
    'credit_reason_code', v_credit->>'reason_code',
    'credit_block_reason', v_block_reason,
    'requires_financial_approval', (NOT v_quote AND (v_plan.requires_financial_approval OR v_plan.requires_guarantee)),
    'financial_approval_status', CASE WHEN v_quote THEN 'not_required' ELSE v_fin_status END);
END $function$;

-- =====================================================================
-- 6. CONVERSAO DE SIMULACAO (revalida preco no servidor)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.convert_partner_simulation_to_order_secure(
  p_simulation_id uuid, p_observacoes text DEFAULT NULL, p_payment_plan_id uuid DEFAULT NULL,
  p_first_due_date date DEFAULT NULL, p_installment_count integer DEFAULT NULL,
  p_confirm_price_change boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean; v_is_partner_b2b boolean; v_is_tecnico boolean;
  v_user_partner uuid; v_sim record; v_partner_id uuid;
  v_items jsonb; v_result jsonb; v_order_id uuid;
  v_cart jsonb; v_new_table numeric(14,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_payment_plan_id IS NULL THEN RAISE EXCEPTION 'payment_plan_required'; END IF;

  v_is_admin := has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial');
  v_is_partner_b2b := has_role(v_uid,'parceiro_b2b');
  v_is_tecnico := has_role(v_uid,'parceiro_b2b_tecnico');

  IF v_is_tecnico AND NOT v_is_admin AND NOT v_is_partner_b2b THEN
    RAISE EXCEPTION 'forbidden_role_tecnico_cannot_convert';
  END IF;
  IF NOT (v_is_admin OR v_is_partner_b2b) THEN RAISE EXCEPTION 'forbidden_role'; END IF;

  SELECT * INTO v_sim FROM public.partner_simulations WHERE id = p_simulation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'simulation_not_found'; END IF;
  IF v_sim.status = 'convertida_pedido' THEN RAISE EXCEPTION 'already_converted'; END IF;
  IF v_sim.status NOT IN ('rascunho','enviada_gestor') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  v_partner_id := v_sim.partner_id;
  IF v_is_partner_b2b AND NOT v_is_admin THEN
    v_user_partner := get_user_partner_id();
    IF v_user_partner IS NULL OR v_user_partner <> v_partner_id THEN RAISE EXCEPTION 'forbidden_partner'; END IF;
  END IF;

  IF v_sim.valid_until IS NOT NULL AND v_sim.valid_until < current_date
     AND NOT p_confirm_price_change THEN
    RAISE EXCEPTION 'simulation_expired_requires_confirmation';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'item_id', item_id, 'item_tipo', item_tipo, 'quantidade', quantidade,
           'unidade_medida', COALESCE(unidade_medida,'hectare'), 'volume_ml', volume_ml)), '[]'::jsonb)
    INTO v_items
  FROM public.partner_simulation_items WHERE simulation_id = p_simulation_id;
  IF v_items = '[]'::jsonb THEN RAISE EXCEPTION 'empty_simulation'; END IF;

  -- Revalidacao autoritativa do preco no momento da conversao
  v_cart := public.fn_resolve_b2b_cart(v_partner_id, p_payment_plan_id, v_items, current_date);
  v_new_table := (v_cart->>'table_amount')::numeric;

  IF COALESCE(v_sim.total_cheio,0) > 0
     AND ABS(v_new_table - v_sim.total_cheio) > 0.01
     AND NOT p_confirm_price_change THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
    VALUES (NULL, v_partner_id, v_uid, 'conversion_price_changed_blocked',
            jsonb_build_object('simulation_id', p_simulation_id,
                               'simulated_table_amount', v_sim.total_cheio,
                               'current_table_amount', v_new_table));
    RAISE EXCEPTION 'price_changed_requires_confirmation: simulado=% atual=%',
      v_sim.total_cheio, v_new_table USING ERRCODE='P0001';
  END IF;

  v_result := public.create_partner_order_secure(
    v_partner_id, COALESCE(p_observacoes, v_sim.observacoes), v_items,
    NULL, p_payment_plan_id, p_first_due_date, p_installment_count);
  v_order_id := (v_result->>'id')::uuid;

  UPDATE public.partner_orders
     SET origin_simulation_id = p_simulation_id, cliente_id = v_sim.cliente_id
   WHERE id = v_order_id;

  UPDATE public.partner_simulations
     SET status='convertida_pedido', converted_order_id=v_order_id,
         converted_by=v_uid, converted_at=now(), updated_at=now()
   WHERE id = p_simulation_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_order_id, v_partner_id, v_uid, 'converted_from_simulation',
          jsonb_build_object('simulation_id', p_simulation_id, 'numero', v_result->>'numero',
                             'cliente_id', v_sim.cliente_id, 'total', v_result->>'total',
                             'price_change_confirmed', p_confirm_price_change));

  PERFORM public.insert_partner_catalog_access_log_internal(
    'simulation_converted_to_order', v_partner_id, v_uid, v_sim.cliente_id,
    p_simulation_id, v_order_id, NULL, jsonb_build_object('total', v_result->>'total'));

  RETURN v_order_id;
END $function$;

DROP FUNCTION IF EXISTS public.convert_partner_simulation_to_order_secure(uuid, text, uuid, date, integer);

-- =====================================================================
-- 7. GUARDS DOWNSTREAM
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_b2b_order_priceable(p_order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(po.status::text <> 'aguardando_cotacao'
              AND COALESCE(po.payment_condition_status,'') <> 'quote_required'
              AND COALESCE(po.final_amount_with_interest, po.total, 0) > 0
              AND EXISTS (SELECT 1 FROM public.partner_order_payment_terms t
                          WHERE t.partner_order_id = po.id AND t.final_amount > 0)
              AND NOT EXISTS (SELECT 1 FROM public.partner_order_items i
                              WHERE i.order_id = po.id
                                AND COALESCE(i.pricing_mode_snapshot,'') = 'quote_only'), false)
  FROM public.partner_orders po WHERE po.id = p_order_id
$function$;

CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure(p_partner_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $outer$
BEGIN
  IF NOT public.fn_b2b_order_priceable(p_partner_order_id) THEN
    RAISE EXCEPTION 'order_not_priceable_quote_required' USING ERRCODE='P0001';
  END IF;
  RETURN public.generate_b2b_receivable_secure_impl(p_partner_order_id);
END $outer$;