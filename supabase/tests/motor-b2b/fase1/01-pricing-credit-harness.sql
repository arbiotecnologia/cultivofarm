-- =====================================================================
-- FASE 1 — Harness de runtime: precedencia de precos + exposicao de credito
-- Ambiente: staging ikaauvsflpmamgxmkhoq. Producao recusada.
-- Todas as fixtures vivem em subtransacao e sao SEMPRE revertidas.
-- Nao cria, altera ou remove nenhum dado operacional.
-- As evidencias sao acumuladas em variavel de memoria (nao transacional),
-- por isso sobrevivem ao rollback da subtransacao.
-- =====================================================================
\set ON_ERROR_STOP on

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'STAGING_GUARD: marker ausente'; END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN RAISE EXCEPTION 'STAGING_GUARD: PRODUCAO recusada'; END IF;
  IF v_ref <> 'ikaauvsflpmamgxmkhoq' THEN RAISE EXCEPTION 'STAGING_GUARD: ref inesperado %', v_ref; END IF;
END $guard$;

CREATE TEMP TABLE IF NOT EXISTS _fase1_evidence (
  id bigserial PRIMARY KEY, test_code text, descricao text,
  esperado text, obtido text, passou boolean
);
DELETE FROM _fase1_evidence;

DO $main$
DECLARE
  v_partner uuid; v_prod uuid; v_micro uuid; v_plan uuid; v_disc numeric;
  v_lit numeric; v_dose numeric; v_dml numeric;
  v_r jsonb; v_rule uuid; v_fail int; v_err text;
  v_open numeric; v_committed numeric; v_audit int;
  v_ev jsonb := '[]'::jsonb;

