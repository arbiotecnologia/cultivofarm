-- Fase C2/C3/C4/C7 — cenario REAL: o rascunho e criado exclusivamente por
-- rpc_fiscal_draft_save (nenhum INSERT manual em fiscal_invoice_items).
-- Cenario 1: 1 item de R$ 10.000, reducao MANUAL 60%, ICMS 18% => base 4000 / 720.
-- Cenario 2: 3 itens + frete + seguro + outras despesas com residuo de centavos.
-- Compara PREVIEW x CALCULO PERSISTIDO. Transacao revertida ao final.
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
  v_prod uuid;
  v_src uuid := gen_random_uuid();
  v_cfs uuid;
  v_cert uuid := gen_random_uuid();
  v_inv uuid;
  v_inv2 uuid;
  saved jsonb; prev jsonb; calc jsonb; snap jsonb;
  icms_prev jsonb; icms_calc jsonb;
  v_item uuid;
  v_fr numeric; v_in numeric; v_ot numeric;
  v_diff int;
  ap numeric[];
BEGIN
  SELECT user_id INTO v_uid FROM public.user_roles WHERE role = 'administrador' LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'sem usuario admin para o cenario'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  INSERT INTO public.fiscal_environment_marker(id, project_ref, environment_label, production_emission_allowed)
  VALUES (true, 'swzpzcwiasxmjutrmvkm', 'STAGING', false)
  ON CONFLICT (id) DO UPDATE SET environment_label = 'STAGING', production_emission_allowed = false;

  UPDATE public.company_fiscal_settings
     SET legal_name = 'EMITENTE SINTETICO', cnpj = '11222333000181', crt = '3',
         state = 'SC', municipality_ibge_code = '4205407', city = 'FLORIANOPOLIS',
         nfe_environment_code = '2', nfe_readiness_status = 'READY_HOMOLOGATION',
         primary_cnae = '0111301', pis_cofins_regime = 'NAO_CUMULATIVO',
         postal_code = '78000000', street = 'AV SINTETICA', number = '100',
         neighborhood = 'CENTRO', country_code = '1058',
         state_registration = '251000001', nfe_series_number = 1,
         uf_accreditations = '["SC"]'::jsonb, accounting_validated_at = now(),
         ipi_taxpayer = false, icms_st_responsible = false,
         fcp_applicable = false, difal_responsible = false
   WHERE is_active;
  SELECT id INTO v_cfs FROM public.company_fiscal_settings WHERE is_active LIMIT 1;

  INSERT INTO public.clientes(id, nome, codigo_cliente) VALUES (v_cliente, 'CLIENTE SINTETICO', 'SYN-C1');
  INSERT INTO public.customer_fiscal_profiles(
    customer_id, taxpayer_indicator, fiscal_state, fiscal_municipality_ibge_code,
    final_consumer, icms_taxpayer, nfe_readiness_status, person_type, cpf_cnpj, legal_name,
    fiscal_postal_code, fiscal_street, fiscal_number, fiscal_neighborhood, fiscal_city,
    country_code, state_registration, fiscal_email)
  VALUES (v_cliente, '1', 'SC', '4205407', false, true, 'READY', 'PJ', '11222333000181', 'CLIENTE SINTETICO',
          '88000000', 'RUA SINTETICA', '200', 'CENTRO', 'FLORIANOPOLIS',
          '1058', '251000001', 'fiscal@example.invalid');

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
  UPDATE public.partner_orders SET status = 'aprovado' WHERE id = v_order;

  -- Perfil fiscal ATIVO do produto: fonte da materializacao server-side (C2).
  INSERT INTO public.product_fiscal_profiles(
    product_id, ncm, cest, origin_code, cfop_in_state, cfop_interstate,
    icms_cst, pis_cst, cofins_cst, commercial_unit, profile_status, is_active)
  VALUES (v_prod, '12345678', '1234567', '0', '5102', '6102',
          '20', '01', '01', 'UN', 'VALIDATED', true)
  ON CONFLICT (product_id) DO UPDATE
    SET ncm = '12345678', cest = '1234567', origin_code = '0',
        cfop_in_state = '5102', cfop_interstate = '6102', icms_cst = '20', is_active = true;

  INSERT INTO public.fiscal_certificates(
    id, company_settings_id, source_type, environment, status, display_name,
    valid_from, valid_until, is_active)
  VALUES (v_cert, v_cfs, 'SYSTEM_STORE', 'HOMOLOGATION', 'AVAILABLE', 'CERT SINTETICO',
          now() - interval '1 day', now() + interval '365 days', true);
  UPDATE public.company_fiscal_settings SET certificate_ref = v_cert::text WHERE id = v_cfs;

  INSERT INTO public.fiscal_official_sources(id, source_key, authority, name, url)
  VALUES (v_src, 'SYN-SEFAZ-SC-C', 'SEFAZ/SC', 'RICMS SC (cenario C)', 'https://example.invalid/ricms-sc');

  INSERT INTO public.fiscal_operation_policies(
    id, document_model, active, policy_status, direction, origin_uf, destination_uf,
    crt, cfop, nature_operation, priority, valid_from, legal_basis, legal_version,
    sales_channel, operation_type, requires_invoice, source_id, published_at, published_by)
  VALUES (gen_random_uuid(), '55', true, 'PUBLISHED', 'OUT', 'SC', 'SC', '3', '5102',
          'VENDA DE PRODUCAO', 1, current_date - 1, 'RICMS/SC', '2026',
          'b2b_partner', 'VENDA', true, v_src, now(), v_uid);

  INSERT INTO public.fiscal_tax_rules(
    rule_key, version, tax_kind, calc_mode, crt, cst, rate, base_reduction_mode,
    priority, valid_from, status, base_components, credit_own_icms,
    source_id, legal_basis, published_at, published_by)
  VALUES
    ('SYN-C-ICMS-20', 1, 'ICMS', 'PERCENT', '3', '20', 18, 'MANUAL', 1, current_date - 1, 'PUBLISHED', '["PRODUTO"]'::jsonb, true, v_src, 'RICMS/SC art. 1', now(), v_uid),
    ('SYN-C-PIS',     1, 'PIS',  'PERCENT', NULL, '01', 1.65, 'NONE',  1, current_date - 1, 'PUBLISHED', '["PRODUTO"]'::jsonb, false, v_src, 'Lei 10.637/2002', now(), v_uid),
    ('SYN-C-COFINS',  1, 'COFINS','PERCENT',NULL, '01', 7.6,  'NONE',  1, current_date - 1, 'PUBLISHED', '["PRODUTO"]'::jsonb, false, v_src, 'Lei 10.833/2003', now(), v_uid);

  -- ============ Rateio canonico isolado (C3) ============
  ap := public.fn_fiscal_apportion_v1(100.00, ARRAY[1,1,1]::numeric[]);
  PERFORM pg_temp.chk('rateio 100/3 soma exata', (ap[1]+ap[2]+ap[3]) = 100.00, ap::text);
  ap := public.fn_fiscal_apportion_v1(10.01, ARRAY[3333,3333,3334]::numeric[]);
  PERFORM pg_temp.chk('rateio residuo soma exata', (ap[1]+ap[2]+ap[3]) = 10.01, ap::text);
  ap := public.fn_fiscal_apportion_v1(0, ARRAY[10,20]::numeric[]);
  PERFORM pg_temp.chk('rateio zero', (ap[1]+ap[2]) = 0, ap::text);

  -- ============ CENARIO 1 — fluxo real pela RPC do wizard ============
  saved := public.rpc_fiscal_draft_save(
    NULL,
    jsonb_build_object(
      'invoice_type','NFE','document_model','NFE','environment','HOMOLOGATION',
      'series','1','issue_date', current_date::text, 'company_cnpj','11222333000181',
      'customer_id', v_cliente::text),
    jsonb_build_array(jsonb_build_object(
      'item_kind','PRODUCT','description','PRODUTO SINTETICO','quantity',1,
      'commercial_unit','UN','unit_value',10000,'discount_value',0,
      'source_item_type','produto','source_item_id', v_prod::text,
      'tax_input_snapshot', jsonb_build_object('ICMS', jsonb_build_object(
        'baseReductionPct', 60, 'baseReductionReason','homologacao C7')))),
    0);
  v_inv := (saved->>'id')::uuid;

  SELECT id, ncm_snapshot IS NOT NULL INTO v_item, saved
    FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = v_inv;
  SELECT id INTO v_item FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = v_inv;

  PERFORM pg_temp.chk('C2 ncm_snapshot materializado pela RPC',
    (SELECT ncm_snapshot FROM public.fiscal_invoice_items WHERE id = v_item) = '12345678',
    coalesce((SELECT ncm_snapshot FROM public.fiscal_invoice_items WHERE id = v_item),'null'));
  PERFORM pg_temp.chk('C2 cfop interno materializado',
    (SELECT cfop_snapshot FROM public.fiscal_invoice_items WHERE id = v_item) = '5102',
    coalesce((SELECT cfop_snapshot FROM public.fiscal_invoice_items WHERE id = v_item),'null'));
  PERFORM pg_temp.chk('C2 origem materializada',
    (SELECT origem_snapshot FROM public.fiscal_invoice_items WHERE id = v_item) = '0');
  PERFORM pg_temp.chk('C2 CST materializado',
    (SELECT cst_icms_snapshot FROM public.fiscal_invoice_items WHERE id = v_item) = '20');

  -- Roteamento do documento (origem/canal) — nao e dado tributario.
  UPDATE public.fiscal_invoices
     SET source_type = 'PARTNER_ORDER', source_id = v_order, direction = 'OUT',
         sales_channel = 'b2b_partner', tp_emis = 1
   WHERE id = v_inv;

  prev := public.rpc_fiscal_tax_preview_v1(v_inv, '[]'::jsonb);
  icms_prev := prev->'items'->0->'taxes'->'ICMS';
  PERFORM pg_temp.chk('C7 preview base 4000', (icms_prev->>'base')::numeric = 4000, coalesce(icms_prev->>'base','null'));
  PERFORM pg_temp.chk('C7 preview valor 720', (icms_prev->>'value')::numeric = 720, coalesce(icms_prev->>'value','null'));

  calc := public.rpc_fiscal_calculate_invoice_v1(v_inv, 'cflow-'||v_inv::text);
  SELECT tax_snapshot INTO snap FROM public.fiscal_invoice_items WHERE id = v_item;
  icms_calc := snap->'taxes'->'ICMS';
  PERFORM pg_temp.chk('C7 calculo sem INSERT manual roda', calc IS NOT NULL);
  PERFORM pg_temp.chk('C7 persistido base 4000', (icms_calc->>'base')::numeric = 4000, coalesce(icms_calc->>'base','null'));
  PERFORM pg_temp.chk('C7 persistido valor 720', (icms_calc->>'value')::numeric = 720, coalesce(icms_calc->>'value','null'));

  -- C4: paridade TOTAL entre preview e snapshot, tributo a tributo.
  SELECT count(*) INTO v_diff FROM jsonb_object_keys(snap->'taxes') k
   WHERE (prev->'items'->0->'taxes'->k) IS DISTINCT FROM (snap->'taxes'->k);
  PERFORM pg_temp.chk('C4 preview == snapshot em todos os tributos', v_diff = 0, v_diff::text||' divergencias');

  -- ============ CENARIO 2 — 3 itens com frete/seguro/outras despesas ============
  saved := public.rpc_fiscal_draft_save(
    NULL,
    jsonb_build_object(
      'invoice_type','NFE','document_model','NFE','environment','HOMOLOGATION',
      'series','1','issue_date', current_date::text, 'company_cnpj','11222333000181',
      'customer_id', v_cliente::text,
      'freight_value', 100.01, 'insurance_value', 33.33, 'other_value', 0.05),
    jsonb_build_array(
      jsonb_build_object('item_kind','PRODUCT','description','I1','quantity',1,'commercial_unit','UN','unit_value',333.33,'discount_value',0,'source_item_type','produto','source_item_id', v_prod::text,
        'tax_input_snapshot', jsonb_build_object('ICMS', jsonb_build_object('baseReductionPct', 60, 'baseReductionReason','c7'))),
      jsonb_build_object('item_kind','PRODUCT','description','I2','quantity',1,'commercial_unit','UN','unit_value',333.33,'discount_value',0,'source_item_type','produto','source_item_id', v_prod::text,
        'tax_input_snapshot', jsonb_build_object('ICMS', jsonb_build_object('baseReductionPct', 60, 'baseReductionReason','c7'))),
      jsonb_build_object('item_kind','PRODUCT','description','I3','quantity',1,'commercial_unit','UN','unit_value',333.34,'discount_value',0,'source_item_type','produto','source_item_id', v_prod::text,
        'tax_input_snapshot', jsonb_build_object('ICMS', jsonb_build_object('baseReductionPct', 60, 'baseReductionReason','c7')))),
    0);
  v_inv2 := (saved->>'id')::uuid;

  SELECT sum(freight_value), sum(insurance_value), sum(other_value)
    INTO v_fr, v_in, v_ot FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = v_inv2;
  PERFORM pg_temp.chk('C3 soma frete == total', v_fr = 100.01, coalesce(v_fr::text,'null'));
  PERFORM pg_temp.chk('C3 soma seguro == total', v_in = 33.33, coalesce(v_in::text,'null'));
  PERFORM pg_temp.chk('C3 soma outras == total', v_ot = 0.05, coalesce(v_ot::text,'null'));

  UPDATE public.fiscal_invoices
     SET source_type = 'PARTNER_ORDER', source_id = v_order, direction = 'OUT',
         sales_channel = 'b2b_partner', tp_emis = 1
   WHERE id = v_inv2;

  prev := public.rpc_fiscal_tax_preview_v1(v_inv2, '[]'::jsonb);
  calc := public.rpc_fiscal_calculate_invoice_v1(v_inv2, 'cflow2-'||v_inv2::text);

  SELECT count(*) INTO v_diff
    FROM public.fiscal_invoice_items i
    JOIN LATERAL jsonb_array_elements(prev->'items') pi
      ON (pi->>'itemSequence')::int = i.item_sequence
   WHERE i.fiscal_invoice_id = v_inv2
     AND (pi->'taxes') IS DISTINCT FROM (i.tax_snapshot->'taxes');
  PERFORM pg_temp.chk('C7 multi-item: preview == snapshot (zero centavo de diferenca)', v_diff = 0, v_diff::text||' itens divergentes');

  PERFORM pg_temp.chk('C3 totais do documento incluem encargos',
    (SELECT (fiscal_totals_snapshot->>'vFrete')::numeric FROM public.fiscal_invoices WHERE id = v_inv2) = 100.01,
    (SELECT fiscal_totals_snapshot->>'vFrete' FROM public.fiscal_invoices WHERE id = v_inv2));
END $out$;

SELECT nome, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, detalhe FROM t_result ORDER BY nome;
SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail FROM t_result;

ROLLBACK;
