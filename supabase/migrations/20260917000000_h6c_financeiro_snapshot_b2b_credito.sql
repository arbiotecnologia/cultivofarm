-- =====================================================================
-- H6c — FINANCEIRO AR BIO: condição B2B canônica, fail-closed de aprovação
--       e integração do ciclo de crédito na entrega -> AR.
-- Ambiente: staging ikaauvsflpmamgxmkhoq. Incremental, forward-only.
-- Não edita migrations históricas. Preserva H0-H5, H6 e H6b.
-- =====================================================================

-- ---------------------------------------------------------------------
-- H6C-001 — fonte econômica canônica = partner_orders.payment_terms_id
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_entrega_valor_faturavel_v1(p_entrega_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_e public.entregas%ROWTYPE;
  v_po public.partner_orders%ROWTYPE;
  v_t public.partner_order_payment_terms%ROWTYPE;
  v_fin text;
  v_ap text;
  v_total_snapshot numeric;
  v_origem text;
  v_base numeric;
  v_aceito numeric;
  v_valor numeric;
  v_conf int;
  v_itens jsonb;
  v_ident jsonb;
BEGIN
  SELECT * INTO v_e FROM public.entregas WHERE id = p_entrega_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('origem','indisponivel','motivo','entrega_nao_encontrada');
  END IF;

  SELECT count(*)::int INTO v_conf
    FROM public.entrega_conferencia_itens WHERE entrega_id = p_entrega_id;

  -- ------------------- caminho B2B (snapshot canônico) -------------------
  IF v_e.partner_order_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.partner_orders WHERE id = v_e.partner_order_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('origem','indisponivel','motivo','pedido_b2b_nao_encontrado');
    END IF;

    v_fin := COALESCE(v_po.financial_approval_status, 'not_required');
    v_ident := jsonb_build_object(
      'partner_order_id', v_po.id,
      'payment_terms_id', v_po.payment_terms_id,
      'financial_approval_status', v_fin,
      'order_status', v_po.status);

    IF v_po.payment_terms_id IS NOT NULL THEN
      -- identidade imutável da condição econômica
      SELECT * INTO v_t FROM public.partner_order_payment_terms
       WHERE id = v_po.payment_terms_id;
      IF NOT FOUND OR v_t.partner_order_id IS DISTINCT FROM v_po.id THEN
        RETURN jsonb_build_object('origem','bloqueado','motivo','termo_canonico_invalido')
               || v_ident;
      END IF;

      v_ap := COALESCE(v_t.approval_status, 'pending');
      v_ident := v_ident || jsonb_build_object('approval_status', v_ap);

      IF v_ap = 'approved' THEN
        NULL; -- liberado
      ELSIF v_ap = 'not_required'
            AND v_fin = 'not_required'
            AND COALESCE(v_po.requires_financial_approval, false) = false THEN
        NULL; -- liberado: nenhuma aprovação exigida em nenhum nível
      ELSE
        -- pending / rejected / adjustment_requested / incoerência => fail-closed.
        -- Proibido fallback silencioso para outro termo ou para o pedido.
        RETURN jsonb_build_object('origem','bloqueado','motivo','condicao_b2b_nao_liberada')
               || v_ident;
      END IF;

      v_total_snapshot := v_t.final_amount;
      v_origem := 'B2B_PAYMENT_TERMS_SNAPSHOT';
    ELSE
      -- legado: sem condição vinculada ao pedido.
      IF EXISTS (SELECT 1 FROM public.partner_order_payment_terms t
                  WHERE t.partner_order_id = v_po.id) THEN
        -- existe termo, mas não é o canônico do pedido => nunca usar "o mais novo"
        RETURN jsonb_build_object('origem','bloqueado','motivo','termo_nao_vinculado_ao_pedido')
               || v_ident;
      END IF;
      IF v_fin IN ('pending','rejected') THEN
        RETURN jsonb_build_object('origem','bloqueado','motivo','aprovacao_financeira_'||v_fin)
               || v_ident;
      END IF;
      IF COALESCE(v_po.status,'') IN ('cancelado','reprovado','reprovado_sem_itens',
                                      'rascunho','pendente','solicitado','em_analise_comercial',
                                      'aguardando_aprovacao_credito','aguardando_ajuste_comercial',
                                      'aguardando_itens','aguardando_cotacao') THEN
        RETURN jsonb_build_object('origem','bloqueado','motivo','pedido_nao_faturavel')
               || v_ident;
      END IF;
      v_total_snapshot := COALESCE(v_po.final_amount_with_interest, v_po.total);
      v_origem := 'B2B_ORDER_SNAPSHOT_LEGACY';
    END IF;

    IF v_total_snapshot IS NULL OR v_total_snapshot <= 0 THEN
      RETURN jsonb_build_object('origem','indisponivel','motivo','snapshot_b2b_ausente')
             || v_ident;
    END IF;

    -- base econômica do pedido = soma dos subtotais snapshot dos itens
    SELECT COALESCE(sum(COALESCE(i.subtotal,
             COALESCE(i.preco_unitario_final_snapshot, i.preco_unitario, 0) * COALESCE(i.quantidade,0))), 0)
      INTO v_base
      FROM public.partner_order_items i WHERE i.order_id = v_po.id;

    IF v_conf = 0 OR v_base <= 0 THEN
      RETURN jsonb_build_object('origem', v_origem, 'valor', round(v_total_snapshot,2),
        'metodo', jsonb_build_object('tipo','integral','total_snapshot', round(v_total_snapshot,2),
                                     'base_itens', round(COALESCE(v_base,0),2)))
             || v_ident;
    END IF;

    -- participação econômica aceita POR PRODUTO (volume conferido aceito / volume conferido)
    WITH conf AS (
      SELECT ee.produto_id AS produto_id, ci.status AS status,
             COALESCE(ee.volume,0) * COALESCE(ci.quantidade,1) AS vol
        FROM public.entrega_conferencia_itens ci
        JOIN public.estoque_embalagens ee ON ee.id = ci.embalagem_id
       WHERE ci.entrega_id = p_entrega_id
    ), ratio AS (
      SELECT produto_id,
             CASE WHEN SUM(vol) > 0
                  THEN LEAST(1, round(COALESCE(SUM(vol) FILTER (WHERE status='aceito'), 0) / SUM(vol), 6))
                  ELSE 0 END AS r
        FROM conf GROUP BY produto_id
    ), itens AS (
      SELECT i.product_id AS product_id,
             COALESCE(i.subtotal,
               COALESCE(i.preco_unitario_final_snapshot, i.preco_unitario, 0) * COALESCE(i.quantidade,0)) AS sub,
             COALESCE(r.r, 0) AS r
        FROM public.partner_order_items i
        LEFT JOIN ratio r ON r.produto_id = i.product_id
       WHERE i.order_id = v_po.id
    )
    SELECT COALESCE(sum(sub * r),0),
           COALESCE(jsonb_agg(jsonb_build_object('produto_id', product_id,
                     'subtotal_snapshot', round(sub,2), 'ratio_aceito', r,
                     'base_aceita_item', round(sub * r, 2))
                    ORDER BY product_id), '[]'::jsonb)
      INTO v_aceito, v_itens
      FROM itens;

    IF abs(v_aceito - v_base) <= 0.01 THEN
      v_valor := round(v_total_snapshot, 2);
    ELSE
      -- alocação do ajuste histórico do pedido (juros/desconto de nível pedido)
      -- proporcional à participação econômica aceita dos itens.
      v_valor := round(v_total_snapshot * (v_aceito / v_base), 2);
    END IF;

    RETURN jsonb_build_object('origem', v_origem, 'valor', v_valor,
      'metodo', jsonb_build_object('tipo','participacao_economica_aceita_x_snapshot',
        'total_snapshot', round(v_total_snapshot,2),
        'base_itens', round(v_base,2), 'base_aceita', round(v_aceito,2),
        'fator', round(v_aceito / NULLIF(v_base,0), 6), 'itens', v_itens))
           || v_ident;
  END IF;

  -- ---------------- caminho OS / base de faturamento histórica -------------
  IF v_e.os_faturamento_base_id IS NOT NULL THEN
    SELECT b.valor_total_faturavel INTO v_total_snapshot
      FROM public.os_faturamento_base b WHERE b.id = v_e.os_faturamento_base_id;
    IF v_total_snapshot IS NOT NULL AND v_total_snapshot > 0 THEN
      RETURN jsonb_build_object('origem','OS_FATURAMENTO_BASE_SNAPSHOT',
        'valor', round(v_total_snapshot,2),
        'metodo', jsonb_build_object('tipo','os_base','os_faturamento_base_id', v_e.os_faturamento_base_id));
    END IF;
  END IF;

  RETURN jsonb_build_object('origem','indisponivel','motivo','sem_fonte_historica_confiavel');
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_entrega_valor_faturavel_v1(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_entrega_valor_faturavel_v1(uuid) FROM anon;

-- ---------------------------------------------------------------------
-- H6C-001.2 — elegibilidade B2B alinhada à mesma fonte canônica
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_b2b_order_billing_eligibility(p_partner_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_order record; v_terms record; v_quote int; v_noprice int; v_ap text; v_fin text;
BEGIN
  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_partner_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_NOT_FOUND'); END IF;

  IF v_order.status IN ('cancelado','reprovado','reprovado_sem_itens') THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_CANCELED_OR_REJECTED','status',v_order.status);
  END IF;
  IF v_order.status IN ('rascunho','pendente','solicitado','em_analise_comercial',
                        'aguardando_aprovacao_credito','aguardando_ajuste_comercial',
                        'aguardando_itens','aguardando_cotacao') THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ORDER_NOT_APPROVED','status',v_order.status);
  END IF;

  v_fin := COALESCE(v_order.financial_approval_status,'not_required');
  IF v_fin = 'pending' THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','FINANCIAL_APPROVAL_PENDING');
  END IF;
  IF v_fin = 'rejected' THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','FINANCIAL_APPROVAL_REJECTED');
  END IF;

  SELECT count(*) FILTER (WHERE COALESCE(pricing_mode_snapshot,'') = 'quote_only'),
         count(*) FILTER (WHERE COALESCE(preco_unitario_final_snapshot, preco_unitario, 0) <= 0)
    INTO v_quote, v_noprice
    FROM public.partner_order_items WHERE order_id = p_partner_order_id;
  IF COALESCE(v_quote,0) > 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','QUOTE_ONLY_ITEMS','count',v_quote);
  END IF;
  IF COALESCE(v_noprice,0) > 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','ITEM_WITHOUT_FINAL_PRICE','count',v_noprice);
  END IF;

  -- H6C-001: condição canônica é a vinculada ao pedido; nunca "a mais recente".
  IF v_order.payment_terms_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.partner_order_payment_terms t
                WHERE t.partner_order_id = p_partner_order_id) THEN
      RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_NOT_LINKED');
    END IF;
    RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_NOT_DEFINED');
  END IF;

  SELECT * INTO v_terms FROM public.partner_order_payment_terms
   WHERE id = v_order.payment_terms_id AND partner_order_id = p_partner_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_INVALID',
                              'payment_terms_id', v_order.payment_terms_id);
  END IF;

  v_ap := COALESCE(v_terms.approval_status,'pending');
  IF NOT (v_ap = 'approved'
          OR (v_ap = 'not_required' AND v_fin = 'not_required'
              AND COALESCE(v_order.requires_financial_approval,false) = false)) THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','PAYMENT_TERMS_NOT_APPROVED',
                              'approval_status', v_ap, 'payment_terms_id', v_terms.id);
  END IF;

  IF COALESCE(v_terms.final_amount,0) <= 0 THEN
    RETURN jsonb_build_object('eligible',false,'reason_code','NO_FINAL_AMOUNT');
  END IF;

  RETURN jsonb_build_object('eligible',true,'reason_code','OK',
    'final_amount',v_terms.final_amount,'payment_terms_id',v_terms.id,
    'approval_status', v_ap, 'financial_approval_status', v_fin);
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_b2b_order_billing_eligibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_b2b_order_billing_eligibility(uuid) FROM anon;

