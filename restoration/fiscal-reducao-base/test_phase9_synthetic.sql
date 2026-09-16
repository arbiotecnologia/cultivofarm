-- Fase 9 — Homologacao com NF-e sintetica (redução da base de calculo).
-- Cenario completo: emitente + destinatario + pedido B2B + politica + regras
-- fiscais + rascunho com reducao MANUAL de 60%.
-- Compara PREVIEW x CALCULO PERSISTIDO x TOTAIS. Transacao revertida ao final.
-- Executar com: psql -v ON_ERROR_STOP=1 -f test_phase9_synthetic.sql
BEGIN;

CREATE TEMP TABLE t_result(nome text, ok boolean, detalhe text);
CREATE OR REPLACE FUNCTION pg_temp.chk(_nome text, _cond boolean, _detalhe text DEFAULT '')
RETURNS void LANGUAGE sql AS $$ INSERT INTO t_result VALUES (_nome, _cond, _detalhe) $$;

DO $out$
DECLARE
  v_uid uuid;
  v_cliente uuid := gen_random_uuid();
  v_partner uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_inv uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_prod uuid;
  v_src uuid := gen_random_uuid();
  v_cfs uuid;
  v_cert uuid := gen_random_uuid();
  prev jsonb; calc jsonb; snap jsonb; icms_prev jsonb; icms_calc jsonb;