BEGIN
  SELECT id INTO v_partner FROM public.partner_accounts ORDER BY created_at LIMIT 1;
  SELECT id, valor_litro_brl, valor_dose_brl, dose_ml_ha
    INTO v_prod, v_lit, v_dose, v_dml
  FROM public.produtos pr WHERE pr.valor_litro_brl > 0 AND pr.valor_dose_brl > 0 AND pr.dose_ml_ha > 0
    AND NOT EXISTS (SELECT 1 FROM public.partner_product_prices ppp
                    WHERE ppp.partner_id = v_partner AND ppp.product_id = pr.id)
  ORDER BY pr.created_at LIMIT 1;
  SELECT id INTO v_micro FROM public.microrganismos LIMIT 1;
  SELECT id, discount_percent INTO v_plan, v_disc
  FROM public.commercial_payment_plans WHERE active AND discount_percent > 0 ORDER BY sort_order LIMIT 1;

  IF v_partner IS NULL OR v_prod IS NULL OR v_plan IS NULL THEN
    RAISE EXCEPTION 'FIXTURE_BASE_AUSENTE (partner=% prod=% plan=%)', v_partner, v_prod, v_plan;
  END IF;

  BEGIN  -- ============ SUBTRANSACAO: tudo abaixo e revertido ============

    -- P3.1 catalogo / hectare
    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan, v_prod, NULL, 'hectare', NULL, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','P3.1','d','Prioridade 3 catalogo hectare',
      'e', round((v_dml/100.0*v_dose) * (1 - v_disc/100.0), 2)::text || '|catalog_base_price',
      'o', coalesce(v_r->>'unit_price','null') || '|' || coalesce(v_r->>'price_source','null'),
      'p', ((v_r->>'unit_price')::numeric = round((v_dml/100.0*v_dose) * (1 - v_disc/100.0), 2)
            AND v_r->>'price_source' = 'catalog_base_price')));

    -- P3.2 catalogo / litro
    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan, v_prod, NULL, 'litro', NULL, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','P3.2','d','Prioridade 3 catalogo litro',
      'e', round(v_lit * (1 - v_disc/100.0), 2)::text,
      'o', coalesce(v_r->>'unit_price','null'),
      'p', (v_r->>'unit_price')::numeric = round(v_lit * (1 - v_disc/100.0), 2)));

    -- P3.3 catalogo / unidade 500 ml
    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan, v_prod, NULL, 'unidade', 500, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','P3.3','d','Prioridade 3 catalogo unidade 500ml',
      'e', round((500/1000.0*v_lit) * (1 - v_disc/100.0), 2)::text,
      'o', coalesce(v_r->>'unit_price','null'),
      'p', (v_r->>'unit_price')::numeric = round((500/1000.0*v_lit) * (1 - v_disc/100.0), 2)));

    -- P2 preco-base do parceiro vence o catalogo e ignora desconto_percentual legado
    INSERT INTO public.partner_product_prices
      (partner_id, product_id, preco_tabela, desconto_percentual, preco_final, ativo, is_current, valid_from)
    VALUES (v_partner, v_prod, 120.00, 10, 108.00, true, true, current_date - 1);

    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan, v_prod, NULL, 'litro', NULL, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','P2.1','d','Prioridade 2 preco-base do parceiro (ignora desconto legado)',
      'e', round(120.00 * (1 - v_disc/100.0), 2)::text || '|partner_base_price',
      'o', coalesce(v_r->>'unit_price','null') || '|' || coalesce(v_r->>'price_source','null'),
      'p', ((v_r->>'unit_price')::numeric = round(120.00 * (1 - v_disc/100.0), 2)
            AND v_r->>'price_source' = 'partner_base_price')));

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','P2.2','d','preco_final legado (108,00) nunca e usado',
      'e','<> 108.00','o', coalesce(v_r->>'unit_price','null'),
      'p', (v_r->>'unit_price')::numeric <> 108.00));

    -- P1 preco fixo da condicao vence tudo e nao recebe desconto do plano
    INSERT INTO public.commercial_price_rules
      (buyer_scope, partner_id, plan_id, product_id, unit_type, pricing_mode, condition_price, valid_from, motivo)
    VALUES ('partner', v_partner, v_plan, v_prod, 'litro', 'fixed_item_price', 82.00, current_date - 1, 'harness fase 1')
    RETURNING id INTO v_rule;

    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan, v_prod, NULL, 'litro', NULL, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','P1.1','d','Prioridade 1 preco fixo da condicao',
      'e','82.00|condition_fixed_price|0',
      'o', coalesce(v_r->>'unit_price','null')||'|'||coalesce(v_r->>'price_source','null')||'|'||coalesce(v_r->>'plan_discount_percent','null'),
      'p', ((v_r->>'unit_price')::numeric = 82.00
            AND v_r->>'price_source' = 'condition_fixed_price'
            AND (v_r->>'plan_discount_percent')::numeric = 0)));

    -- P1.2 fora da vigencia -> cai para a prioridade seguinte
    UPDATE public.commercial_price_rules SET valid_until = current_date - 1 WHERE id = v_rule;
    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan, v_prod, NULL, 'litro', NULL, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','P1.2','d','Regra vencida nao se aplica','e','partner_base_price',
      'o', coalesce(v_r->>'price_source','null'), 'p', v_r->>'price_source' = 'partner_base_price'));

    -- P1.3 regra inativa nao se aplica
    UPDATE public.commercial_price_rules SET valid_until = NULL, active = false WHERE id = v_rule;
    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan, v_prod, NULL, 'litro', NULL, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','P1.3','d','Regra inativa nao se aplica','e','partner_base_price',
      'o', coalesce(v_r->>'price_source','null'), 'p', v_r->>'price_source' = 'partner_base_price'));

    -- P4 quote_only
    UPDATE public.commercial_price_rules
       SET active = true, pricing_mode = 'quote_only', condition_price = NULL WHERE id = v_rule;
    v_r := public.fn_resolve_commercial_price('partner', v_partner, NULL, v_plan, v_prod, NULL, 'litro', NULL, current_date);
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','P4.1','d','Prioridade 4 quote_only','e','QUOTE_REQUIRED|true|null',
      'o', coalesce(v_r->>'reason_code','null')||'|'||coalesce(v_r->>'quote_required','null')||'|'||coalesce(v_r->>'unit_price','null'),
      'p', (v_r->>'reason_code' = 'QUOTE_REQUIRED' AND (v_r->>'quote_required')::boolean
            AND v_r->>'unit_price' IS NULL)));

    -- C1 sobreposicao de regras ativas para a mesma chave
    BEGIN
      INSERT INTO public.commercial_price_rules
        (buyer_scope, partner_id, plan_id, product_id, unit_type, pricing_mode, condition_price, valid_from)
      VALUES ('partner', v_partner, v_plan, v_prod, 'litro', 'fixed_item_price', 90.00, current_date);
      v_ev := v_ev || jsonb_build_array(jsonb_build_object('c','C1','d','Sobreposicao ativa bloqueada','e','exclusion_violation','o','aceita','p',false));
    EXCEPTION WHEN exclusion_violation THEN
      v_ev := v_ev || jsonb_build_array(jsonb_build_object('c','C1','d','Sobreposicao ativa bloqueada','e','exclusion_violation','o','exclusion_violation','p',true));
    END;

    -- C2 preco fixo sem valor
    BEGIN
      INSERT INTO public.commercial_price_rules
        (buyer_scope, partner_id, plan_id, product_id, unit_type, pricing_mode, valid_from)
      VALUES ('partner', v_partner, v_plan, v_prod, 'dose', 'fixed_item_price', current_date);
      v_ev := v_ev || jsonb_build_array(jsonb_build_object('c','C2','d','fixed_item_price exige condition_price','e','check_violation','o','aceita','p',false));
    EXCEPTION WHEN check_violation THEN
      v_ev := v_ev || jsonb_build_array(jsonb_build_object('c','C2','d','fixed_item_price exige condition_price','e','check_violation','o','check_violation','p',true));
    END;

    -- C3 comprador ambiguo
    BEGIN
      INSERT INTO public.commercial_price_rules
        (buyer_scope, partner_id, customer_id, plan_id, product_id, unit_type, pricing_mode, valid_from)
      VALUES ('partner', v_partner, (SELECT id FROM public.clientes LIMIT 1), v_plan, v_prod, 'dose', 'quote_only', current_date);
      v_ev := v_ev || jsonb_build_array(jsonb_build_object('c','C3','d','Comprador ambiguo bloqueado','e','check_violation','o','aceita','p',false));
    EXCEPTION WHEN check_violation THEN
      v_ev := v_ev || jsonb_build_array(jsonb_build_object('c','C3','d','Comprador ambiguo bloqueado','e','check_violation','o','check_violation','p',true));
    END;

    -- C4 produto e microrganismo simultaneos
    BEGIN
      INSERT INTO public.commercial_price_rules
        (buyer_scope, partner_id, plan_id, product_id, microrganismo_id, unit_type, pricing_mode, valid_from)
      VALUES ('partner', v_partner, v_plan, v_prod, v_micro, 'dose', 'quote_only', current_date);
      v_ev := v_ev || jsonb_build_array(jsonb_build_object('c','C4','d','Item XOR produto/microrganismo','e','check_violation','o','aceita','p',false));
    EXCEPTION WHEN check_violation THEN
      v_ev := v_ev || jsonb_build_array(jsonb_build_object('c','C4','d','Item XOR produto/microrganismo','e','check_violation','o','check_violation','p',true));
    END;

    -- C5 volume obrigatorio na unidade comercial
    BEGIN
      INSERT INTO public.commercial_price_rules
        (buyer_scope, partner_id, plan_id, product_id, unit_type, pricing_mode, valid_from)
      VALUES ('partner', v_partner, v_plan, v_prod, 'unidade', 'quote_only', current_date);
      v_ev := v_ev || jsonb_build_array(jsonb_build_object('c','C5','d','unidade exige volume_ml','e','check_violation','o','aceita','p',false));
    EXCEPTION WHEN check_violation THEN
      v_ev := v_ev || jsonb_build_array(jsonb_build_object('c','C5','d','unidade exige volume_ml','e','check_violation','o','check_violation','p',true));
    END;

    -- A1 auditoria gravada
    SELECT count(*)::int INTO v_audit FROM public.commercial_audit_log WHERE acao LIKE 'price_rule_%';
    v_ev := v_ev || jsonb_build_array(jsonb_build_object('c','A1','d','Auditoria de regra de preco registrada','e','>=1','o',v_audit::text,'p', v_audit >= 1));

    -- K1/K2 credito
    v_r := public.fn_b2b_credit_exposure(v_partner, 1000, NULL);

    SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_open
    FROM public.accounts_receivable ar
    JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
    WHERE ar.partner_id = v_partner AND ar.status <> 'CANCELED'
      AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

    SELECT COALESCE(SUM(ROUND(COALESCE(po.final_amount_with_interest, po.total, 0),2)),0) INTO v_committed
    FROM public.partner_orders po
    WHERE po.partner_id = v_partner
      AND po.status IN ('aprovado','em_producao','produzido','aguardando_entrega',
                        'confirmado','em_separacao','enviado','entregue')
      AND COALESCE(po.receivable_generated,false) = false
      AND NOT EXISTS (SELECT 1 FROM public.partner_order_financial_links pofl WHERE pofl.partner_order_id = po.id);

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','K1','d','exposicao_projetada = aberto + comprometido + novo pedido',
      'e', round(v_open + v_committed + 1000, 2)::text,
      'o', coalesce(v_r->>'exposicao_projetada','null'),
      'p', (v_r->>'exposicao_projetada')::numeric = round(v_open + v_committed + 1000, 2)));

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','K2','d','exposicao_atual = aberto + comprometido (sem dupla contagem)',
      'e', round(v_open + v_committed, 2)::text,
      'o', coalesce(v_r->>'exposicao_atual','null'),
      'p', (v_r->>'exposicao_atual')::numeric = round(v_open + v_committed, 2)));

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','K3','d','Chaves novas de exposicao presentes','e','true',
      'o', (v_r ? 'comprometido_nao_faturado' AND v_r ? 'exposicao_projetada'
            AND v_r ? 'credito_disponivel' AND v_r ? 'reason_code')::text,
      'p', (v_r ? 'comprometido_nao_faturado' AND v_r ? 'exposicao_projetada'
            AND v_r ? 'credito_disponivel' AND v_r ? 'reason_code')));

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','K4','d','rpc_b2b_partner_credit mantem assinatura e devolve superset','e','true',
      'o', (public.rpc_b2b_partner_credit(v_partner) ? 'exposicao_projetada')::text,
      'p', public.rpc_b2b_partner_credit(v_partner) ? 'exposicao_projetada'));

    -- S1..S4 ACLs e integridade do snapshot
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','S1','d','anon sem privilegio na matriz','e','false',
      'o', has_table_privilege('anon','public.commercial_price_rules','SELECT')::text,
      'p', NOT has_table_privilege('anon','public.commercial_price_rules','SELECT')));

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','S2','d','anon sem EXECUTE nas RPCs novas','e','false',
      'o', (has_function_privilege('anon','public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb)','EXECUTE')
            OR has_function_privilege('anon','public.rpc_b2b_credit_exposure(uuid,numeric,uuid)','EXECUTE'))::text,
      'p', NOT (has_function_privilege('anon','public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb)','EXECUTE')
            OR has_function_privilege('anon','public.rpc_b2b_credit_exposure(uuid,numeric,uuid)','EXECUTE'))));

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','S3','d','authenticated sem EXECUTE na funcao interna de credito','e','false',
      'o', has_function_privilege('authenticated','public.fn_b2b_credit_exposure(uuid,numeric,uuid)','EXECUTE')::text,
      'p', NOT has_function_privilege('authenticated','public.fn_b2b_credit_exposure(uuid,numeric,uuid)','EXECUTE')));

    SELECT count(*)::int INTO v_audit
    FROM public._motor_b2b_pre_phase1_snapshot s
    JOIN pg_proc p ON p.proname = s.proname
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM s.checksum_md5;

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','S4','d','Apenas as 2 funcoes de credito divergem do snapshot da Fase 0.1',
      'e','2','o', v_audit::text, 'p', v_audit = 2));

    RAISE EXCEPTION 'ROLLBACK_HARNESS_FASE1';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err <> 'ROLLBACK_HARNESS_FASE1' THEN
      RAISE EXCEPTION 'HARNESS_FALHOU: %', v_err;
    END IF;
  END;

  INSERT INTO _fase1_evidence(test_code, descricao, esperado, obtido, passou)
  SELECT e->>'c', e->>'d', e->>'e', e->>'o', (e->>'p')::boolean
  FROM jsonb_array_elements(v_ev) e;

  SELECT count(*)::int INTO v_fail FROM _fase1_evidence WHERE NOT passou;
  IF v_fail > 0 THEN RAISE EXCEPTION 'FASE1_HARNESS: % teste(s) falharam', v_fail; END IF;
  RAISE NOTICE 'FASE1_HARNESS: % testes, todos aprovados', jsonb_array_length(v_ev);
END $main$;

SELECT test_code, descricao, esperado, obtido, passou FROM _fase1_evidence ORDER BY id;

DROP TABLE IF EXISTS _fase1_evidence;
