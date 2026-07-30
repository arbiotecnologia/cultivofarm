-- =====================================================================
-- MOTOR COMERCIAL B2B — FASE 1 / CORRECAO DE GATE
-- Operacional apenas: schema + RPC + grants. Nenhum harness, nenhum
-- UUID de usuario, nenhuma fixture. Testes vivem em supabase/tests/.
-- =====================================================================
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

-- ---------------------------------------------------------------------
-- 1. HASH CANONICO REFORCADO (v2) — substitui a versao de 3 argumentos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_b2b_cart_hash(
  p_partner_id uuid, p_plan_id uuid, p_cart jsonb, p_final numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  SELECT encode(sha256(convert_to(
    'v2|' || COALESCE(p_partner_id::text,'-') || '|' || COALESCE(p_plan_id::text,'-') || '|' ||
    to_char(ROUND(COALESCE(p_final,0),2),'FM9999999999990.00') || '|' ||
    COALESCE((
      SELECT string_agg(
        COALESCE(l->>'item_tipo','')      || '~' ||
        COALESCE(l->>'item_id','')        || '~' ||
        COALESCE(l->>'unidade_medida','') || '~' ||
        to_char(ROUND(COALESCE((l->>'volume_ml')::numeric,0),4),'FM9999999999990.0000') || '~' ||
        to_char(ROUND(COALESCE((l->>'quantidade')::numeric,0),4),'FM9999999999990.0000') || '~' ||
        COALESCE(l->>'pricing_mode','')   || '~' ||
        COALESCE(l->>'price_source','')   || '~' ||
        COALESCE(l->>'rule_id','')        || '~' ||
        to_char(ROUND(COALESCE((l->>'final_unit_price')::numeric,0),4),'FM9999999999990.0000') || '~' ||
        to_char(ROUND(COALESCE((l->>'line_final_amount')::numeric,0),2),'FM9999999999990.00'),
        ';' ORDER BY COALESCE(l->>'item_tipo',''),
                     COALESCE(l->>'item_id',''),
                     COALESCE(l->>'unidade_medida',''),
                     COALESCE((l->>'volume_ml')::numeric,0),
                     COALESCE((l->>'quantidade')::numeric,0),
                     COALESCE(l->>'rule_id',''))
      FROM jsonb_array_elements(COALESCE(p_cart->'lines','[]'::jsonb)) l
    ),'') || '|' ||
    COALESCE((p_cart->>'quote_required'),'false')
  ,'UTF8')),'hex')
$fn$;

REVOKE ALL ON FUNCTION public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. IDEMPOTENCIA DE CHECKOUT
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_order_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  cart_hash text NOT NULL,
  order_id uuid REFERENCES public.partner_orders(id) ON DELETE RESTRICT,
  result_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_partner_order_idempotency_key
  ON public.partner_order_idempotency (partner_id, idempotency_key);

GRANT SELECT ON public.partner_order_idempotency TO authenticated;
GRANT ALL ON public.partner_order_idempotency TO service_role;

ALTER TABLE public.partner_order_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS poi_select_scoped ON public.partner_order_idempotency;
CREATE POLICY poi_select_scoped ON public.partner_order_idempotency
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'administrador'::app_role)
    OR has_role(auth.uid(),'gestor_comercial'::app_role)
    OR has_role(auth.uid(),'financeiro'::app_role)
    OR (has_role(auth.uid(),'parceiro_b2b'::app_role)
        AND partner_id = public.get_user_partner_id())
  );