BEGIN
  SELECT user_id INTO v_uid FROM public.user_roles WHERE role = 'administrador' LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sem usuario admin para o cenario'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- Marcador de ambiente fiscal (staging) exigido pelo gate; revertido ao final.
  INSERT INTO public.fiscal_environment_marker(id, project_ref, environment_label, production_emission_allowed)
  VALUES (true, 'swzpzcwiasxmjutrmvkm', 'STAGING', false)
  ON CONFLICT (id) DO UPDATE SET environment_label = 'STAGING', production_emission_allowed = false;

  -- Emitente em homologacao, Regime Normal (CRT 3), sem IPI/ST/FCP/DIFAL.
  -- Existe singleton ativo: o cenario ajusta a linha ativa dentro da transacao
  -- revertida (nenhuma alteracao permanente no emitente real).
  IF EXISTS (SELECT 1 FROM public.company_fiscal_settings WHERE is_active) THEN
    UPDATE public.company_fiscal_settings
       SET legal_name = 'EMITENTE SINTETICO', cnpj = '11222333000181', crt = '3',
           state = 'MT', municipality_ibge_code = '5103403', city = 'CUIABA',
           nfe_environment_code = '2', nfe_readiness_status = 'READY_HOMOLOGATION',
           primary_cnae = '0111301', pis_cofins_regime = 'NAO_CUMULATIVO',
           postal_code = '78000000', street = 'AV SINTETICA', number = '100',
           neighborhood = 'CENTRO', country_code = '1058',
           state_registration = '12345678901', nfe_series_number = 1,
           uf_accreditations = '["MT"]'::jsonb,
           accounting_validated_at = now(),
           ipi_taxpayer = false, icms_st_responsible = false,
           fcp_applicable = false, difal_responsible = false
     WHERE is_active;
  ELSE
    INSERT INTO public.company_fiscal_settings(
      id, is_active, legal_name, cnpj, crt, state, municipality_ibge_code, city,
      nfe_environment_code, nfe_readiness_status, ipi_taxpayer, icms_st_responsible,
      fcp_applicable, difal_responsible, primary_cnae, pis_cofins_regime, postal_code,
      street, number, neighborhood, country_code, state_registration,
      nfe_series_number, uf_accreditations, certificate_ref, accounting_validated_at)
    VALUES (gen_random_uuid(), true, 'EMITENTE SINTETICO', '11222333000181', '3', 'MT',
            '5103403', 'CUIABA', '2', 'READY_HOMOLOGATION', false, false, false, false,
            '0111301', 'NAO_CUMULATIVO', '78000000', 'AV SINTETICA', '100', 'CENTRO',
            '1058', '12345678901', 1, '["MT"]'::jsonb, NULL, now());
  END IF;


  INSERT INTO public.clientes(id, nome, codigo_cliente) VALUES (v_cliente, 'CLIENTE SINTETICO', 'SYN-1');

  INSERT INTO public.customer_fiscal_profiles(
    customer_id, taxpayer_indicator, fiscal_state, fiscal_municipality_ibge_code,
    final_consumer, icms_taxpayer, nfe_readiness_status, person_type, cpf_cnpj, legal_name)
  VALUES (v_cliente, '1', 'MT', '5103403', false, true, 'READY', 'PJ', '11222333000181', 'CLIENTE SINTETICO');

  INSERT INTO public.partner_accounts(id, razao_social, client_id, ativo)
  VALUES (v_partner, 'PARCEIRO SINTETICO', v_cliente, true);

  INSERT INTO public.partner_orders(
    id, partner_id, status, approved_by, approved_at, payment_condition_status,
    requires_financial_approval, financial_approval_status, created_by, total)
  VALUES (v_order, v_partner, 'rascunho', v_uid, now(), 'accepted', false, 'approved', v_uid, 10000);

  SELECT id INTO v_prod FROM public.produtos LIMIT 1;
  INSERT INTO public.partner_order_items(
    id, order_id, product_id, quantidade, preco_unitario, preco_unitario_final_snapshot,
    price_source_snapshot, pricing_mode_snapshot, produto_nome_snapshot)
  VALUES (gen_random_uuid(), v_order, v_prod, 1, 10000, 10000, 'TABELA', 'price_list', 'PRODUTO SINTETICO');

  -- Itens inseridos antes da aprovacao (guard de imutabilidade pos-aprovacao).
  UPDATE public.partner_orders SET status = 'aprovado' WHERE id = v_order;

  -- Certificado sintetico disponivel em homologacao (revertido ao final).
  SELECT id INTO v_cfs FROM public.company_fiscal_settings WHERE is_active LIMIT 1;
  INSERT INTO public.fiscal_certificates(
    id, company_settings_id, source_type, environment, status, display_name,
    valid_from, valid_until, is_active)
  VALUES (v_cert, v_cfs, 'SYSTEM_STORE', 'HOMOLOGATION', 'AVAILABLE', 'CERT SINTETICO',
          now() - interval '1 day', now() + interval '365 days', true);
  UPDATE public.company_fiscal_settings SET certificate_ref = v_cert::text WHERE id = v_cfs;

  -- Fonte oficial exigida pelas evidencias de publicacao.
  INSERT INTO public.fiscal_official_sources(id, source_key, authority, name, url)
  VALUES (v_src, 'SYN-SEFAZ-MT', 'SEFAZ/MT', 'RICMS MT (cenario sintetico)', 'https://example.invalid/ricms-mt');

  -- Politica de operacao publicada.
  INSERT INTO public.fiscal_operation_policies(
    id, document_model, active, policy_status, direction, origin_uf, destination_uf,
    crt, cfop, nature_operation, priority, valid_from, legal_basis, legal_version,
    sales_channel, operation_type, requires_invoice, source_id, published_at, published_by)
  VALUES (gen_random_uuid(), '55', true, 'PUBLISHED', 'OUT', 'MT', 'MT', '3', '5102',
          'VENDA DE PRODUCAO', 1, current_date - 1, 'RICMS/MT', '2026',
          'b2b_partner', 'VENDA', true, v_src, now(), v_uid);

  -- Regras tributarias publicadas: ICMS MANUAL (CST 20), PIS e COFINS.
  INSERT INTO public.fiscal_tax_rules(
    rule_key, version, tax_kind, calc_mode, crt, cst, rate, base_reduction_mode,
    priority, valid_from, status, base_components, credit_own_icms,
    source_id, legal_basis, published_at, published_by)
  VALUES
    ('SYN-ICMS-20', 1, 'ICMS', 'PERCENT', '3', '20', 18, 'MANUAL', 1, current_date - 1, 'PUBLISHED', '["PRODUTO"]'::jsonb, true, v_src, 'RICMS/MT art. 1', now(), v_uid),
    ('SYN-PIS',     1, 'PIS',  'PERCENT', NULL, '01', 1.65, 'NONE',  1, current_date - 1, 'PUBLISHED', '["PRODUTO"]'::jsonb, false, v_src, 'Lei 10.637/2002', now(), v_uid),
    ('SYN-COFINS',  1, 'COFINS','PERCENT',NULL, '01', 7.6,  'NONE',  1, current_date - 1, 'PUBLISHED', '["PRODUTO"]'::jsonb, false, v_src, 'Lei 10.833/2003', now(), v_uid);

  -- Rascunho da NF-e.
  INSERT INTO public.fiscal_invoices(
    id, invoice_type, document_model, status, source_type, source_id, customer_id,
    direction, environment, issue_date, created_by, tp_emis, sales_channel)
  VALUES (v_inv, 'NFE', 'NFE', 'DRAFT', 'PARTNER_ORDER', v_order, v_cliente,
          'OUT', 'HOMOLOGATION', current_date, v_uid, 1, 'b2b_partner');

  INSERT INTO public.fiscal_invoice_items(
    id, fiscal_invoice_id, item_sequence, item_kind, description, quantity,
    unit_value, gross_value, ncm_snapshot, cfop_snapshot, cst_icms_snapshot,
    origem_snapshot, tax_input_snapshot)
  VALUES (v_item, v_inv, 1, 'PRODUCT', 'PRODUTO SINTETICO', 1, 10000, 10000,
          '12345678', '5102', '20', '0',
          '{"ICMS":{"baseReductionPct":60,"baseReductionReason":"homologacao sintetica"}}'::jsonb);

  -- PREVIEW (sem escrita).
  prev := public.rpc_fiscal_tax_preview_v1(v_inv, '[]'::jsonb);
  icms_prev := prev->'items'->0->'taxes'->'ICMS';
  PERFORM pg_temp.chk('preview base 4000', (icms_prev->>'base')::numeric = 4000, coalesce(icms_prev->>'base','null'));
  PERFORM pg_temp.chk('preview valor 720', (icms_prev->>'value')::numeric = 720, coalesce(icms_prev->>'value','null'));
  PERFORM pg_temp.chk('preview pct 60',    (icms_prev->>'baseReductionPct')::numeric = 60, coalesce(icms_prev->>'baseReductionPct','null'));
  PERFORM pg_temp.chk('preview source MANUAL', icms_prev->>'baseReductionSource' = 'MANUAL', coalesce(icms_prev->>'baseReductionSource','null'));

  -- CALCULO PERSISTIDO.
  calc := public.rpc_fiscal_calculate_invoice_v1(v_inv, 'syn-'||v_inv::text);
  SELECT tax_snapshot INTO snap FROM public.fiscal_invoice_items WHERE id = v_item;
  icms_calc := snap->'taxes'->'ICMS';
  PERFORM pg_temp.chk('persistido base 4000', (icms_calc->>'base')::numeric = 4000, coalesce(icms_calc->>'base','null'));
  PERFORM pg_temp.chk('persistido valor 720', (icms_calc->>'value')::numeric = 720, coalesce(icms_calc->>'value','null'));
  PERFORM pg_temp.chk('persistido baseOriginal 10000', (icms_calc->>'baseOriginal')::numeric = 10000, coalesce(icms_calc->>'baseOriginal','null'));

  -- PREVIEW == PERSISTIDO (sem divergencia entre etapas).
  PERFORM pg_temp.chk('preview == persistido (base)',  (icms_prev->>'base')  = (icms_calc->>'base'));
  PERFORM pg_temp.chk('preview == persistido (valor)', (icms_prev->>'value') = (icms_calc->>'value'));
  PERFORM pg_temp.chk('preview == persistido (pct)',   (icms_prev->>'baseReductionPct') = (icms_calc->>'baseReductionPct'));

  -- Totais do documento coerentes com a base reduzida.
  PERFORM pg_temp.chk('total vICMS 720',
    (SELECT (fiscal_totals_snapshot->>'vICMS')::numeric FROM public.fiscal_invoices WHERE id = v_inv) = 720,
    (SELECT fiscal_totals_snapshot->>'vICMS' FROM public.fiscal_invoices WHERE id = v_inv));
  PERFORM pg_temp.chk('total vBC 4000',
    (SELECT (fiscal_totals_snapshot->>'vBC')::numeric FROM public.fiscal_invoices WHERE id = v_inv) = 4000,
    (SELECT fiscal_totals_snapshot->>'vBC' FROM public.fiscal_invoices WHERE id = v_inv));

  -- Auditoria da reducao registrada.
  PERFORM pg_temp.chk('auditoria BASE_REDUCTION_CHANGE',
    EXISTS (SELECT 1 FROM public.fiscal_audit_log
            WHERE record_id = v_item AND action = 'BASE_REDUCTION_CHANGE'));
END $out$;

SELECT nome, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, detalhe FROM t_result ORDER BY nome;
SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail FROM t_result;

ROLLBACK;