-- ---------------------------------------------------------------------
-- H6C-001.3 — guard fail-closed quando a condição B2B não está liberada
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_entrega_guard_faturamento_v1(p_entrega_id uuid, p_total numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_r public.entrega_reconciliacoes%ROWTYPE;
  v_conf int;
  v_canon jsonb;
  v_max numeric;
BEGIN
  SELECT count(*)::int INTO v_conf
    FROM public.entrega_conferencia_itens WHERE entrega_id = p_entrega_id;

  v_canon := public.fn_entrega_valor_faturavel_v1(p_entrega_id);

  -- H6C-001: condição comercial pendente/rejeitada/não vinculada bloqueia o
  -- faturamento em qualquer modo, inclusive o manual.
  IF (v_canon->>'origem') = 'bloqueado' THEN
    RAISE EXCEPTION 'condicao_b2b_bloqueada: %', COALESCE(v_canon->>'motivo','indefinido')
      USING ERRCODE='check_violation';
  END IF;

  IF v_conf = 0 THEN
    RETURN jsonb_build_object('modo', 'legado', 'ratio_aceito', 1, 'canonico', v_canon);
  END IF;

  SELECT * INTO v_r FROM public.entrega_reconciliacoes
   WHERE entrega_id = p_entrega_id AND status = 'reconciliada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entrega_nao_reconciliada: conclua a conferencia e a reconciliacao antes de faturar'
      USING ERRCODE='check_violation';
  END IF;
  IF NOT v_r.faturavel THEN
    RAISE EXCEPTION 'entrega_nao_faturavel: todos os itens foram recusados'
      USING ERRCODE='check_violation';
  END IF;

  v_max := COALESCE(v_r.valor_faturavel_max, (v_canon->>'valor')::numeric);
  IF v_max IS NOT NULL AND p_total > v_max + 0.01 THEN
    RAISE EXCEPTION 'valor_acima_do_aceito' USING ERRCODE='check_violation';
  END IF;

  RETURN jsonb_build_object('modo', 'reconciliado', 'reconciliacao_id', v_r.id,
                            'ratio_aceito', v_r.ratio_aceito,
                            'valor_faturavel_max', v_max, 'canonico', v_canon);
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_entrega_guard_faturamento_v1(uuid, numeric) FROM anon;

-- ---------------------------------------------------------------------
-- H6C-003 — entrega -> AR de pedido B2B integra o ciclo de crédito.
-- Sem o vínculo, `fn_b2b_credit_exposure` mantinha o pedido como
-- "comprometido não faturado" e ignorava o recebível (partner_id nulo),
-- de modo que baixas/estornos não moviam a exposição.
-- Implementado como trigger transacional e idempotente sobre o fluxo
-- canônico existente (sem duplicar `generate_b2b_receivable_secure`).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_h6c_entrega_ar_b2b_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_po public.partner_orders%ROWTYPE;
  v_settings record;
BEGIN
  IF NEW.receivable_id IS NULL
     OR NEW.partner_order_id IS NULL
     OR NEW.receivable_id IS NOT DISTINCT FROM OLD.receivable_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_po FROM public.partner_orders WHERE id = NEW.partner_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- 1) o recebível passa a pertencer ao parceiro (entra em saldo_em_aberto)
  UPDATE public.accounts_receivable
     SET partner_id = v_po.partner_id
   WHERE id = NEW.receivable_id AND partner_id IS DISTINCT FROM v_po.partner_id;

  -- 2) vínculo financeiro canônico (idempotente: unique em partner_order_id)
  SELECT * INTO v_settings FROM public.partner_financial_settings WHERE partner_id = v_po.partner_id;
  INSERT INTO public.partner_order_financial_links(
    partner_order_id, partner_id, receivable_id, financial_status, billing_trigger, created_by)
  VALUES (v_po.id, v_po.partner_id, NEW.receivable_id, 'gerado',
          COALESCE(v_settings.billing_trigger, 'entrega'), NEW.billing_generated_by)
  ON CONFLICT (partner_order_id) DO NOTHING;

  -- 3) pedido deixa de ser "comprometido não faturado"
  UPDATE public.partner_orders
     SET financial_status = 'gerado',
         receivable_generated = true,
         receivable_generated_at = COALESCE(receivable_generated_at, now()),
         receivable_generated_by = COALESCE(receivable_generated_by, NEW.billing_generated_by)
   WHERE id = v_po.id AND COALESCE(receivable_generated,false) = false;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_h6c_entrega_ar_b2b_link ON public.entregas;