DROP TRIGGER IF EXISTS trg_partner_order_idempotency_updated_at ON public.partner_order_idempotency;
CREATE TRIGGER trg_partner_order_idempotency_updated_at
  BEFORE UPDATE ON public.partner_order_idempotency
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 3. SIMULADOR FINANCEIRO — tecnico-only bloqueado antes de precificar
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.simulate_b2b_payment_plan_secure(
  p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb, p_first_due_date date DEFAULT NULL::date)
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

  IF has_role(v_uid,'cliente_produtor'::app_role)
     AND NOT (v_is_admin OR v_is_finance OR v_is_gestor OR v_is_partner) THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED';
  END IF;

  -- Esta RPC e exclusivamente financeira (condicao, desconto, juros, parcelas,
  -- totais e credito). Tecnico de parceiro sem alcada interna/gestora nao pode
  -- obter nenhum desses dados: bloqueio ANTES de qualquer resolucao de preco.
  IF v_is_tech AND NOT (v_is_admin OR v_is_finance OR v_is_gestor OR v_is_partner) THEN
    RAISE EXCEPTION 'forbidden_financial_terms';
  END IF;

  IF NOT (v_is_admin OR v_is_finance OR v_is_gestor) THEN
    IF NOT (v_is_partner AND v_user_partner IS NOT NULL AND v_user_partner = p_partner_id) THEN
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

  IF v_quote THEN v_table := 0; v_disc := 0; v_net := 0; END IF;

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
  EXCEPTION WHEN OTHERS THEN v_credit := NULL; END;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
    'quote_required', v_quote,
    'items', v_cart->'lines',
    'cart_hash', public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final),
    'financial_visible', true,
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

-- ---------------------------------------------------------------------
-- 4. CRIACAO DE PEDIDO — hash obrigatorio + idempotencia
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_partner_order_secure(
  p_partner_id uuid,
  p_observacoes text DEFAULT NULL::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_requested_delivery_date date DEFAULT NULL::date,
  p_payment_plan_id uuid DEFAULT NULL::uuid,
  p_first_due_date date DEFAULT NULL::date,
  p_installment_count integer DEFAULT NULL::integer,
  p_expected_cart_hash text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text)
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
  v_interest numeric(14,2); v_final numeric(14,2); v_hash text;
  v_installments integer; v_first_due date; v_terms_id uuid;
  v_status partner_order_status; v_fin_status text; v_approval_status text;
  v_credit jsonb; v_block_reason text := NULL;
  v_inst numeric(14,2); v_accum numeric(14,2) := 0;
  v_amount_i numeric(14,2); v_principal_i numeric(14,2); v_interest_i numeric(14,2);
  v_due_i date; v_admin record; i integer;
  v_idem text; v_prev_idem record; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;
  IF p_payment_plan_id IS NULL THEN RAISE EXCEPTION 'payment_plan_required'; END IF;

  -- assinatura autoritativa obrigatoria para TODOS os chamadores
  IF NULLIF(btrim(COALESCE(p_expected_cart_hash,'')),'') IS NULL THEN
    RAISE EXCEPTION 'cart_hash_required';
  END IF;
  v_idem := NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');
  IF v_idem IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF length(v_idem) > 120 THEN RAISE EXCEPTION 'invalid_idempotency_key'; END IF;

  v_is_admin        := has_role(v_uid,'administrador'::app_role);
  v_is_finance      := has_role(v_uid,'financeiro'::app_role);
  v_is_gestor       := has_role(v_uid,'gestor_comercial'::app_role);
  v_is_internal     := v_is_admin OR v_is_finance OR v_is_gestor;
  v_is_partner      := has_role(v_uid,'parceiro_b2b'::app_role);
  v_is_partner_tech := has_role(v_uid,'parceiro_b2b_tecnico'::app_role);
  v_user_partner    := public.get_user_partner_id();

  IF has_role(v_uid,'cliente_produtor'::app_role) AND NOT (v_is_internal OR v_is_partner) THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED';
  END IF;

  IF v_is_partner_tech AND NOT (v_is_internal OR v_is_partner) THEN
    RAISE EXCEPTION 'partner_tech_cannot_create_order';
  END IF;

  IF NOT v_is_internal THEN
    IF NOT v_is_partner OR v_user_partner IS NULL OR v_user_partner <> p_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  PERFORM 1 FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  -- idempotencia (lock deterministico #1: parceiro+chave)
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_idem, 0));
  SELECT * INTO v_prev_idem FROM public.partner_order_idempotency
   WHERE partner_id = p_partner_id AND idempotency_key = v_idem;
  IF FOUND THEN
    IF v_prev_idem.cart_hash IS DISTINCT FROM p_expected_cart_hash THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_prev_idem.result_snapshot;
  END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;
  IF v_plan.monthly_interest_percent < 0 THEN RAISE EXCEPTION 'invalid_interest_rate'; END IF;
  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;

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

  v_cart  := public.fn_resolve_b2b_cart(p_partner_id, p_payment_plan_id, p_items, current_date);
  v_quote := COALESCE((v_cart->>'quote_required')::boolean,false);
  v_table := (v_cart->>'table_amount')::numeric;
  v_disc  := (v_cart->>'discount_amount')::numeric;
  v_net   := (v_cart->>'net_amount')::numeric;
  v_final := CASE WHEN v_quote THEN 0
                  ELSE public.fn_b2b_apply_interest(v_net, v_plan.interest_type,
                         v_plan.monthly_interest_percent, v_plan.months_count) END;

  v_hash := public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final);
  IF p_expected_cart_hash <> v_hash THEN
    RAISE EXCEPTION 'price_changed';
  END IF;

  IF v_quote THEN v_table := 0; v_disc := 0; v_net := 0; END IF;
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

  IF v_quote THEN
    v_status := 'aguardando_cotacao'::partner_order_status;
  ELSE
    -- lock deterministico #2: credito do parceiro
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
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'final_unit_price')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'plan_discount_percent')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'line_final_amount')::numeric, 0) END,
      v_line->>'unidade_medida',
      NULLIF(v_line->>'volume_ml','')::numeric,
      v_line->>'nome', v_line->>'codigo',
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'base_price')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'plan_discount_percent')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'final_unit_price')::numeric, 0) END,
      v_line->>'pricing_mode', v_line->>'price_source',
      CASE WHEN v_quote THEN NULL ELSE NULLIF(v_line->>'base_price','')::numeric END,
      CASE WHEN v_quote THEN NULL ELSE NULLIF(v_line->>'condition_price','')::numeric END,
      CASE WHEN v_quote THEN NULL ELSE NULLIF(v_line->>'plan_discount_percent','')::numeric END,
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
                             'cart_hash', v_hash,
                             'hash_validated', true,
                             'idempotency_key', v_idem,
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

  v_result := jsonb_build_object(
    'id', v_order_id, 'numero', v_numero,
    'status', v_status::text,
    'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
    'quote_required', v_quote,
    'cart_hash', v_hash,
    'idempotency_key', v_idem,
    'subtotal', v_table, 'desconto_total', v_disc, 'total', v_final,
    'table_amount', v_table, 'discount_amount', v_disc,
    'net_amount_after_discount', v_net, 'financial_interest_amount', v_interest,
    'final_amount', v_final,
    'payment_terms_id', v_terms_id,
    'credit_reason_code', v_credit->>'reason_code',
    'credit_block_reason', v_block_reason,
    'requires_financial_approval', (NOT v_quote AND (v_plan.requires_financial_approval OR v_plan.requires_guarantee)),
    'financial_approval_status', CASE WHEN v_quote THEN 'not_required' ELSE v_fin_status END);

  INSERT INTO public.partner_order_idempotency(
    partner_id, idempotency_key, cart_hash, order_id, result_snapshot, created_by)
  VALUES (p_partner_id, v_idem, p_expected_cart_hash, v_order_id, v_result, v_uid);

  RETURN v_result;
