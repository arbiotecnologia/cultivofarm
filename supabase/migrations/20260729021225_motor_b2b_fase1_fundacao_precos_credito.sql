-- =====================================================================
-- FASE 1 — Fundacao Canonica do Motor Unificado de Precos
--          + Correcao da Exposicao de Credito B2B
-- Ambiente: staging ikaauvsflpmamgxmkhoq (producao recusada)
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

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------
-- 1. MATRIZ CANONICA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_price_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_scope       text NOT NULL,
  partner_id        uuid REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  customer_id       uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  plan_id           uuid REFERENCES public.commercial_payment_plans(id) ON DELETE RESTRICT,
  product_id        uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  microrganismo_id  uuid REFERENCES public.microrganismos(id) ON DELETE CASCADE,
  unit_type         text NOT NULL,
  volume_ml         numeric(12,2),
  pricing_mode      text NOT NULL,
  condition_price   numeric(14,4),
  currency          text NOT NULL DEFAULT 'BRL',
  valid_from        date NOT NULL DEFAULT current_date,
  valid_until       date,
  active            boolean NOT NULL DEFAULT true,
  motivo            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,
  CONSTRAINT cpr_buyer_scope_chk CHECK (buyer_scope IN ('partner','producer')),
  CONSTRAINT cpr_buyer_identity_chk CHECK (
       (buyer_scope = 'partner'  AND partner_id IS NOT NULL AND customer_id IS NULL)
    OR (buyer_scope = 'producer' AND customer_id IS NOT NULL AND partner_id IS NULL)),
  CONSTRAINT cpr_item_xor_chk CHECK (num_nonnulls(product_id, microrganismo_id) = 1),
  CONSTRAINT cpr_unit_type_chk CHECK (unit_type IN ('hectare','litro','dose','unidade')),
  CONSTRAINT cpr_volume_chk CHECK (
       (unit_type =  'unidade' AND volume_ml IS NOT NULL AND volume_ml > 0)
    OR (unit_type <> 'unidade' AND volume_ml IS NULL)),
  CONSTRAINT cpr_pricing_mode_chk CHECK (pricing_mode IN ('fixed_item_price','discount_from_base','quote_only')),
  CONSTRAINT cpr_condition_price_chk CHECK (
       (pricing_mode =  'fixed_item_price' AND condition_price IS NOT NULL AND condition_price > 0)
    OR (pricing_mode <> 'fixed_item_price' AND condition_price IS NULL)),
  CONSTRAINT cpr_plan_required_chk CHECK (pricing_mode <> 'fixed_item_price' OR plan_id IS NOT NULL),
  CONSTRAINT cpr_validity_chk CHECK (valid_until IS NULL OR valid_until >= valid_from),
  CONSTRAINT cpr_currency_chk CHECK (currency = 'BRL')
);

COMMENT ON TABLE public.commercial_price_rules IS
  'Matriz comercial canonica (Fase 1). Fonte unica de preco fixo por condicao/comprador/item e de regras quote_only. partner_product_prices permanece como preco-base legado de transicao.';
COMMENT ON COLUMN public.commercial_price_rules.pricing_mode IS
  'fixed_item_price = preco final da condicao (nao recebe desconto); discount_from_base = usa preco-base + desconto do plano; quote_only = sob consulta.';
COMMENT ON COLUMN public.commercial_price_rules.condition_price IS
  'Obrigatorio e > 0 apenas em fixed_item_price; NULL nos demais modos.';
COMMENT ON COLUMN public.commercial_price_rules.buyer_scope IS
  'partner = parceiro B2B (partner_id); producer = produtor direto (customer_id). Nunca ambos.';