CREATE TRIGGER trg_h6c_entrega_ar_b2b_link
AFTER UPDATE OF receivable_id ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.fn_h6c_entrega_ar_b2b_link();

-- ---------------------------------------------------------------------
-- H6C-001.4 — fluxo oficial B2B usa a condicao canonica devolvida pelo gate
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure_impl(p_partner_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $impl$
DECLARE
  v_uid uuid := auth.uid();
  v_order record;
  v_partner record;
  v_settings record;
  v_terms record;
  v_receivable_id uuid;
  v_category_id uuid;
  v_payment_method_id uuid;
  v_existing uuid;
  v_sch record;
  v_ari_id uuid;
  v_installments_json jsonb := '[]'::jsonb;
  v_system_call boolean := (v_uid IS NULL);
  v_gate jsonb;
  v_fiscal jsonb;
  v_uf text;
BEGIN
  IF NOT v_system_call THEN
    IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'financeiro') OR has_role(v_uid,'gestor') OR has_role(v_uid,'gestor_comercial')) THEN
      INSERT INTO public.partner_order_audit_logs(order_id, usuario_id, acao, dados_novos)
        VALUES (p_partner_order_id, v_uid, 'financeiro_permissao_negada', jsonb_build_object('motivo','sem permissão'));
      RAISE EXCEPTION 'Sem permissão para gerar cobrança B2B';
    END IF;
  END IF;

  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_partner_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  -- GATE Fase C: elegibilidade server-side
  v_gate := public.fn_b2b_order_billing_eligibility(p_partner_order_id);
  IF NOT (v_gate->>'eligible')::boolean THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
      VALUES (p_partner_order_id, v_order.partner_id, v_uid, 'financeiro_bloqueado_gate', v_gate);
    RAISE EXCEPTION 'billing_not_eligible:%', v_gate->>'reason_code';
  END IF;

  -- H6C-001: condicao canonica vinculada ao pedido (nunca a mais recente).
  SELECT * INTO v_terms FROM public.partner_order_payment_terms
    WHERE id = NULLIF(v_gate->>'payment_terms_id','')::uuid
      AND partner_order_id = p_partner_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_terms_not_canonical'; END IF;

  SELECT receivable_id INTO v_existing FROM public.partner_order_financial_links WHERE partner_order_id = p_partner_order_id;
  IF v_existing IS NOT NULL THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
      VALUES (p_partner_order_id, v_order.partner_id, v_uid, 'financeiro_duplicidade_bloqueada', jsonb_build_object('receivable_id', v_existing));
    RETURN jsonb_build_object('receivable_id', v_existing, 'partner_order_id', p_partner_order_id, 'duplicado', true);
  END IF;

  SELECT * INTO v_partner FROM public.partner_accounts WHERE id = v_order.partner_id;
  SELECT * INTO v_settings FROM public.partner_financial_settings WHERE partner_id = v_order.partner_id;
  IF NOT FOUND THEN
    INSERT INTO public.partner_financial_settings(partner_id) VALUES (v_order.partner_id) RETURNING * INTO v_settings;
  END IF;

  v_uf := to_jsonb(v_partner) ->> 'uf';

  -- Derivação fiscal (fail-closed; nunca NOT_REQUIRED silencioso)
  v_fiscal := public.fn_fiscal_requirement_resolve(
    'b2b_partner', 'venda_mercadoria', v_uf, 'partner_order', p_partner_order_id, CURRENT_DATE);

  SELECT id INTO v_category_id FROM public.financial_categories
   WHERE upper(COALESCE(type::text,'')) IN ('RECEITA','INCOME') AND COALESCE(active,true) = true
   ORDER BY created_at ASC LIMIT 1;
  IF v_category_id IS NULL THEN
    SELECT id INTO v_category_id FROM public.financial_categories ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma categoria financeira cadastrada — cadastre uma categoria de receita antes de gerar cobranças B2B';
  END IF;

  SELECT id INTO v_payment_method_id FROM public.payment_methods
   WHERE lower(name) = lower(COALESCE(v_settings.default_payment_method,'pix')) LIMIT 1;

  INSERT INTO public.accounts_receivable(
    origin_type, origin_id, customer_id, partner_id, description,
    category_id, total_amount, issue_date, first_due_date, installment_count,
    status, fiscal_invoice_required, fiscal_invoice_status,
    fiscal_requirement_source, fiscal_policy_id, fiscal_exemption_id,
    payment_method_id, notes, created_by
  ) VALUES (
    'B2B_ORDER', p_partner_order_id,
    NULLIF(v_partner.client_id, NULL), v_order.partner_id,
    format('Pedido B2B %s - %s', v_order.numero, COALESCE(v_partner.nome_fantasia, v_partner.razao_social)),
    v_category_id, v_terms.final_amount, CURRENT_DATE, v_terms.first_due_date, v_terms.installment_count,
    'OPEN',
    (v_fiscal->>'required')::boolean,
    v_fiscal->>'status',
    v_fiscal->>'source',
    NULLIF(v_fiscal->>'policy_id','')::uuid,
    NULLIF(v_fiscal->>'exemption_id','')::uuid,
    v_payment_method_id,
    format(E'Condição: %s (%s)\nDesconto: %s%%  Juros: %s%% a.m. x %s meses\nTabela: %s  Líquido: %s  Final: %s\nFiscal: %s (%s)',
           v_terms.plan_name_snapshot, v_terms.plan_code_snapshot,
           v_terms.discount_percent_snapshot, v_terms.monthly_interest_percent_snapshot, v_terms.months_count_snapshot,
           v_terms.table_amount, v_terms.net_amount_after_discount, v_terms.final_amount,
           v_fiscal->>'status', v_fiscal->>'source'),
    COALESCE(v_uid, v_order.created_by)
  ) RETURNING id INTO v_receivable_id;

  DELETE FROM public.accounts_receivable_installments WHERE receivable_id = v_receivable_id;

  FOR v_sch IN
    SELECT * FROM public.partner_order_payment_schedule
     WHERE partner_order_id = p_partner_order_id AND payment_terms_id = v_terms.id
     ORDER BY installment_number
  LOOP
    INSERT INTO public.accounts_receivable_installments(
      receivable_id, installment_number, due_date,
      original_amount, interest_amount, net_amount, status
    ) VALUES (
      v_receivable_id, v_sch.installment_number, v_sch.due_date,
      v_sch.amount, COALESCE(v_sch.interest_amount, 0), v_sch.amount, 'OPEN'
    ) RETURNING id INTO v_ari_id;

    UPDATE public.partner_order_payment_schedule
       SET status = 'generated', receivable_installment_id = v_ari_id
     WHERE id = v_sch.id;

    v_installments_json := v_installments_json || jsonb_build_array(jsonb_build_object(
      'installment_number', v_sch.installment_number,
      'due_date', v_sch.due_date,
      'amount', v_sch.amount
    ));
  END LOOP;

  INSERT INTO public.partner_order_financial_links(
    partner_order_id, partner_id, receivable_id, financial_status, billing_trigger, created_by
  ) VALUES (
    p_partner_order_id, v_order.partner_id, v_receivable_id, 'gerado', v_settings.billing_trigger, v_uid
  );

  UPDATE public.partner_orders SET
    financial_status = 'gerado',
    receivable_generated = true,
    receivable_generated_at = now(),
    receivable_generated_by = v_uid,
    payment_due_date = v_terms.first_due_date,
    payment_method = COALESCE(v_settings.default_payment_method,'pix')
  WHERE id = p_partner_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (p_partner_order_id, v_order.partner_id, v_uid, 'financeiro_gerado_com_plano',
    jsonb_build_object(
      'receivable_id', v_receivable_id,
      'plan_code', v_terms.plan_code_snapshot,
      'plan_name', v_terms.plan_name_snapshot,
      'table_amount', v_terms.table_amount,
      'discount_amount', v_terms.discount_amount,
      'net_amount', v_terms.net_amount_after_discount,
      'interest_amount', v_terms.financial_interest_amount,
      'final_amount', v_terms.final_amount,
      'first_due_date', v_terms.first_due_date,
      'installment_count', v_terms.installment_count,
      'fiscal', v_fiscal,
      'gate', v_gate,
      'installments', v_installments_json
    ));

  RETURN jsonb_build_object(
    'receivable_id', v_receivable_id,
    'partner_order_id', p_partner_order_id,
    'valor', v_terms.final_amount,
    'vencimento', v_terms.first_due_date,
    'installment_count', v_terms.installment_count,
    'fiscal_invoice_required', (v_fiscal->>'required')::boolean,
    'fiscal_invoice_status', v_fiscal->>'status',
    'fiscal_requirement_source', v_fiscal->>'source',
    'status', 'OPEN'
  );
END 
$impl$;

REVOKE EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM anon;