END $function$;

-- remove a assinatura de 8 argumentos (bypass do hash/idempotencia)
DROP FUNCTION IF EXISTS public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text);
DROP FUNCTION IF EXISTS public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer);

REVOKE ALL ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date) TO authenticated, service_role;

-- remove a versao antiga do hash (3 argumentos)
DROP FUNCTION IF EXISTS public.fn_b2b_cart_hash(uuid,jsonb,numeric);

-- ---------------------------------------------------------------------
-- 5. CONVERSAO DE SIMULACAO — passa a assinar e a ser idempotente
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_partner_simulation_to_order_secure(
  p_simulation_id uuid, p_observacoes text DEFAULT NULL::text, p_payment_plan_id uuid DEFAULT NULL::uuid,
  p_first_due_date date DEFAULT NULL::date, p_installment_count integer DEFAULT NULL::integer,
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
  v_plan record; v_quote boolean; v_final numeric(14,2); v_hash text;
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

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;

  -- Revalidacao autoritativa do preco no momento da conversao
  v_cart := public.fn_resolve_b2b_cart(v_partner_id, p_payment_plan_id, v_items, current_date);
  v_new_table := (v_cart->>'table_amount')::numeric;

  IF COALESCE(v_sim.total_cheio,0) > 0
     AND ABS(v_new_table - v_sim.total_cheio) > 0.01
     AND NOT p_confirm_price_change THEN
    RAISE EXCEPTION 'price_changed_requires_confirmation: simulado=% atual=%',
      v_sim.total_cheio, v_new_table USING ERRCODE='P0001';
  END IF;

  -- assinatura calculada no servidor a partir do carrinho recem-resolvido
  v_quote := COALESCE((v_cart->>'quote_required')::boolean,false);
  v_final := CASE WHEN v_quote THEN 0
                  ELSE public.fn_b2b_apply_interest((v_cart->>'net_amount')::numeric,
                         v_plan.interest_type, v_plan.monthly_interest_percent, v_plan.months_count) END;
  v_hash := public.fn_b2b_cart_hash(v_partner_id, p_payment_plan_id, v_cart, v_final);

  v_result := public.create_partner_order_secure(
    v_partner_id, COALESCE(p_observacoes, v_sim.observacoes), v_items,
    NULL, p_payment_plan_id, p_first_due_date, p_installment_count,
    v_hash, 'sim:' || p_simulation_id::text);
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
                             'cart_hash', v_hash,
                             'price_change_confirmed', p_confirm_price_change));

  PERFORM public.insert_partner_catalog_access_log_internal(
    'simulation_converted_to_order', v_partner_id, v_uid, v_sim.cliente_id,
    p_simulation_id, v_order_id, NULL, jsonb_build_object('total', v_result->>'total'));

  RETURN v_order_id;