-- Bloqueio de sobreposicao ambigua de regras ativas para a mesma chave logica
DO $x$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cpr_no_overlap') THEN
    ALTER TABLE public.commercial_price_rules
      ADD CONSTRAINT cpr_no_overlap EXCLUDE USING gist (
        COALESCE(partner_id,       '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(customer_id,      '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(plan_id,          '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(product_id,       '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(microrganismo_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        unit_type WITH =,
        COALESCE(volume_ml, -1::numeric) WITH =,
        daterange(valid_from, valid_until, '[]') WITH &&
      ) WHERE (active);
  END IF;
END $x$;

CREATE INDEX IF NOT EXISTS idx_cpr_partner_lookup
  ON public.commercial_price_rules (partner_id, plan_id, product_id, microrganismo_id, unit_type)
  WHERE active;
CREATE INDEX IF NOT EXISTS idx_cpr_producer_lookup
  ON public.commercial_price_rules (customer_id, plan_id, product_id, microrganismo_id, unit_type)
  WHERE active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_price_rules TO authenticated;
GRANT ALL ON public.commercial_price_rules TO service_role;
REVOKE ALL ON public.commercial_price_rules FROM anon, PUBLIC;

ALTER TABLE public.commercial_price_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cpr_staff_all ON public.commercial_price_rules;
CREATE POLICY cpr_staff_all ON public.commercial_price_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'gestor_comercial'))
  WITH CHECK (public.has_role(auth.uid(),'administrador')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'gestor_comercial'));

DROP POLICY IF EXISTS cpr_partner_select_own ON public.commercial_price_rules;
CREATE POLICY cpr_partner_select_own ON public.commercial_price_rules
  FOR SELECT TO authenticated
  USING (
    buyer_scope = 'partner'
    AND public.has_role(auth.uid(),'parceiro_b2b')
    AND partner_id IN (SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid())
  );

DROP POLICY IF EXISTS cpr_producer_select_own ON public.commercial_price_rules;
CREATE POLICY cpr_producer_select_own ON public.commercial_price_rules
  FOR SELECT TO authenticated
  USING (
    buyer_scope = 'producer'
    AND public.has_role(auth.uid(),'cliente_produtor')
    AND customer_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
  );

-- ---------------------------------------------------------------------
-- 2. TOUCH + AUDITORIA
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_commercial_price_rules_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_commercial_price_rules_touch ON public.commercial_price_rules;
CREATE TRIGGER trg_commercial_price_rules_touch
  BEFORE INSERT OR UPDATE ON public.commercial_price_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_price_rules_touch();

