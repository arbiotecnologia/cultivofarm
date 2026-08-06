-- =====================================================================
-- FASE F3 — CORREÇÃO — RUNTIME HARNESS (autenticado, fixtures REVERTIDAS)
-- Ambiente: STAGING ikaauvsflpmamgxmkhoq. Nada é persistido: ROLLBACK final.
-- Cobre: idempotência/numeração, elegibilidade fail-closed, motor tributário
-- canônico (ICMS/ICMS-ST/FCP/FCP-ST/DIFAL), ambiguidade, prontidão e RBAC.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _f3c_result(n int, name text, ok boolean, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.ok(_n int, _name text, _detail text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$ INSERT INTO _f3c_result VALUES (_n,_name,true,_detail) $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_root() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role','postgres', true);
  PERFORM set_config('request.jwt.claims','', true);
END $$;

DO $harness$
DECLARE
  U_ADMIN  uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a';
  U_GESTOR uuid := '3e16d523-1bc9-4502-a5d6-04d150747236';
  U_FIN    uuid := 'd56793fa-acb3-4862-a180-498c20f5317f';
  U_PROD   uuid := '85998744-78fd-41ae-b74e-2b763e7f8089';

  v_company uuid; v_cliente uuid; v_profile uuid;
  v_src uuid; v_pol_go uuid; v_pol_dup uuid;
  v_order uuid; v_inv uuid; v_inv2 uuid;
  v_rule public.fiscal_tax_rules%ROWTYPE; v_rid uuid;
  v_res jsonb; v_snap jsonb; v_txt text; v_num int; v_num2 numeric;
  v_ctx jsonb;
BEGIN
  PERFORM pg_temp.as_root();
  SELECT id INTO v_src FROM public.fiscal_official_sources WHERE source_key='GUIA_EFD_ICMS_IPI_322';
  SELECT id INTO v_company FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  SELECT id INTO v_cliente FROM public.clientes ORDER BY created_at LIMIT 1;

  -- ===================== FIXTURE: EMITENTE PRONTO ====================
  UPDATE public.company_fiscal_settings
     SET cnpj='11.222.333/0001-81', legal_name='AR BIO HARNESS LTDA', crt='3',
         state_registration='10.987.654-7', primary_cnae='2029100',
         postal_code='74000-000', street='Rua Sintetica', number='100',
         neighborhood='Centro', city='Goiania', state='GO',
         municipality_ibge_code='5208707', country_code='1058',
         nfe_series_number=1, nfe_environment_code='2',
         pis_cofins_regime='NAO_CUMULATIVO',
         uf_accreditations='[{"uf":"GO","accredited":true}]'::jsonb,
         certificate_ref='harness_cert_ref_f3c',
         ipi_taxpayer=false, icms_st_responsible=false,
         fcp_applicable=false, difal_responsible=false
   WHERE id=v_company;
  PERFORM pg_temp.as_user(U_FIN);
  PERFORM public.rpc_fiscal_emitter_accounting_validate('Validacao contabil sintetica do harness F3-correcao.');
  PERFORM pg_temp.as_root();

  -- ===================== FIXTURE: DESTINATÁRIO =======================
  INSERT INTO public.customer_fiscal_profiles
    (customer_id, person_type, cpf_cnpj, legal_name, state_registration, taxpayer_indicator,
     final_consumer, icms_taxpayer, fiscal_postal_code, fiscal_street, fiscal_number,
     fiscal_neighborhood, fiscal_city, fiscal_municipality_ibge_code, fiscal_state,
     country_code, fiscal_email, use_main_address, profile_status)
  VALUES (v_cliente,'PJ','11.222.333/0001-81','Destinatario Harness LTDA','10.987.654-7','1',
          false,true,'74000-000','Av Sintetica','200','Setor Sul','Goiania','5208707','GO',
          '1058','fiscal@harness.local', false, 'VALIDATED')
  ON CONFLICT (customer_id) DO UPDATE SET
     person_type=EXCLUDED.person_type, cpf_cnpj=EXCLUDED.cpf_cnpj, legal_name=EXCLUDED.legal_name,
     state_registration=EXCLUDED.state_registration, taxpayer_indicator=EXCLUDED.taxpayer_indicator,
     final_consumer=EXCLUDED.final_consumer, icms_taxpayer=EXCLUDED.icms_taxpayer,
     fiscal_postal_code=EXCLUDED.fiscal_postal_code,
     fiscal_municipality_ibge_code=EXCLUDED.fiscal_municipality_ibge_code,
     fiscal_state=EXCLUDED.fiscal_state, fiscal_city=EXCLUDED.fiscal_city,
     fiscal_street=EXCLUDED.fiscal_street, fiscal_number=EXCLUDED.fiscal_number,
     fiscal_neighborhood=EXCLUDED.fiscal_neighborhood, fiscal_email=EXCLUDED.fiscal_email
  RETURNING id INTO v_profile;

  -- ===================== FIXTURE: POLÍTICA GO→GO =====================
  INSERT INTO public.fiscal_operation_policies
    (sales_channel, operation_type, uf, requires_invoice, document_model, direction, fin_nfe,
     nature_operation, presence_indicator, final_consumer, taxpayer_indicator, origin_uf,
     destination_uf, cfop, crt, priority, source_id, legal_basis, legal_version,
     policy_status, prepared_by, active, valid_from)
  VALUES ('b2b_partner','VENDA','GO',true,'55','OUT',1,'Venda de producao do estabelecimento',1,false,'1','GO','GO',
          '5101','3',10, v_src,'MOC NF-e 7.0 — CFOP interno de venda de producao','7.0',
          'DRAFT', U_GESTOR, true, current_date - 1)
  RETURNING id INTO v_pol_go;
  PERFORM pg_temp.as_user(U_FIN);
  PERFORM public.rpc_fiscal_operation_policy_publish(v_pol_go,'Publicacao sintetica do harness F3-correcao.');
  PERFORM pg_temp.as_root();

  -- ===================== FIXTURE: REGRAS PUBLICADAS ==================
  INSERT INTO public.fiscal_tax_rules
    (rule_key, tax_kind, crt, origin_uf, cst, rate, base_components, prepared_by, source_id, legal_basis, status)
  VALUES ('f3c_icms_go','ICMS','3','GO','00',17,'["PRODUTO"]'::jsonb, U_GESTOR, v_src,'Guia EFD 3.2.2 — harness','DRAFT'),
         ('f3c_pis','PIS',NULL,NULL,'01',1.65,'["PRODUTO"]'::jsonb, U_GESTOR, v_src,'Guia EFD 3.2.2 — harness','DRAFT'),
         ('f3c_cofins','COFINS',NULL,NULL,'01',7.6,'["PRODUTO"]'::jsonb, U_GESTOR, v_src,'Guia EFD 3.2.2 — harness','DRAFT');
  PERFORM pg_temp.as_user(U_FIN);
  PERFORM public.rpc_fiscal_tax_rule_publish(id,'Publicacao harness F3-correcao.')
     FROM public.fiscal_tax_rules WHERE rule_key IN ('f3c_icms_go','f3c_pis','f3c_cofins');
  PERFORM pg_temp.as_root();

  -- =============== BLOCO 1 — ELEGIBILIDADE FAIL-CLOSED ===============
  SELECT id INTO v_order FROM public.partner_orders
   WHERE EXISTS (SELECT 1 FROM public.partner_order_items i WHERE i.order_id = partner_orders.id)
   ORDER BY created_at LIMIT 1;
  IF v_order IS NULL THEN RAISE EXCEPTION 'SETUP FAIL: nenhum pedido B2B com itens em staging.'; END IF;

  -- T01 — status fora da allowlist bloqueia.
  UPDATE public.partner_orders SET status='aguardando_cotacao' WHERE id=v_order;
  v_res := public.fn_fiscal_invoice_eligibility('PARTNER_ORDER', v_order);
  IF (v_res->>'eligible')::boolean THEN RAISE EXCEPTION 'T01 FAIL: pedido em cotacao elegivel'; END IF;
  IF NOT (v_res->>'reasons') LIKE '%FISCAL_ORDER_QUOTE_PENDING%' THEN
    RAISE EXCEPTION 'T01 FAIL: motivo incorreto %', v_res->>'reasons'; END IF;
  PERFORM pg_temp.ok(1,'Pedido aguardando cotacao bloqueado por allowlist');

  -- T02 — pedido cancelado bloqueia.
  UPDATE public.partner_orders SET status='cancelado' WHERE id=v_order;
  v_res := public.fn_fiscal_invoice_eligibility('PARTNER_ORDER', v_order);
  IF (v_res->>'eligible')::boolean OR (v_res->>'reasons') NOT LIKE '%FISCAL_ORDER_CANCELED%' THEN
    RAISE EXCEPTION 'T02 FAIL: %', v_res; END IF;
  PERFORM pg_temp.ok(2,'Pedido cancelado bloqueado');

  -- T03 — pedido reprovado bloqueia.
  UPDATE public.partner_orders SET status='reprovado' WHERE id=v_order;
  v_res := public.fn_fiscal_invoice_eligibility('PARTNER_ORDER', v_order);
  IF (v_res->>'eligible')::boolean OR (v_res->>'reasons') NOT LIKE '%FISCAL_ORDER_REJECTED%' THEN
    RAISE EXCEPTION 'T03 FAIL: %', v_res; END IF;
  PERFORM pg_temp.ok(3,'Pedido reprovado bloqueado');

  -- T04 — pedido aprovado porem sem aprovacao comercial registrada bloqueia.
  UPDATE public.partner_orders
     SET status='aprovado', approved_at=NULL, approved_by=NULL,
         payment_condition_status='accepted', requires_financial_approval=false
   WHERE id=v_order;
  v_res := public.fn_fiscal_invoice_eligibility('PARTNER_ORDER', v_order);
  IF (v_res->>'eligible')::boolean
     OR (v_res->>'reasons') NOT LIKE '%FISCAL_ORDER_COMMERCIAL_APPROVAL_MISSING%' THEN
    RAISE EXCEPTION 'T04 FAIL: %', v_res; END IF;
  PERFORM pg_temp.ok(4,'Aprovacao comercial ausente bloqueia emissao');

  -- T05 — condicao de pagamento nao aceita bloqueia.
  UPDATE public.partner_orders
     SET approved_at=now(), approved_by=U_GESTOR, payment_condition_status='pending'
   WHERE id=v_order;
  v_res := public.fn_fiscal_invoice_eligibility('PARTNER_ORDER', v_order);
  IF (v_res->>'eligible')::boolean
     OR (v_res->>'reasons') NOT LIKE '%FISCAL_ORDER_PAYMENT_CONDITION_NOT_ACCEPTED%' THEN
    RAISE EXCEPTION 'T05 FAIL: %', v_res; END IF;
  PERFORM pg_temp.ok(5,'Condicao de pagamento nao aceita bloqueia emissao');

  -- T06 — item quote_only bloqueia sem efeito colateral.
  UPDATE public.partner_orders SET payment_condition_status='accepted' WHERE id=v_order;
  UPDATE public.partner_order_items
     SET pricing_mode_snapshot='quote_only', preco_unitario_final_snapshot=10.005,
         price_source_snapshot='HARNESS'
   WHERE order_id=v_order;
  v_res := public.fn_fiscal_invoice_eligibility('PARTNER_ORDER', v_order);
  IF (v_res->>'eligible')::boolean OR (v_res->>'reasons') NOT LIKE '%FISCAL_QUOTE_ONLY_BLOCKED%' THEN
    RAISE EXCEPTION 'T06 FAIL: %', v_res; END IF;
  PERFORM pg_temp.ok(6,'Item quote_only bloqueia emissao');

  -- T07 — snapshot de preco ausente bloqueia.
  UPDATE public.partner_order_items
     SET pricing_mode_snapshot='table_price', preco_unitario_final_snapshot=NULL
   WHERE order_id=v_order;
  v_res := public.fn_fiscal_invoice_eligibility('PARTNER_ORDER', v_order);
  IF (v_res->>'eligible')::boolean OR (v_res->>'reasons') NOT LIKE '%FISCAL_PRICE_SNAPSHOT_MISSING%' THEN
    RAISE EXCEPTION 'T07 FAIL: %', v_res; END IF;
  PERFORM pg_temp.ok(7,'Snapshot de preco ausente bloqueia emissao');

  -- T08 — entrega inexistente/nao concluida bloqueia (devedor sempre exigido).
  -- Observacao: partner_orders.partner_id e NOT NULL no schema real, logo o devedor
  -- do pedido nunca pode ser nulo; a via testavel do bloqueio e a origem ENTREGA.
  UPDATE public.partner_order_items
     SET preco_unitario_final_snapshot=10.005, price_source_snapshot='HARNESS'
   WHERE order_id=v_order;
  v_res := public.fn_fiscal_invoice_eligibility('ENTREGA', gen_random_uuid());
  IF (v_res->>'eligible')::boolean OR (v_res->>'reasons') NOT LIKE '%FISCAL_DELIVERY_NOT_FOUND%' THEN
    RAISE EXCEPTION 'T08 FAIL: %', v_res; END IF;
  PERFORM pg_temp.ok(8,'Entrega inexistente bloqueia emissao (fail-closed por origem)');

  -- T09 — pedido integralmente elegivel com devedor B2B resolvido.
  v_res := public.fn_fiscal_invoice_eligibility('PARTNER_ORDER', v_order);
  IF NOT (v_res->>'eligible')::boolean THEN RAISE EXCEPTION 'T09 FAIL: %', v_res->>'reasons'; END IF;
  IF v_res->>'debtorPartnerId' IS NULL THEN RAISE EXCEPTION 'T09 FAIL: devedor nao resolvido'; END IF;
  PERFORM pg_temp.ok(9,'Pedido aprovado, aprovado comercialmente e precificado e elegivel');


  -- T10 — origem nao suportada bloqueia (fail-closed por tipo).
  v_res := public.fn_fiscal_invoice_eligibility('CONTRATO', v_order);
  IF (v_res->>'eligible')::boolean OR (v_res->>'reasons') NOT LIKE '%FISCAL_SOURCE_TYPE_UNSUPPORTED%' THEN
    RAISE EXCEPTION 'T10 FAIL: %', v_res; END IF;
  PERFORM pg_temp.ok(10,'Escopo fiscal nao suportado bloqueado');

  -- ================ BLOCO 2 — MOTOR TRIBUTÁRIO CANÔNICO ==============
  v_ctx := jsonb_build_object('produto',1000,'frete',0,'seguro',0,'outras',0,
                              'desconto',0,'ipi',0,'icmsSt',0,'icmsOwnValue',120,'baseST',NULL);

  -- T11 — regra sem componentes de base declarados bloqueia.
  INSERT INTO public.fiscal_tax_rules
    (rule_key, tax_kind, crt, cst, rate, base_components, prepared_by, source_id, legal_basis, status)
  VALUES ('f3c_sem_base','ICMS','3','00',17,'[]'::jsonb, U_GESTOR, v_src,'harness','DRAFT')
  RETURNING * INTO v_rule;
  BEGIN
    PERFORM public.fn_fiscal_apply_tax_v2(v_rule, v_ctx);
    RAISE EXCEPTION 'T11 FAIL: calculo sem base_components';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_TAX_RULE_INCOMPLETE%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.ok(11,'Regra sem componentes de base declarados bloqueia o calculo');

  -- T12 — componente de base fora do dominio rejeitado por constraint.
  BEGIN
    UPDATE public.fiscal_tax_rules SET base_components='["PRODUTO","INVENTADO"]'::jsonb
     WHERE id=v_rule.id;
    RAISE EXCEPTION 'T12 FAIL: componente invalido aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM pg_temp.ok(12,'Componente de base fora do dominio oficial rejeitado');

  -- T13 — ICMS com redução de base: base e valor canônicos.
  UPDATE public.fiscal_tax_rules
     SET base_components='["PRODUTO","FRETE"]'::jsonb, base_reduction_pct=40, rate=17
   WHERE id=v_rule.id;
  SELECT * INTO v_rule FROM public.fiscal_tax_rules WHERE id=v_rule.id;
  v_res := public.fn_fiscal_apply_tax_v2(v_rule, v_ctx || jsonb_build_object('frete',100));
  IF (v_res->>'baseOriginal')::numeric <> 1100.00 OR (v_res->>'base')::numeric <> 660.00
     OR (v_res->>'value')::numeric <> 112.20 THEN
    RAISE EXCEPTION 'T13 FAIL: ICMS %', v_res; END IF;
  PERFORM pg_temp.ok(13,'ICMS com reducao de base: 1100 -> 660 -> 112,20', v_res->>'value');

  -- T14 — ICMS-ST exige MVA e alíquota interna.
  INSERT INTO public.fiscal_tax_rules
    (rule_key, tax_kind, crt, cst, base_components, prepared_by, source_id, legal_basis, status, calc_mode)
  VALUES ('f3c_st','ICMS_ST','3','10','["PRODUTO"]'::jsonb, U_GESTOR, v_src,'harness ST','DRAFT','PERCENT')
  RETURNING * INTO v_rule;
  BEGIN
    PERFORM public.fn_fiscal_apply_tax_v2(v_rule, v_ctx);
    RAISE EXCEPTION 'T14 FAIL: ICMS-ST sem MVA calculado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_TAX_RULE_INCOMPLETE%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.ok(14,'ICMS-ST sem MVA/aliquota interna bloqueia (nunca zero silencioso)');

  -- T15 — ICMS-ST MVA: BC ST = base*(1+MVA); ST = BC*aliq - ICMS proprio.
  UPDATE public.fiscal_tax_rules
     SET st_modality='MVA', mva_pct=40, internal_rate_pct=17, credit_own_icms=true
   WHERE id=v_rule.id;
  SELECT * INTO v_rule FROM public.fiscal_tax_rules WHERE id=v_rule.id;
  v_res := public.fn_fiscal_apply_tax_v2(v_rule, v_ctx);
  IF (v_res->'params'->>'baseST')::numeric <> 1400.00
     OR (v_res->>'value')::numeric <> 118.00 THEN
    RAISE EXCEPTION 'T15 FAIL: ICMS-ST %', v_res; END IF;
  PERFORM pg_temp.ok(15,'ICMS-ST MVA 40%%: BC ST 1400,00 e ST 118,00 apos credito do proprio', v_res->>'value');

  -- T16 — modalidade de BC ST nao implementada bloqueia (sem aproximacao).
  UPDATE public.fiscal_tax_rules SET st_modality='PAUTA' WHERE id=v_rule.id;
  SELECT * INTO v_rule FROM public.fiscal_tax_rules WHERE id=v_rule.id;
  BEGIN
    PERFORM public.fn_fiscal_apply_tax_v2(v_rule, v_ctx);
    RAISE EXCEPTION 'T16 FAIL: modalidade PAUTA aproximada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_TAX_RULE_INCOMPLETE%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.ok(16,'Modalidade de BC ST nao implementada bloqueia explicitamente');

  -- T17 — FCP próprio sobre a base efetiva.
  INSERT INTO public.fiscal_tax_rules
    (rule_key, tax_kind, base_components, fcp_rate, prepared_by, source_id, legal_basis, status, calc_mode)
  VALUES ('f3c_fcp','FCP','["PRODUTO"]'::jsonb, 2, U_GESTOR, v_src,'harness FCP','DRAFT','PERCENT')
  RETURNING * INTO v_rule;
  v_res := public.fn_fiscal_apply_tax_v2(v_rule, v_ctx);
  IF (v_res->>'value')::numeric <> 20.00 THEN RAISE EXCEPTION 'T17 FAIL: FCP %', v_res; END IF;
  PERFORM pg_temp.ok(17,'FCP proprio 2%% sobre 1000,00 = 20,00');

  -- T18 — FCP-ST exige base de ST previamente apurada.
  INSERT INTO public.fiscal_tax_rules
    (rule_key, tax_kind, base_components, fcp_st_rate, prepared_by, source_id, legal_basis, status, calc_mode)
  VALUES ('f3c_fcpst','FCP_ST','["PRODUTO"]'::jsonb, 2, U_GESTOR, v_src,'harness FCP-ST','DRAFT','PERCENT')
  RETURNING * INTO v_rule;
  BEGIN
    PERFORM public.fn_fiscal_apply_tax_v2(v_rule, v_ctx);
    RAISE EXCEPTION 'T18 FAIL: FCP-ST sem base ST';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_TAX_RULE_INCOMPLETE%' THEN RAISE; END IF;
  END;
  v_res := public.fn_fiscal_apply_tax_v2(v_rule, v_ctx || jsonb_build_object('baseST',1400));
  IF (v_res->>'value')::numeric <> 28.00 THEN RAISE EXCEPTION 'T18 FAIL: FCP-ST %', v_res; END IF;
  PERFORM pg_temp.ok(18,'FCP-ST exige BC ST apurada e calcula 28,00 sobre 1400,00');

  -- T19 — DIFAL: diferença de alíquotas com partilha destino/origem.
  INSERT INTO public.fiscal_tax_rules
    (rule_key, tax_kind, base_components, internal_rate_pct, interstate_rate_pct,
     difal_dest_share_pct, prepared_by, source_id, legal_basis, status, calc_mode)
  VALUES ('f3c_difal','DIFAL','["PRODUTO"]'::jsonb, 18, 12, 100, U_GESTOR, v_src,'harness DIFAL','DRAFT','PERCENT')
  RETURNING * INTO v_rule;
  v_res := public.fn_fiscal_apply_tax_v2(v_rule, v_ctx);
  IF (v_res->>'value')::numeric <> 60.00
     OR (v_res->'params'->>'valueDestination')::numeric <> 60.00
     OR (v_res->'params'->>'valueOrigin')::numeric <> 0.00 THEN
    RAISE EXCEPTION 'T19 FAIL: DIFAL %', v_res; END IF;
  PERFORM pg_temp.ok(19,'DIFAL (18%%-12%%) = 60,00 integralmente ao destino');

  -- T20 — DIFAL com alíquotas incoerentes bloqueia.
  UPDATE public.fiscal_tax_rules SET internal_rate_pct=10 WHERE id=v_rule.id;
  SELECT * INTO v_rule FROM public.fiscal_tax_rules WHERE id=v_rule.id;
  BEGIN
    PERFORM public.fn_fiscal_apply_tax_v2(v_rule, v_ctx);
    RAISE EXCEPTION 'T20 FAIL: DIFAL incoerente aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_TAX_RULE_INCOMPLETE%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.ok(20,'DIFAL com aliquota interna < interestadual bloqueado');

  -- T21 — isenção exige motivo e base legal documentados.
  INSERT INTO public.fiscal_tax_rules
    (rule_key, tax_kind, base_components, prepared_by, source_id, legal_basis, status, calc_mode, cst, crt)
  VALUES ('f3c_isento','ICMS','["PRODUTO"]'::jsonb, U_GESTOR, v_src, NULL,'DRAFT','EXEMPT_DOCUMENTED','40','3')
  RETURNING * INTO v_rule;
  BEGIN
    PERFORM public.fn_fiscal_apply_tax_v2(v_rule, v_ctx);
    RAISE EXCEPTION 'T21 FAIL: isencao sem base legal';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_TAX_RULE_INCOMPLETE%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.ok(21,'Isencao exige motivo e base legal documentados');

  -- T22 — motor genérico legado desativado.
  BEGIN
    PERFORM public.fn_fiscal_apply_tax(v_rule, 1000);
    RAISE EXCEPTION 'T22 FAIL: motor legado ativo';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_ENGINE_DEPRECATED%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.ok(22,'Formula generica legada desativada');

  -- T23 — IBS/CBS/IS permanecem bloqueados e nao publicaveis.
  BEGIN
    INSERT INTO public.fiscal_tax_rules
      (rule_key, tax_kind, base_components, rate, prepared_by, source_id, legal_basis, status)
    VALUES ('f3c_ibs','IBS','["PRODUTO"]'::jsonb, 1, U_GESTOR, v_src,'harness','PUBLISHED');
    RAISE EXCEPTION 'T23 FAIL: IBS publicado';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.fn_fiscal_resolve_tax_rule('CBS','3','GO','GO','30021000',NULL,false,'1');
    RAISE EXCEPTION 'T23 FAIL: CBS resolvido';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_RTC_ENGINE_UNAVAILABLE%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.ok(23,'IBS/CBS/IS bloqueados (scaffolding, sem simulacao)');

  -- T24 — ambiguidade de regra tributária bloqueia (sem LIMIT 1 silencioso).
  INSERT INTO public.fiscal_tax_rules
    (rule_key, tax_kind, crt, origin_uf, cst, rate, base_components, priority,
     prepared_by, source_id, legal_basis, status, valid_from)
  VALUES ('f3c_icms_go_dup','ICMS','3','GO','00',12,'["PRODUTO"]'::jsonb,
          (SELECT priority FROM public.fiscal_tax_rules WHERE rule_key='f3c_icms_go'),
          U_GESTOR, v_src,'Guia EFD 3.2.2 — harness duplicado','DRAFT',
          (SELECT valid_from FROM public.fiscal_tax_rules WHERE rule_key='f3c_icms_go'))
  RETURNING id INTO v_rid;
  PERFORM pg_temp.as_user(U_FIN);
  PERFORM public.rpc_fiscal_tax_rule_publish(v_rid,'Publicacao duplicada do harness.');
  PERFORM pg_temp.as_root();
  BEGIN
    PERFORM public.fn_fiscal_resolve_tax_rule('ICMS','3','GO','GO','30021000',NULL,false,'1');
    RAISE EXCEPTION 'T24 FAIL: ambiguidade resolvida silenciosamente';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_TAX_RULE_AMBIGUOUS%' THEN RAISE; END IF;
  END;
  UPDATE public.fiscal_tax_rules SET status='SUPERSEDED' WHERE id=v_rid;
  PERFORM pg_temp.ok(24,'Ambiguidade de regra tributaria bloqueia a emissao');

  -- T25 — ambiguidade de política de operação bloqueia.
  INSERT INTO public.fiscal_operation_policies
    (sales_channel, operation_type, uf, requires_invoice, document_model, direction, fin_nfe,
     nature_operation, presence_indicator, final_consumer, taxpayer_indicator, origin_uf,
     destination_uf, cfop, crt, priority, source_id, legal_basis, legal_version,
     policy_status, prepared_by, active, valid_from)
  VALUES ('b2b_partner','VENDA','GO',true,'55','OUT',1,'Venda de producao (duplicada)',1,false,'1','GO','GO',
          '5102','3',10, v_src,'MOC NF-e 7.0 — duplicada para teste de ambiguidade','7.0',
          'DRAFT', U_GESTOR, true, (SELECT valid_from FROM public.fiscal_operation_policies WHERE id=v_pol_go))
  RETURNING id INTO v_pol_dup;
  PERFORM pg_temp.as_user(U_FIN);
  PERFORM public.rpc_fiscal_operation_policy_publish(v_pol_dup,'Publicacao duplicada do harness.');
  PERFORM pg_temp.as_root();
  BEGIN
    PERFORM public.fn_fiscal_resolve_operation('OUT','GO','GO','3',false,'1','30021000',NULL,'b2b_partner');
    RAISE EXCEPTION 'T25 FAIL: politica ambigua resolvida';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_OPERATION_POLICY_AMBIGUOUS%' THEN RAISE; END IF;
  END;
  UPDATE public.fiscal_operation_policies SET active=false, policy_status='SUPERSEDED' WHERE id=v_pol_dup;
  PERFORM pg_temp.ok(25,'Ambiguidade de politica de operacao bloqueia a emissao');

  -- T26 — coerência CRT: Simples exige CSOSN, Normal exige CST.
  BEGIN
    INSERT INTO public.fiscal_tax_rules
      (rule_key, tax_kind, crt, cst, csosn, rate, base_components, prepared_by, source_id, legal_basis, status)
    VALUES ('f3c_crt_bad','ICMS','1','00',NULL,17,'["PRODUTO"]'::jsonb, U_GESTOR, v_src,'harness','DRAFT');
    RAISE EXCEPTION 'T26 FAIL: CRT 1 com CST aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM pg_temp.ok(26,'Coerencia CRT x CST/CSOSN aplicada');

  -- ============= BLOCO 3 — DOCUMENTO, CÁLCULO E NUMERAÇÃO ============
  INSERT INTO public.fiscal_invoices
    (invoice_type, status, document_model, direction, sales_channel, billing_scope,
     source_type, source_id, customer_id, issue_date, created_by)
  VALUES ('NFE','DRAFT','NFE','OUT','b2b_partner','PEDIDO','PARTNER_ORDER', v_order, v_cliente, current_date, U_GESTOR)
  RETURNING id INTO v_inv;
  INSERT INTO public.fiscal_invoice_items
    (fiscal_invoice_id, item_sequence, item_kind, description, quantity, unit_value, gross_value, ncm_snapshot)
  VALUES (v_inv,1,'PRODUCT','Item sintetico harness F3-correcao',10,100,1000,'30021000');

  -- T27 — cálculo grava snapshot completo (ordem, componentes, fonte, política).
  PERFORM pg_temp.as_user(U_FIN);
  v_res := public.rpc_fiscal_calculate_invoice_v1(v_inv,'f3c-calc-1');
  PERFORM pg_temp.as_root();
  IF (v_res->>'vICMS')::numeric <> 170.00 OR (v_res->>'vNF')::numeric <> 1000.00 THEN
    RAISE EXCEPTION 'T27 FAIL: totais %', v_res; END IF;
  SELECT tax_snapshot INTO v_snap FROM public.fiscal_invoice_items WHERE fiscal_invoice_id=v_inv;
  IF v_snap->>'cfop' <> '5101'
     OR v_snap->'taxes'->'ICMS'->>'sourceId' IS NULL
     OR v_snap->'taxes'->'ICMS'->>'baseComponents' IS NULL
     OR v_snap->>'operationPolicyId' IS NULL
     OR v_snap->>'taxOrder' IS NULL
     OR v_snap->>'roundingMode' <> 'HALF_UP_2' THEN
    RAISE EXCEPTION 'T27 FAIL: snapshot incompleto %', v_snap; END IF;
  PERFORM pg_temp.ok(27,'Snapshot do item registra CFOP, politica, fonte, componentes e ordem');

  -- T28 — idempotência do cálculo escopada ao documento.
  INSERT INTO public.fiscal_invoices
    (invoice_type, status, document_model, direction, sales_channel, billing_scope,
     source_type, source_id, customer_id, issue_date, created_by)
  VALUES ('NFE','DRAFT','NFE','OUT','b2b_partner','ENTREGA','PARTNER_ORDER', v_order, v_cliente, current_date, U_GESTOR)
  RETURNING id INTO v_inv2;
  PERFORM pg_temp.as_user(U_FIN);
  BEGIN
    PERFORM public.rpc_fiscal_calculate_invoice_v1(v_inv2,'f3c-calc-1');
    RAISE EXCEPTION 'T28 FAIL: chave reutilizada entre documentos';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH%' THEN RAISE; END IF;
  END;
  v_res := public.rpc_fiscal_calculate_invoice_v1(v_inv,'f3c-calc-1');
  PERFORM pg_temp.as_root();
  IF NOT (v_res->>'idempotentReplay')::boolean THEN RAISE EXCEPTION 'T28 FAIL: replay nao sinalizado'; END IF;
  PERFORM pg_temp.ok(28,'Idempotencia de calculo escopada ao documento (replay so no mesmo)');

  -- T29 — reserva: chave de idempotência não vaza numeração entre documentos.
  PERFORM pg_temp.as_user(U_FIN);
  v_res := public.rpc_fiscal_reserve_nfe_number_v1(v_inv,'f3c-res-1');
  IF (v_res->>'accessKey') !~ '^[0-9]{44}$' THEN RAISE EXCEPTION 'T29 FAIL: chave %', v_res; END IF;
  IF (v_res->>'tpEmis')::int <> 1 THEN RAISE EXCEPTION 'T29 FAIL: tpEmis %', v_res; END IF;
  BEGIN
    PERFORM public.rpc_fiscal_reserve_nfe_number_v1(v_inv2,'f3c-res-1');
    RAISE EXCEPTION 'T29 FAIL: reserva de outro documento devolvida pela mesma chave';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.as_root();
  PERFORM pg_temp.ok(29,'Chave de idempotencia nunca devolve numeracao de outro documento');

  -- T30 — replay legítimo e reserva ativa única.
  PERFORM pg_temp.as_user(U_FIN);
  v_res := public.rpc_fiscal_reserve_nfe_number_v1(v_inv,'f3c-res-1');
  IF NOT (v_res->>'idempotentReplay')::boolean THEN RAISE EXCEPTION 'T30 FAIL: replay nao sinalizado'; END IF;
  BEGIN
    PERFORM public.rpc_fiscal_reserve_nfe_number_v1(v_inv,'f3c-res-2');
    RAISE EXCEPTION 'T30 FAIL: segunda reserva ativa';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_NUMBER_ALREADY_RESERVED%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.as_root();
  SELECT count(*) INTO v_num FROM public.fiscal_number_reservations WHERE fiscal_invoice_id=v_inv;
  IF v_num <> 1 THEN RAISE EXCEPTION 'T30 FAIL: % reservas', v_num; END IF;
  PERFORM pg_temp.ok(30,'Reserva idempotente e unica por documento');

  -- T31 — reserva é imutável e indeletável.
  BEGIN
    UPDATE public.fiscal_number_reservations SET access_key=repeat('9',44) WHERE fiscal_invoice_id=v_inv;
    RAISE EXCEPTION 'T31 FAIL: chave de acesso alterada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_RESERVATION_IMMUTABLE%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.fiscal_number_reservations WHERE fiscal_invoice_id=v_inv;
    RAISE EXCEPTION 'T31 FAIL: reserva excluida';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_RESERVATION_IMMUTABLE%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.ok(31,'Reserva de numeracao imutavel e indeletavel');

  -- T32 — contingência (tpEmis <> 1) bloqueada.
  BEGIN
    UPDATE public.fiscal_invoices SET tp_emis=9 WHERE id=v_inv2;
    RAISE EXCEPTION 'T32 FAIL: tpEmis 9 aceito';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM pg_temp.ok(32,'Contingencia (tpEmis <> 1) bloqueada nesta fase');

  -- T33 — documento com origem já faturada é bloqueado por duplicidade.
  PERFORM pg_temp.as_user(U_FIN);
  BEGIN
    PERFORM public.rpc_fiscal_calculate_invoice_v1(v_inv2,'f3c-calc-2');
    RAISE EXCEPTION 'T33 FAIL: duplicidade fiscal permitida';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_NOT_ELIGIBLE%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.as_root();
  PERFORM pg_temp.ok(33,'Duplicidade de documento fiscal para a mesma origem bloqueada');

  -- ================= BLOCO 4 — PRONTIDÃO E SEGURANÇA =================
  -- T34 — cobertura efetiva de cenários é medida, não presumida.
  v_res := public.fn_fiscal_scenario_coverage();
  IF (v_res->>'total')::int = 0 THEN RAISE EXCEPTION 'T34 FAIL: nenhum cenario avaliado'; END IF;
  PERFORM pg_temp.ok(34,'Cobertura de cenarios reais avaliada',
    (v_res->>'covered')||'/'||(v_res->>'total'));

  -- T35 — produção sem homologação SEFAZ é rebaixada a READY_HOMOLOGATION.
  UPDATE public.company_fiscal_settings
     SET nfe_readiness_status='READY_PRODUCTION', sefaz_homologation_at=NULL WHERE id=v_company;
  PERFORM pg_temp.as_user(U_ADMIN);
  v_res := public.rpc_fiscal_nfe_readiness_v1();
  PERFORM pg_temp.as_root();
  IF v_res->'emitter'->>'status' <> 'READY_HOMOLOGATION'
     OR v_res->>'maxAllowedStatus' <> 'READY_HOMOLOGATION'
     OR (v_res->>'pendencies') NOT LIKE '%SEFAZ_HOMOLOGATION_NOT_RECORDED%' THEN
    RAISE EXCEPTION 'T35 FAIL: %', v_res->'emitter'; END IF;
  PERFORM pg_temp.ok(35,'Teto READY_HOMOLOGATION enquanto nao houver homologacao SEFAZ registrada');

  -- T36 — cobertura incompleta rebaixa a prontidão global.
  PERFORM pg_temp.as_user(U_ADMIN);
  v_res := public.rpc_fiscal_nfe_readiness_v1();
  PERFORM pg_temp.as_root();
  IF v_res->>'overallStatus' = 'READY_HOMOLOGATION'
     AND (v_res->'coverage'->>'covered')::int < (v_res->'coverage'->>'total')::int THEN
    RAISE EXCEPTION 'T36 FAIL: prontidao global ignorou lacuna de cobertura';
  END IF;
  IF v_res->'coverage' IS NULL THEN RAISE EXCEPTION 'T36 FAIL: cobertura ausente do painel'; END IF;
  PERFORM pg_temp.ok(36,'Prontidao global reflete cobertura efetiva', v_res->>'overallStatus');

  -- T37 — evidência de homologação não aceita segredo.
  BEGIN
    UPDATE public.company_fiscal_settings
       SET sefaz_homologation_evidence='{"password":"x"}'::jsonb WHERE id=v_company;
    RAISE EXCEPTION 'T37 FAIL: segredo aceito na evidencia';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM pg_temp.ok(37,'Evidencia de homologacao rejeita segredos');

  -- T38 — RBAC: perfil sem competência fiscal não lê nem opera.
  PERFORM pg_temp.as_user(U_PROD);
  SELECT count(*) INTO v_num FROM public.fiscal_tax_rules;
  IF v_num <> 0 THEN RAISE EXCEPTION 'T38 FAIL: produtor leu % regras', v_num; END IF;
  SELECT count(*) INTO v_num FROM public.fiscal_number_reservations;
  IF v_num <> 0 THEN RAISE EXCEPTION 'T38 FAIL: produtor leu % reservas', v_num; END IF;
  BEGIN
    PERFORM public.rpc_fiscal_reserve_nfe_number_v1(v_inv2,'f3c-forbidden');
    RAISE EXCEPTION 'T38 FAIL: produtor reservou numeracao';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_FORBIDDEN%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.as_root();
  PERFORM pg_temp.ok(38,'RLS/RBAC bloqueia leitura e operacao fiscal a perfil sem competencia');

  -- T39 — auditoria registrada sem segredos.
  SELECT count(*) INTO v_num FROM public.fiscal_audit_log
   WHERE table_name IN ('fiscal_tax_rules','fiscal_operation_policies','fiscal_number_reservations');
  IF v_num = 0 THEN RAISE EXCEPTION 'T39 FAIL: sem trilha de auditoria'; END IF;
  IF EXISTS (SELECT 1 FROM public.fiscal_audit_log
              WHERE public.fiscal_json_has_sensitive_key(coalesce(new_values,'{}'::jsonb))) THEN
    RAISE EXCEPTION 'T39 FAIL: segredo em audit log';
  END IF;
  PERFORM pg_temp.ok(39,'Trilha de auditoria fiscal presente e livre de segredos', v_num::text||' eventos');

  -- T40 — nenhum microrganismo marcado pronto sem dossiê aprovado.
  SELECT count(*) INTO v_num FROM public.v_microorganism_fiscal_readiness
   WHERE coalesce(fiscally_ready,false);
  IF v_num <> 0 THEN RAISE EXCEPTION 'T40 FAIL: % microrganismos prontos sem dossie', v_num; END IF;
  PERFORM pg_temp.ok(40,'Nenhum dado fiscal presumido para microrganismos');
END $harness$;

SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name, coalesce(left(detail,60),'') AS detail
FROM _f3c_result ORDER BY n;

DO $$
DECLARE p int; BEGIN
  SELECT count(*) INTO p FROM _f3c_result WHERE ok;
  RAISE NOTICE 'RUNTIME HARNESS F3-CORRECAO: %/40 PASS (fixtures revertidas)', p;
  IF p <> 40 THEN RAISE EXCEPTION 'RUNTIME HARNESS F3-CORRECAO FAIL: % de 40', p; END IF;
END $$;

ROLLBACK;