END $function$;

REVOKE ALL ON FUNCTION public.convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. RESPOSTA DE COTACAO — decisao de credito na mesma transacao
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_b2b_order_quote_secure(
  p_order_id uuid, p_lines jsonb, p_first_due_date date DEFAULT NULL::date,
  p_installment_count integer DEFAULT NULL::integer, p_motivo text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean; v_is_gestor boolean;
  v_order record; v_plan record;
  v_line jsonb; v_item record; v_price numeric(14,4);
  v_count_lines integer; v_count_distinct integer; v_count_items integer;
  v_prev jsonb;
  v_table numeric(14,2); v_net numeric(14,2); v_final numeric(14,2); v_interest numeric(14,2);
  v_installments integer; v_first_due date; v_terms_id uuid;
  v_fin_status text; v_approval_status text;
  v_inst numeric(14,2); v_accum numeric(14,2) := 0;
  v_amount_i numeric(14,2); v_principal_i numeric(14,2); v_interest_i numeric(14,2);
  v_due_i date; i integer; v_final_status text; v_block_reason text := NULL;
  v_partner_user record; v_credit jsonb; v_new_status partner_order_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  v_is_admin  := has_role(v_uid,'administrador'::app_role);
  v_is_gestor := has_role(v_uid,'gestor_comercial'::app_role);
  IF NOT (v_is_admin OR v_is_gestor) THEN
    RAISE EXCEPTION 'forbidden_quote_response';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'quote_incomplete';
  END IF;

  -- locks em ordem deterministica: (1) pedido/cotacao
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_quote:' || p_order_id::text, 0));

  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status <> 'aguardando_cotacao'::partner_order_status THEN
    RAISE EXCEPTION 'order_not_in_quote_state';
  END IF;
  IF v_order.payment_plan_id IS NULL THEN RAISE EXCEPTION 'payment_plan_required'; END IF;

  -- (2) credito do parceiro
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || v_order.partner_id::text, 0));

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = v_order.payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;

  SELECT count(*) INTO v_count_items FROM public.partner_order_items WHERE order_id = p_order_id;
  IF v_count_items = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;

  SELECT count(*), count(DISTINCT (l->>'item_id')::uuid)
    INTO v_count_lines, v_count_distinct
    FROM jsonb_array_elements(p_lines) l;
  IF v_count_lines <> v_count_distinct THEN RAISE EXCEPTION 'quote_duplicate_line'; END IF;
  IF v_count_distinct <> v_count_items THEN RAISE EXCEPTION 'quote_incomplete'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'item_id', poi.id, 'preco_unitario', poi.preco_unitario,
           'subtotal', poi.subtotal,
           'pricing_mode_snapshot', poi.pricing_mode_snapshot,
           'price_source_snapshot', poi.price_source_snapshot)), '[]'::jsonb)
    INTO v_prev
    FROM public.partner_order_items poi WHERE poi.order_id = p_order_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    BEGIN
      v_price := NULLIF(v_line->>'unit_price','')::numeric;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_quote_price'; END;
    IF v_price IS NULL OR v_price <= 0 OR v_price > 10000000 THEN
      RAISE EXCEPTION 'invalid_quote_price';
    END IF;
    IF v_price <> ROUND(v_price, 4) THEN RAISE EXCEPTION 'invalid_quote_price_scale'; END IF;

    SELECT * INTO v_item FROM public.partner_order_items
     WHERE id = (v_line->>'item_id')::uuid AND order_id = p_order_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'quote_item_not_found'; END IF;

    UPDATE public.partner_order_items SET
      preco_unitario                 = v_price,
      desconto_percentual            = 0,
      subtotal                       = ROUND(v_item.quantidade * v_price, 2),
      preco_tabela_snapshot          = v_price,
      desconto_percentual_snapshot   = 0,
      preco_unitario_final_snapshot  = v_price,
      pricing_mode_snapshot          = 'fixed_item_price',
      price_source_snapshot          = 'quote_manual',
      base_price_snapshot            = v_price,
      condition_price_snapshot       = v_price,
      plan_discount_percent_snapshot = 0
    WHERE id = v_item.id;
  END LOOP;

  SELECT COALESCE(SUM(subtotal),0)::numeric(14,2) INTO v_table
    FROM public.partner_order_items WHERE order_id = p_order_id;
  v_net := v_table;

  IF v_plan.minimum_order_amount IS NOT NULL AND v_table < v_plan.minimum_order_amount THEN
    RAISE EXCEPTION 'below_minimum_order_amount';
  END IF;

  v_final := public.fn_b2b_apply_interest(v_net, v_plan.interest_type,
               v_plan.monthly_interest_percent, v_plan.months_count);
  v_interest := ROUND(v_final - v_net, 2);

  IF p_installment_count IS NOT NULL AND p_installment_count <= 0 THEN
    RAISE EXCEPTION 'invalid_installment_count';
  END IF;
  v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);

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
    IF NOT (v_plan.requires_financial_approval OR v_plan.requires_guarantee) THEN
      v_first_due := current_date + v_plan.max_days;
    ELSE
      v_fin_status := 'pending'; v_approval_status := 'pending';
    END IF;
  END IF;

  -- ---- DECISAO DE CREDITO SOBRE O TOTAL RECEM-COTADO -----------------
  -- o proprio pedido e excluido da exposicao para nao ser contado duas vezes
  v_credit := public.fn_b2b_credit_exposure(v_order.partner_id, v_final, p_order_id);

  IF COALESCE((v_credit->>'block_if_overdue')::boolean,false)
     AND COALESCE((v_credit->>'tem_vencidos')::boolean,false) THEN
    RAISE EXCEPTION 'credit_blocked_overdue';
  END IF;

  IF COALESCE((v_credit->>'credit_limit')::numeric,0) > 0
     AND (v_credit->>'exposicao_projetada')::numeric > (v_credit->>'credit_limit')::numeric THEN
    IF COALESCE(v_credit->>'credit_limit_action','block') = 'approval_required' THEN
      v_new_status := 'aguardando_aprovacao_credito'::partner_order_status;
      v_block_reason := 'limite_excedido';
    ELSE
      RAISE EXCEPTION 'credit_limit_exceeded';
    END IF;
  ELSE
    v_new_status := 'em_analise_comercial'::partner_order_status;
  END IF;

  DELETE FROM public.partner_order_payment_schedule WHERE partner_order_id = p_order_id;
  DELETE FROM public.partner_order_payment_terms WHERE partner_order_id = p_order_id;

  INSERT INTO public.partner_order_payment_terms(
    partner_order_id, payment_plan_id, plan_name_snapshot, plan_code_snapshot,
    discount_percent_snapshot, monthly_interest_percent_snapshot, months_count_snapshot,
    installment_count, first_due_date, interest_type_snapshot,
    table_amount, discount_amount, net_amount_after_discount,
    financial_interest_amount, final_amount, approval_status, created_by,
    pricing_mode_snapshot, credit_decision_snapshot
  ) VALUES (
    p_order_id, v_plan.id, v_plan.name, v_plan.code,
    0, v_plan.monthly_interest_percent, v_plan.months_count,
    v_installments, v_first_due, v_plan.interest_type,
    v_table, 0, v_net, v_interest, v_final, v_approval_status, v_uid,
    'fixed_item_price', v_credit
  ) RETURNING id INTO v_terms_id;

  IF v_installments = 1 THEN
    INSERT INTO public.partner_order_payment_schedule(
      partner_order_id, payment_terms_id, installment_number, due_date,
      amount, principal_amount, interest_amount)
    VALUES (p_order_id, v_terms_id, 1, v_first_due, v_final, v_net, v_interest);
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
      VALUES (p_order_id, v_terms_id, i, v_due_i, v_amount_i, v_principal_i, v_interest_i);
    END LOOP;
  END IF;

  UPDATE public.partner_orders SET
    status = v_new_status,
    payment_condition_status = 'defined',
    credit_block_reason = v_block_reason,
    subtotal = v_table, desconto_total = 0, total = v_final,
    payment_terms_id = v_terms_id,
    table_amount = v_table, commercial_discount_amount = 0,
    net_amount_after_discount = v_net, financial_interest_amount = v_interest,
    final_amount_with_interest = v_final,
    requires_financial_approval = (v_plan.requires_financial_approval OR v_plan.requires_guarantee),
    financial_approval_status = v_fin_status
  WHERE id = p_order_id;

  SELECT status::text INTO v_final_status FROM public.partner_orders WHERE id = p_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_order.partner_id, v_uid, 'quote_responded',
          jsonb_build_object('items', v_prev,
                             'table_amount', v_order.table_amount,
                             'total', v_order.total,
                             'status', 'aguardando_cotacao'),
          jsonb_build_object('table_amount', v_table, 'final_amount', v_final,
                             'installment_count', v_installments,
                             'first_due_date', v_first_due,
                             'status', v_final_status,
                             'credit_block_reason', v_block_reason,
                             'credit_decision', v_credit,
                             'motivo', NULLIF(p_motivo,'')));

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (p_order_id, v_order.partner_id, v_uid, 'payment_terms_defined',
          jsonb_build_object('payment_plan_id', v_plan.id, 'plan_code', v_plan.code,
            'table_amount', v_table, 'discount_amount', 0,
            'net_amount_after_discount', v_net, 'financial_interest_amount', v_interest,
            'final_amount', v_final, 'first_due_date', v_first_due,
            'installment_count', v_installments,
            'credit_reason_code', v_credit->>'reason_code',
            'source', 'quote_response'));

  FOR v_partner_user IN
    SELECT pu.user_id FROM public.partner_users pu WHERE pu.partner_id = v_order.partner_id
  LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user.user_id, 'pedido_b2b_cotacao_respondida',
            'Cotação respondida — pedido ' || v_order.numero,
            'A cotação do seu pedido foi respondida. Total: R$ ' || to_char(v_final,'FM999G999G990D00'),
            '/portal-parceiro/pedidos');
  END LOOP;

  RETURN jsonb_build_object(
    'id', p_order_id,
    'numero', v_order.numero,
    'status', v_final_status,
    'credit_block_reason', v_block_reason,
    'credit_reason_code', v_credit->>'reason_code',
    'table_amount', v_table,
    'net_amount_after_discount', v_net,
    'financial_interest_amount', v_interest,
    'final_amount', v_final,
    'installment_count', v_installments,
    'first_due_date', v_first_due,
    'payment_terms_id', v_terms_id,
    'requires_financial_approval', (v_plan.requires_financial_approval OR v_plan.requires_guarantee),
    'financial_approval_status', v_fin_status);
END $function$;

REVOKE ALL ON FUNCTION public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text) TO authenticated, service_role;