CREATE OR REPLACE FUNCTION public.tg_commercial_price_rules_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  INSERT INTO public.commercial_audit_log (usuario_id, partner_id, order_id, acao, dados_anteriores, dados_novos)
  VALUES (
    auth.uid(),
    COALESCE(NEW.partner_id, OLD.partner_id),
    NULL,
    'price_rule_' || lower(TG_OP),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END $fn$;

DROP TRIGGER IF EXISTS trg_commercial_price_rules_audit ON public.commercial_price_rules;
CREATE TRIGGER trg_commercial_price_rules_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.commercial_price_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_price_rules_audit();

-- ---------------------------------------------------------------------
-- 3. RESOLUCAO CANONICA DE PRECO (fundacao; nao substitui o checkout)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_commercial_price(
  p_buyer_scope     text,
  p_partner_id      uuid,
  p_customer_id     uuid,
  p_plan_id         uuid,
  p_product_id      uuid,
  p_microrganismo_id uuid,
  p_unit_type       text,
  p_volume_ml       numeric,
  p_ref_date        date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $fn$
DECLARE
  v_plan          record;
  v_rule          record;
  v_base          numeric(18,6);
  v_src           text;
  v_unit          numeric(14,2);
  v_disc          numeric(9,4) := 0;
  v_ref           date := COALESCE(p_ref_date, current_date);
  v_out           jsonb;
BEGIN
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code','ITEM_INVALID','quote_required',false);
  END IF;
  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN
    RETURN jsonb_build_object('ok', false, 'reason_code','UNIT_INVALID','quote_required',false);
  END IF;
  IF p_unit_type = 'unidade' AND COALESCE(p_volume_ml,0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code','VOLUME_REQUIRED','quote_required',false);
  END IF;
  IF p_plan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason_code','PLAN_REQUIRED','quote_required',false);
  END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason_code','PLAN_NOT_FOUND','quote_required',false);
  END IF;
  IF NOT v_plan.active THEN
    RETURN jsonb_build_object('ok', false, 'reason_code','PLAN_INACTIVE','quote_required',false);
  END IF;
  v_disc := COALESCE(v_plan.discount_percent, 0);

  -- Regra da matriz (chave completa comprador + plano + item + unidade + volume)
  SELECT * INTO v_rule
  FROM public.commercial_price_rules r
  WHERE r.active
    AND r.unit_type = p_unit_type
    AND r.volume_ml IS NOT DISTINCT FROM (CASE WHEN p_unit_type='unidade' THEN p_volume_ml ELSE NULL END)
    AND r.product_id IS NOT DISTINCT FROM p_product_id
    AND r.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
    AND r.valid_from <= v_ref
    AND (r.valid_until IS NULL OR r.valid_until >= v_ref)
    AND ( (p_buyer_scope = 'partner'  AND r.buyer_scope = 'partner'  AND r.partner_id  = p_partner_id)
       OR (p_buyer_scope = 'producer' AND r.buyer_scope = 'producer' AND r.customer_id = p_customer_id) )
    AND (r.plan_id IS NULL OR r.plan_id = p_plan_id)
  ORDER BY (r.plan_id IS NOT NULL) DESC, r.valid_from DESC
  LIMIT 1;

  -- PRIORIDADE 1 — preco fixo da condicao
  IF FOUND AND v_rule.pricing_mode = 'fixed_item_price' THEN
    v_unit := round(v_rule.condition_price, 2);
    RETURN jsonb_build_object(
      'ok', true, 'reason_code','OK', 'quote_required', false,
      'pricing_mode','fixed_item_price', 'price_source','condition_fixed_price',
      'base_price', round(v_rule.condition_price,2),
      'plan_discount_percent', 0,
      'unit_price', v_unit, 'final_unit_price', v_unit,
      'currency','BRL', 'rule_id', v_rule.id, 'plan_id', p_plan_id,
      'valid_from', v_rule.valid_from, 'valid_until', v_rule.valid_until,
      'resolved_at', now()
    );
  END IF;

  -- PRIORIDADE 4 — sob consulta
  IF FOUND AND v_rule.pricing_mode = 'quote_only' THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason_code','QUOTE_REQUIRED', 'quote_required', true,
      'pricing_mode','quote_only', 'price_source','quote_only',
      'base_price', NULL, 'plan_discount_percent', NULL,
      'unit_price', NULL, 'final_unit_price', NULL,
      'currency','BRL', 'rule_id', v_rule.id, 'plan_id', p_plan_id,
      'valid_from', v_rule.valid_from, 'valid_until', v_rule.valid_until,
      'resolved_at', now()
    );
  END IF;

  -- PRIORIDADE 2 — preco-base especifico do parceiro (legado de transicao)
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
    IF COALESCE(v_base,0) > 0 THEN
      v_src := 'partner_base_price';
    ELSE
      v_base := NULL;
    END IF;
  END IF;

  -- PRIORIDADE 3 — preco-base canonico do catalogo
  IF v_base IS NULL THEN
    IF p_product_id IS NOT NULL THEN
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN COALESCE(pr.valor_ha_brl, (pr.dose_ml_ha/100.0) * pr.valor_dose_brl)
               WHEN 'litro'   THEN COALESCE(pr.valor_litro_brl, pr.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(pr.valor_dose_brl, pr.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * pr.valor_litro_brl
             END
        INTO v_base
      FROM public.produtos pr WHERE pr.id = p_product_id;
    ELSE
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN (mo.dose_ml_ha/100.0) * mo.valor_dose_brl
               WHEN 'litro'   THEN COALESCE(mo.valor_litro_brl, mo.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(mo.valor_dose_brl, mo.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * mo.valor_litro_brl
             END
        INTO v_base
      FROM public.microrganismos mo WHERE mo.id = p_microrganismo_id;
    END IF;
    IF COALESCE(v_base,0) > 0 THEN v_src := 'catalog_base_price'; ELSE v_base := NULL; END IF;
  END IF;

  IF v_base IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason_code','ITEM_WITHOUT_PRICE', 'quote_required', false,
      'pricing_mode', CASE WHEN v_rule.id IS NOT NULL THEN v_rule.pricing_mode ELSE 'discount_from_base' END,
      'price_source', NULL, 'unit_price', NULL, 'final_unit_price', NULL,
      'currency','BRL', 'rule_id', v_rule.id, 'plan_id', p_plan_id, 'resolved_at', now()
    );
  END IF;

  -- Arredondamento monetario unico e final (numeric, nunca float)
  v_unit := round(v_base * (1 - v_disc / 100.0), 2);
  IF v_unit <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code','ITEM_WITHOUT_PRICE','quote_required',false,
      'currency','BRL','plan_id',p_plan_id,'resolved_at', now());
  END IF;

  v_out := jsonb_build_object(
    'ok', true, 'reason_code','OK', 'quote_required', false,
    'pricing_mode','discount_from_base', 'price_source', v_src,
    'base_price', round(v_base,2), 'plan_discount_percent', v_disc,
    'unit_price', v_unit, 'final_unit_price', v_unit,
    'currency','BRL', 'rule_id', v_rule.id, 'plan_id', p_plan_id,
    'valid_from', v_rule.valid_from, 'valid_until', v_rule.valid_until,
    'resolved_at', now()
  );
  RETURN v_out;
END $fn$;

COMMENT ON FUNCTION public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date) IS
  'Fase 1: resolucao canonica de preco unitario segundo a precedencia aprovada. SECURITY INVOKER. Nao substitui o checkout atual.';

REVOKE ALL ON FUNCTION public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date) TO authenticated, service_role;

-- Resolucao em lote (evita N+1); identidade derivada no servidor
CREATE OR REPLACE FUNCTION public.rpc_resolve_commercial_prices(
  p_items jsonb,
  p_plan_id uuid,
  p_ref_date date DEFAULT current_date,
  p_buyer jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid        uuid := auth.uid();
  v_is_staff   boolean;
  v_scope      text;
  v_partner    uuid;
  v_customer   uuid;
  v_cnt        int;
  v_item       jsonb;
  v_res        jsonb;
  v_out        jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='P0001'; END IF;

  v_is_staff := public.has_role(v_uid,'administrador')
             OR public.has_role(v_uid,'financeiro')
             OR public.has_role(v_uid,'gestor_comercial');

  IF v_is_staff THEN
    v_scope    := COALESCE(p_buyer->>'buyer_scope','partner');
    v_partner  := NULLIF(p_buyer->>'partner_id','')::uuid;
    v_customer := NULLIF(p_buyer->>'customer_id','')::uuid;
  ELSIF public.has_role(v_uid,'parceiro_b2b') THEN
    SELECT count(*) INTO v_cnt FROM public.partner_users WHERE user_id = v_uid;
    IF v_cnt <> 1 THEN RAISE EXCEPTION 'partner_link_ambiguous' USING ERRCODE='P0001'; END IF;
    SELECT partner_id INTO v_partner FROM public.partner_users WHERE user_id = v_uid;
    v_scope := 'partner';
  ELSIF public.has_role(v_uid,'cliente_produtor') THEN
    SELECT array_length(public.get_cliente_ids_for_user(v_uid),1) INTO v_cnt;
    IF COALESCE(v_cnt,0) <> 1 THEN RAISE EXCEPTION 'customer_link_ambiguous' USING ERRCODE='P0001'; END IF;
    v_customer := (public.get_cliente_ids_for_user(v_uid))[1];
    v_scope := 'producer';
  ELSE
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE='P0001';
  END IF;

  IF v_scope = 'partner'  AND v_partner  IS NULL THEN RAISE EXCEPTION 'buyer_required' USING ERRCODE='P0001'; END IF;
  IF v_scope = 'producer' AND v_customer IS NULL THEN RAISE EXCEPTION 'buyer_required' USING ERRCODE='P0001'; END IF;
  IF v_scope = 'partner'  AND v_customer IS NOT NULL THEN RAISE EXCEPTION 'buyer_ambiguous' USING ERRCODE='P0001'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb))
  LOOP
    v_res := public.fn_resolve_commercial_price(
      v_scope, v_partner, v_customer, p_plan_id,
      NULLIF(v_item->>'product_id','')::uuid,
      NULLIF(v_item->>'microrganismo_id','')::uuid,
      v_item->>'unit_type',
      NULLIF(v_item->>'volume_ml','')::numeric,
      COALESCE(p_ref_date, current_date)
    );
    v_out := v_out || jsonb_build_array(
      v_res || jsonb_build_object('item_ref', v_item->>'item_ref')
    );
  END LOOP;

  RETURN jsonb_build_object('buyer_scope', v_scope, 'plan_id', p_plan_id,
                            'ref_date', COALESCE(p_ref_date, current_date), 'items', v_out);
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. EXPOSICAO DE CREDITO B2B
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure(
  p_partner_id uuid,
  p_new_order_amount numeric DEFAULT 0,
  p_exclude_order_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_limit numeric(14,2); v_open numeric(14,2); v_overdue numeric(14,2);
  v_committed numeric(14,2); v_new numeric(14,2) := ROUND(COALESCE(p_new_order_amount,0),2);
  v_proj numeric(14,2); v_disp numeric(14,2); v_pct numeric(6,2);
  v_tolerance int; v_block boolean; v_action text; v_reason text;
BEGIN
  SELECT COALESCE(credit_limit,0), COALESCE(overdue_tolerance_days,0),
         COALESCE(block_if_overdue,false), COALESCE(credit_limit_action,'block')
    INTO v_limit, v_tolerance, v_block, v_action
  FROM public.partner_financial_settings WHERE partner_id = p_partner_id;
  v_limit := COALESCE(v_limit,0); v_tolerance := COALESCE(v_tolerance,0);
  v_block := COALESCE(v_block,false); v_action := COALESCE(v_action,'block');

  -- (a) recebiveis em aberto do parceiro
  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_open
  FROM public.accounts_receivable ar
  JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.partner_id = p_partner_id
    AND ar.status <> 'CANCELED'
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_overdue
  FROM public.accounts_receivable ar
  JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.partner_id = p_partner_id
    AND ar.status <> 'CANCELED'
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
    AND ari.due_date < (current_date - v_tolerance);

  -- (b) pedidos com compromisso financeiro real e SEM recebivel gerado
  --     (evita dupla contagem com (a)); cancelados/reprovados ficam de fora.
  SELECT COALESCE(SUM(ROUND(COALESCE(po.final_amount_with_interest, po.total, 0),2)),0)
    INTO v_committed
  FROM public.partner_orders po
  WHERE po.partner_id = p_partner_id
    AND po.status IN ('aprovado','em_producao','produzido','aguardando_entrega',
                      'confirmado','em_separacao','enviado','entregue')
    AND COALESCE(po.receivable_generated,false) = false
    AND NOT EXISTS (SELECT 1 FROM public.partner_order_financial_links pofl
                    WHERE pofl.partner_order_id = po.id)
    AND (p_exclude_order_id IS NULL OR po.id <> p_exclude_order_id);

  v_proj := ROUND(v_open + v_committed + v_new, 2);
  v_disp := GREATEST(v_limit - v_proj, 0);
  v_pct  := CASE WHEN v_limit > 0 THEN ROUND((v_proj / v_limit) * 100, 2) ELSE 0 END;

  v_reason := CASE
    WHEN v_block AND v_overdue > 0 THEN 'OVERDUE_BLOCK'
    WHEN v_limit <= 0 THEN 'NO_LIMIT_DEFINED'
    WHEN v_proj > v_limit AND v_action = 'approval_required' THEN 'LIMIT_EXCEEDED_APPROVAL'
    WHEN v_proj > v_limit THEN 'LIMIT_EXCEEDED_BLOCK'
    ELSE 'OK' END;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'credit_limit', v_limit,
    'saldo_em_aberto', v_open,
    'saldo_vencido', v_overdue,
    'comprometido_nao_faturado', v_committed,
    'novo_pedido', v_new,
    'exposicao_atual', ROUND(v_open + v_committed, 2),
    'exposicao_projetada', v_proj,
    'credito_disponivel', v_disp,
    'percentual_utilizado', v_pct,
    'overdue_tolerance_days', v_tolerance,
    'block_if_overdue', v_block,
    'credit_limit_action', v_action,
    'tem_vencidos', v_overdue > 0,
    'reason_code', v_reason
  );
END $fn$;

COMMENT ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) IS
  'Fase 1: exposicao projetada = recebiveis em aberto + pedidos aprovados nao faturados + novo pedido. Sem dupla contagem. Uso interno (trigger/RPC).';

REVOKE ALL ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_b2b_credit_exposure(
  p_partner_id uuid,
  p_new_order_amount numeric DEFAULT 0,
  p_exclude_order_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid(); v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='P0001'; END IF;
  v_ok := public.has_role(v_uid,'administrador')
       OR public.has_role(v_uid,'financeiro')
       OR public.has_role(v_uid,'gestor_comercial')
       OR ( public.has_role(v_uid,'parceiro_b2b')
            AND EXISTS (SELECT 1 FROM public.partner_users pu
                        WHERE pu.user_id = v_uid AND pu.partner_id = p_partner_id) );
  IF NOT v_ok THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='P0001'; END IF;
  RETURN public.fn_b2b_credit_exposure(p_partner_id, p_new_order_amount, p_exclude_order_id);
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_b2b_credit_exposure(uuid,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_credit_exposure(uuid,numeric,uuid) TO authenticated, service_role;

-- Assinatura publica preservada; passa a devolver superset de chaves.
CREATE OR REPLACE FUNCTION public.rpc_b2b_partner_credit(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  RETURN public.fn_b2b_credit_exposure(p_partner_id, 0, NULL);
END $fn$;

-- Guarda de credito: mesma transacao, lock por parceiro, total final com juros.
CREATE OR REPLACE FUNCTION public.tg_partner_orders_credit_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v jsonb;
  v_amount numeric(14,2);
  v_should_check boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('rascunho') THEN v_should_check := true; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.credit_approved_by IS NOT NULL
       AND NEW.status = 'em_analise_comercial'
       AND OLD.status = 'aguardando_aprovacao_credito'
       AND NEW.total IS NOT DISTINCT FROM OLD.total THEN
      NEW.credit_block_reason := NULL;
      RETURN NEW;
    END IF;

    IF NEW.credit_approved_by IS NOT NULL AND OLD.credit_approved_by IS NULL THEN
      NEW.credit_block_reason := NULL;
      RETURN NEW;
    END IF;

    IF OLD.credit_approved_by IS NOT NULL
       AND NEW.status = 'aprovado'
       AND OLD.status = 'em_analise_comercial'
       AND NEW.total IS NOT DISTINCT FROM OLD.total THEN
      RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('em_analise_comercial','aprovado') THEN
      v_should_check := true;
    ELSIF (NEW.total IS DISTINCT FROM OLD.total
        OR NEW.final_amount_with_interest IS DISTINCT FROM OLD.final_amount_with_interest)
       AND NEW.status IN ('em_analise_comercial','aprovado','aguardando_aprovacao_credito') THEN
      v_should_check := true;
    END IF;
  END IF;

  IF NOT v_should_check THEN RETURN NEW; END IF;

  -- Serializa a avaliacao de credito por parceiro dentro da transacao corrente.
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || NEW.partner_id::text, 0));

  v_amount := ROUND(COALESCE(NEW.final_amount_with_interest, NEW.total, 0), 2);
  v := public.fn_b2b_credit_exposure(NEW.partner_id, v_amount, NEW.id);

  IF (v->>'block_if_overdue')::boolean AND (v->>'tem_vencidos')::boolean THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := 'inadimplencia';
    RETURN NEW;
  END IF;

  IF COALESCE((v->>'credit_limit')::numeric,0) > 0
     AND (v->>'exposicao_projetada')::numeric > (v->>'credit_limit')::numeric THEN
    NEW.status := 'aguardando_aprovacao_credito';
    NEW.credit_block_reason := CASE
      WHEN (v->>'credit_limit_action') = 'approval_required' THEN 'limite_excedido'
      ELSE 'limite_excedido_bloqueado'
    END;
  END IF;

  RETURN NEW;
END $fn$;
