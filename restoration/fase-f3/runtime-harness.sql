-- =====================================================================
-- FASE F3 — RUNTIME HARNESS (autenticado, fixtures sintéticas, REVERTIDO)
-- Ambiente: STAGING ikaauvsflpmamgxmkhoq.  Nada é persistido: ROLLBACK final.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _f3_result(n int, name text, ok boolean, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.f3_pass(_n int, _name text, _detail text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$ INSERT INTO _f3_result VALUES (_n,_name,true,_detail) $$;

CREATE OR REPLACE FUNCTION pg_temp.f3_as(_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.f3_root() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role','postgres', true);
  PERFORM set_config('request.jwt.claims','', true);
END $$;

DO $harness$
DECLARE
  U_ADMIN uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a';  -- administrador
  U_GESTOR uuid := '3e16d523-1bc9-4502-a5d6-04d150747236'; -- gestor (preparador)
  U_FIN uuid := 'd56793fa-acb3-4862-a180-498c20f5317f';    -- financeiro (aprovador fiscal)
  U_PROD uuid := '85998744-78fd-41ae-b74e-2b763e7f8089';   -- cliente_produtor (sem acesso fiscal)

  v_company uuid; v_cliente uuid; v_profile uuid;
  v_src_moc uuid; v_src_efd uuid;
  v_pol_go uuid; v_pol_sp uuid;
  v_inv uuid; v_item uuid; v_order uuid;
  v_res jsonb; v_txt text; v_num int; v_bool boolean;
  v_rule uuid; v_key text; v_snap jsonb;
BEGIN
  PERFORM pg_temp.f3_root();
  SELECT id INTO v_src_moc FROM public.fiscal_official_sources WHERE source_key='MOC_NFE_70';
  SELECT id INTO v_src_efd FROM public.fiscal_official_sources WHERE source_key='GUIA_EFD_ICMS_IPI_322';
  SELECT id INTO v_company FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  SELECT id INTO v_cliente FROM public.clientes ORDER BY created_at LIMIT 1;

  -- =========================== EMITENTE ============================
  -- T01 — CNPJ inválido rejeitado na prontidão do emitente.
  UPDATE public.company_fiscal_settings SET cnpj='11.222.333/0001-82' WHERE id=v_company;
  SELECT nfe_readiness_status INTO v_txt FROM public.company_fiscal_settings WHERE id=v_company;
  IF v_txt <> 'NOT_READY' THEN RAISE EXCEPTION 'T01 FAIL: CNPJ invalido nao bloqueou (%).', v_txt; END IF;
  PERFORM pg_temp.f3_pass(1,'Emitente com CNPJ invalido permanece NOT_READY', v_txt);

  -- T02 — CRT fora do domínio rejeitado por constraint.
  BEGIN
    UPDATE public.company_fiscal_settings SET crt='9' WHERE id=v_company;
    RAISE EXCEPTION 'T02 FAIL: CRT invalido aceito';
  EXCEPTION WHEN check_violation THEN PERFORM pg_temp.f3_pass(2,'CRT fora do dominio rejeitado'); END;

  -- T03 — Série fora de 1..999 rejeitada.
  BEGIN
    UPDATE public.company_fiscal_settings SET nfe_series_number=1000 WHERE id=v_company;
    RAISE EXCEPTION 'T03 FAIL: serie 1000 aceita';
  EXCEPTION WHEN check_violation THEN PERFORM pg_temp.f3_pass(3,'Serie NF-e limitada a 1..999'); END;

  -- T04 — cMun incoerente com a UF mantém pendência.
  UPDATE public.company_fiscal_settings
     SET cnpj='11.222.333/0001-81', legal_name='AR BIO HARNESS LTDA', crt='3',
         state_registration='10.987.654-7', primary_cnae='2029100',
         postal_code='74000-000', street='Rua Sintetica', number='100',
         neighborhood='Centro', city='Goiania', state='GO',
         municipality_ibge_code='3550308', country_code='1058',
         nfe_series_number=1, nfe_environment_code='2',
         pis_cofins_regime='NAO_CUMULATIVO',
         uf_accreditations='[{"uf":"GO","accredited":true}]'::jsonb
   WHERE id=v_company;
  SELECT nfe_readiness_status, nfe_readiness_pendencies::text INTO v_txt, v_snap
    FROM public.company_fiscal_settings WHERE id=v_company;
  IF v_txt <> 'NOT_READY' THEN RAISE EXCEPTION 'T04 FAIL: cMun de outra UF nao bloqueou'; END IF;
  PERFORM pg_temp.f3_pass(4,'cMun IBGE incoerente com UF mantem emitente NOT_READY');

  -- T05 — Emitente completo + certificado, mas sem validacao contabil, fica NOT_READY
  -- apenas por EMITTER_ACCOUNTING_NOT_VALIDATED (pendencia unica e acionavel).
  UPDATE public.company_fiscal_settings
     SET municipality_ibge_code='5208707', certificate_ref='harness_cert_ref_f3'
   WHERE id=v_company;
  SELECT nfe_readiness_status, nfe_readiness_pendencies::text INTO v_txt, v_snap
    FROM public.company_fiscal_settings WHERE id=v_company;
  IF v_txt <> 'NOT_READY' THEN
    RAISE EXCEPTION 'T05 FAIL: emitente sem validacao contabil deveria ficar NOT_READY (obtido %)', v_txt;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(
        (SELECT nfe_readiness_pendencies FROM public.company_fiscal_settings WHERE id=v_company)) e
      WHERE e->>'code' <> 'EMITTER_ACCOUNTING_NOT_VALIDATED') <> 0 THEN
    RAISE EXCEPTION 'T05 FAIL: pendencias residuais inesperadas %', v_snap;
  END IF;
  PERFORM pg_temp.f3_pass(5,'Emitente completo pendente apenas de validacao contabil', v_txt);

  -- T06 — Validação contábil exige perfil aprovador (SoD com o preparador).
  PERFORM pg_temp.f3_as(U_PROD);
  BEGIN
    PERFORM public.rpc_fiscal_emitter_accounting_validate('Validacao contabil sintetica do harness F3.');
    RAISE EXCEPTION 'T06 FAIL: produtor validou o emitente';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_FORBIDDEN%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.f3_root();
  PERFORM pg_temp.f3_pass(6,'Validacao contabil negada a perfil sem permissao fiscal');

  -- T07 — Financeiro registra validação contábil com justificativa.
  PERFORM pg_temp.f3_as(U_FIN);
  v_res := public.rpc_fiscal_emitter_accounting_validate('Validacao contabil sintetica do harness F3, dados conferidos.');
  PERFORM pg_temp.f3_root();
  IF v_res->>'status' <> 'VALIDATED' THEN RAISE EXCEPTION 'T07 FAIL: validacao contabil nao registrada'; END IF;
  SELECT nfe_readiness_status INTO v_txt FROM public.company_fiscal_settings WHERE id=v_company;
  IF v_txt <> 'READY_HOMOLOGATION' THEN
    RAISE EXCEPTION 'T07 FAIL: apos validacao contabil o emitente deveria ficar READY_HOMOLOGATION (obtido %) pend=%',
      v_txt, (SELECT nfe_readiness_pendencies FROM public.company_fiscal_settings WHERE id=v_company);
  END IF;
  PERFORM pg_temp.f3_pass(7,'Validacao contabil registrada por perfil financeiro');

  -- ========================= DESTINATÁRIO ==========================
  -- T08 — Destinatário PJ contribuinte válido fica READY.
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
     fiscal_postal_code=EXCLUDED.fiscal_postal_code, fiscal_municipality_ibge_code=EXCLUDED.fiscal_municipality_ibge_code,
     fiscal_state=EXCLUDED.fiscal_state, fiscal_city=EXCLUDED.fiscal_city,
     fiscal_street=EXCLUDED.fiscal_street, fiscal_number=EXCLUDED.fiscal_number,
     fiscal_neighborhood=EXCLUDED.fiscal_neighborhood, fiscal_email=EXCLUDED.fiscal_email
  RETURNING id INTO v_profile;
  SELECT nfe_readiness_status INTO v_txt FROM public.customer_fiscal_profiles WHERE id=v_profile;
  IF v_txt <> 'READY' THEN
    RAISE EXCEPTION 'T08 FAIL: destinatario completo deveria ser READY (obtido % pend=%)',
      v_txt, (SELECT nfe_readiness_pendencies FROM public.customer_fiscal_profiles WHERE id=v_profile);
  END IF;
  PERFORM pg_temp.f3_pass(8,'Destinatario PJ contribuinte valido fica READY');

  -- T09 — Contribuinte sem IE volta a NOT_READY.
  UPDATE public.customer_fiscal_profiles SET state_registration=NULL WHERE id=v_profile;
  SELECT nfe_readiness_status INTO v_txt FROM public.customer_fiscal_profiles WHERE id=v_profile;
  IF v_txt = 'READY' THEN RAISE EXCEPTION 'T09 FAIL: contribuinte sem IE ficou READY'; END IF;
  UPDATE public.customer_fiscal_profiles SET state_registration='11.111.111-1' WHERE id=v_profile;
  PERFORM pg_temp.f3_pass(9,'Contribuinte de ICMS sem IE bloqueia prontidao');

  -- T10 — CPF inválido em destinatário PF bloqueia.
  UPDATE public.customer_fiscal_profiles
     SET person_type='PF', cpf_cnpj='529.982.247-24', icms_taxpayer=false, taxpayer_indicator='9'
   WHERE id=v_profile;
  SELECT nfe_readiness_status INTO v_txt FROM public.customer_fiscal_profiles WHERE id=v_profile;
  IF v_txt = 'READY' THEN RAISE EXCEPTION 'T10 FAIL: CPF invalido aceito'; END IF;
  UPDATE public.customer_fiscal_profiles
     SET person_type='PJ', cpf_cnpj='11.222.333/0001-81', icms_taxpayer=true, taxpayer_indicator='1'
   WHERE id=v_profile;
  PERFORM pg_temp.f3_pass(10,'CPF invalido em destinatario PF bloqueia prontidao');

  -- ===================== OPERAÇÃO / CFOP ===========================
  -- T11 — Política GO→GO preparada pelo gestor.
  INSERT INTO public.fiscal_operation_policies
    (sales_channel, operation_type, uf, requires_invoice, document_model, direction, fin_nfe,
     nature_operation, presence_indicator, final_consumer, taxpayer_indicator, origin_uf,
     destination_uf, cfop, crt, priority, source_id, legal_basis, legal_version,
     policy_status, prepared_by, active, valid_from)
  VALUES ('b2b_partner','VENDA','GO',true,'55','OUT',1,'Venda de producao do estabelecimento',1,false,'1','GO','GO',
          '5101','3',10, v_src_moc,'MOC NF-e 7.0 — CFOP interno de venda de producao','7.0',
          'DRAFT', U_GESTOR, true, current_date - 1)
  RETURNING id INTO v_pol_go;
  PERFORM pg_temp.f3_pass(11,'Politica de operacao GO->GO criada em DRAFT');

  -- T12 — Preparador não publica a própria política (SoD).
  PERFORM pg_temp.f3_as(U_GESTOR);
  BEGIN
    PERFORM public.rpc_fiscal_operation_policy_publish(v_pol_go, NULL);
    RAISE EXCEPTION 'T12 FAIL: preparador publicou a propria politica';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.f3_root();
  PERFORM pg_temp.f3_pass(12,'Segregacao de funcoes bloqueia autopublicacao de politica');

  -- T13 — Aprovador fiscal publica.
  PERFORM pg_temp.f3_as(U_FIN);
  v_res := public.rpc_fiscal_operation_policy_publish(v_pol_go,'Publicacao sintetica do harness F3.');
  PERFORM pg_temp.f3_root();
  IF v_res->>'cfop' <> '5101' THEN RAISE EXCEPTION 'T13 FAIL: politica nao publicada'; END IF;
  PERFORM pg_temp.f3_pass(13,'Aprovador fiscal publica politica de operacao', v_res::text);

  -- T14 — Política publicada é imutável.
  BEGIN
    UPDATE public.fiscal_operation_policies SET cfop='6101' WHERE id=v_pol_go;
    RAISE EXCEPTION 'T14 FAIL: CFOP de politica publicada alterado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_POLICY_IMMUTABLE%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.f3_pass(14,'Politica publicada e imutavel');

  -- T15 — Política interestadual GO→SP publicada e resolvida por destino.
  INSERT INTO public.fiscal_operation_policies
    (sales_channel, operation_type, uf, requires_invoice, document_model, direction, fin_nfe,
     nature_operation, presence_indicator, final_consumer, taxpayer_indicator, origin_uf,
     destination_uf, cfop, crt, priority, source_id, legal_basis, legal_version,
     policy_status, prepared_by, active, valid_from)
  VALUES ('b2b_partner','VENDA','GO',true,'55','OUT',1,'Venda de producao para outra UF',1,false,'1','GO','SP',
          '6101','3',10, v_src_moc,'MOC NF-e 7.0 — CFOP interestadual de venda de producao','7.0',
          'DRAFT', U_GESTOR, true, current_date - 1)
  RETURNING id INTO v_pol_sp;
  PERFORM pg_temp.f3_as(U_FIN);
  PERFORM public.rpc_fiscal_operation_policy_publish(v_pol_sp,'Publicacao sintetica do harness F3.');
  PERFORM pg_temp.f3_root();
  IF (public.fn_fiscal_resolve_operation('OUT','GO','GO','3',false,'1','30021000',NULL,'b2b_partner')).cfop <> '5101'
     OR (public.fn_fiscal_resolve_operation('OUT','GO','SP','3',false,'1','30021000',NULL,'b2b_partner')).cfop <> '6101' THEN
    RAISE EXCEPTION 'T15 FAIL: CFOP nao resolvido por operacao/destino';
  END IF;
  PERFORM pg_temp.f3_pass(15,'CFOP resolvido por operacao e destino (GO->GO=5101, GO->SP=6101)');

  -- ======================= REGRAS TRIBUTÁRIAS ======================
  -- T16 — Regra publicada exige fonte/base legal via RPC.
  INSERT INTO public.fiscal_tax_rules (rule_key, tax_kind, crt, origin_uf, cst, rate, prepared_by, status)
  VALUES ('harness_icms_go','ICMS','3','GO','00',17, U_GESTOR,'DRAFT') RETURNING id INTO v_rule;
  PERFORM pg_temp.f3_as(U_FIN);
  BEGIN
    PERFORM public.rpc_fiscal_tax_rule_publish(v_rule, NULL);
    RAISE EXCEPTION 'T16 FAIL: regra sem fonte foi publicada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_TAX_RULE_SOURCE_REQUIRED%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.f3_root();
  PERFORM pg_temp.f3_pass(16,'Publicacao de regra exige fonte oficial e base legal');

  -- T17 — Regras ICMS/PIS/COFINS publicadas pelo aprovador.
  UPDATE public.fiscal_tax_rules
     SET source_id=v_src_efd, legal_basis='Guia Pratico EFD ICMS/IPI 3.2.2 — harness sintetico'
   WHERE id=v_rule;
  INSERT INTO public.fiscal_tax_rules (rule_key, tax_kind, cst, rate, prepared_by, source_id, legal_basis, status)
  VALUES ('harness_pis','PIS','01',1.65, U_GESTOR, v_src_efd,'Guia Pratico EFD 3.2.2 — harness','DRAFT'),
         ('harness_cofins','COFINS','01',7.6, U_GESTOR, v_src_efd,'Guia Pratico EFD 3.2.2 — harness','DRAFT');
  PERFORM pg_temp.f3_as(U_FIN);
  PERFORM public.rpc_fiscal_tax_rule_publish(v_rule,'Publicacao sintetica do harness F3.');
  PERFORM public.rpc_fiscal_tax_rule_publish((SELECT id FROM public.fiscal_tax_rules WHERE rule_key='harness_pis'),'Publicacao harness.');
  PERFORM public.rpc_fiscal_tax_rule_publish((SELECT id FROM public.fiscal_tax_rules WHERE rule_key='harness_cofins'),'Publicacao harness.');
  PERFORM pg_temp.f3_root();
  SELECT count(*) INTO v_num FROM public.fiscal_tax_rules WHERE status='PUBLISHED' AND rule_key LIKE 'harness_%';
  IF v_num <> 3 THEN RAISE EXCEPTION 'T17 FAIL: esperadas 3 regras publicadas, obtidas %', v_num; END IF;
  PERFORM pg_temp.f3_pass(17,'ICMS/PIS/COFINS publicados com fonte oficial');

  -- T18 — Override de SoD do administrador é auditado e consumido.
  INSERT INTO public.fiscal_tax_rules (rule_key, tax_kind, cst, rate, prepared_by, source_id, legal_basis, status)
  VALUES ('harness_ipi','IPI','50',0, U_FIN, v_src_efd,'Guia Pratico EFD 3.2.2 — harness IPI','DRAFT')
  RETURNING id INTO v_rule;
  PERFORM pg_temp.f3_as(U_FIN);
  BEGIN
    PERFORM public.rpc_fiscal_tax_rule_publish(v_rule,'Tentativa de autopublicacao.');
    RAISE EXCEPTION 'T18 FAIL: autopublicacao de regra permitida';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_SEGREGATION_OF_DUTIES%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.f3_as(U_ADMIN);
  PERFORM public.rpc_fiscal_rule_sod_override('TAX_RULE', v_rule,
    'Override excepcional auditado do harness F3 para validar o fluxo de segregacao de funcoes.');
  PERFORM pg_temp.f3_as(U_FIN);
  PERFORM public.rpc_fiscal_tax_rule_publish(v_rule,'Publicacao com override auditado.');
  PERFORM pg_temp.f3_root();
  SELECT count(*) INTO v_num FROM public.fiscal_rule_sod_overrides WHERE target_id=v_rule AND consumed_at IS NOT NULL;
  IF v_num <> 1 THEN RAISE EXCEPTION 'T18 FAIL: override nao consumido'; END IF;
  PERFORM pg_temp.f3_pass(18,'Override de SoD administrado, auditado e consumido uma unica vez');

  -- ===================== DOCUMENTO E CÁLCULO =======================
  SELECT id INTO v_order FROM public.partner_orders WHERE status::text='em_analise_comercial' LIMIT 1;

  -- T19 — Pedido em cotação/análise bloqueia o cálculo.
  INSERT INTO public.fiscal_invoices
    (invoice_type, status, document_model, direction, sales_channel, billing_scope,
     source_type, source_id, customer_id, issue_date, created_by)
  VALUES ('NFE','DRAFT','NFE','OUT','b2b_partner','PEDIDO','PARTNER_ORDER', v_order, v_cliente, current_date, U_GESTOR)
  RETURNING id INTO v_inv;
  INSERT INTO public.fiscal_invoice_items
    (fiscal_invoice_id, item_sequence, item_kind, description, quantity, unit_value, gross_value, ncm_snapshot)
  VALUES (v_inv,1,'PRODUTO','Item sintetico harness',3,10.005,30.02,'30021000');
  PERFORM pg_temp.f3_as(U_FIN);
  BEGIN
    PERFORM public.rpc_fiscal_calculate_invoice_v1(v_inv,'harness-quote');
    RAISE EXCEPTION 'T19 FAIL: pedido em analise foi calculado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_NOT_ELIGIBLE%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.f3_root();
  PERFORM pg_temp.f3_pass(19,'quote_only/pedido em analise bloqueia emissao');

  -- T20 — Regra ausente bloqueia (IPI exigido pelo emitente, sem regra aplicavel para o NCM).
  UPDATE public.partner_orders SET status='aprovado' WHERE id=v_order;
  UPDATE public.company_fiscal_settings SET icms_st_responsible=true WHERE id=v_company;
  PERFORM pg_temp.f3_as(U_FIN);
  BEGIN
    PERFORM public.rpc_fiscal_calculate_invoice_v1(v_inv,'harness-missing-rule');
    RAISE EXCEPTION 'T20 FAIL: calculo concluido sem regra de ICMS-ST';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_TAX_RULE_NOT_FOUND%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.f3_root();
  UPDATE public.company_fiscal_settings SET icms_st_responsible=false WHERE id=v_company;
  PERFORM pg_temp.f3_pass(20,'Ausencia de regra bloqueia; nunca zero/isento silencioso');

  -- T21 — Cálculo server-side com snapshot completo e arredondamento MOC.
  PERFORM pg_temp.f3_as(U_FIN);
  v_res := public.rpc_fiscal_calculate_invoice_v1(v_inv,'harness-calc-1');
  PERFORM pg_temp.f3_root();
  IF (v_res->>'vProd')::numeric <> 30.02 THEN RAISE EXCEPTION 'T21 FAIL: vProd=% inesperado', v_res->>'vProd'; END IF;
  IF (v_res->>'vICMS')::numeric <> round(30.02*0.17,2) THEN RAISE EXCEPTION 'T21 FAIL: vICMS=%', v_res->>'vICMS'; END IF;
  IF (v_res->>'vPIS')::numeric <> round(30.02*0.0165,2) THEN RAISE EXCEPTION 'T21 FAIL: vPIS=%', v_res->>'vPIS'; END IF;
  IF (v_res->>'vNF')::numeric <> 30.02 THEN RAISE EXCEPTION 'T21 FAIL: vNF=%', v_res->>'vNF'; END IF;
  SELECT tax_snapshot INTO v_snap FROM public.fiscal_invoice_items WHERE fiscal_invoice_id=v_inv;
  IF v_snap->>'cfop' <> '5101'
     OR v_snap->'taxes'->'ICMS'->>'ruleKey' <> 'harness_icms_go'
     OR v_snap->'taxes'->'ICMS'->>'sourceId' IS NULL
     OR (v_snap->'taxes'->'ICMS'->>'ruleVersion') IS NULL THEN
    RAISE EXCEPTION 'T21 FAIL: snapshot sem CFOP/regra/versao/fonte: %', v_snap;
  END IF;
  PERFORM pg_temp.f3_pass(21,'Calculo server-side grava CFOP, regra, versao, fonte, bases e valores', v_res::text);

  -- T22 — Idempotência do cálculo (mesma chave => replay, sem novo run).
  PERFORM pg_temp.f3_as(U_FIN);
  v_res := public.rpc_fiscal_calculate_invoice_v1(v_inv,'harness-calc-1');
  PERFORM pg_temp.f3_root();
  IF NOT (v_res->>'idempotentReplay')::boolean THEN RAISE EXCEPTION 'T22 FAIL: replay nao sinalizado'; END IF;
  SELECT count(*) INTO v_num FROM public.fiscal_calculation_runs WHERE fiscal_invoice_id=v_inv;
  IF v_num <> 1 THEN RAISE EXCEPTION 'T22 FAIL: % execucoes registradas', v_num; END IF;
  PERFORM pg_temp.f3_pass(22,'Calculo idempotente por chave; historico nao recalcula');

  -- T23 — Recalcular com nova chave é bloqueado (snapshot imutável).
  PERFORM pg_temp.f3_as(U_FIN);
  BEGIN
    PERFORM public.rpc_fiscal_calculate_invoice_v1(v_inv,'harness-calc-2');
    RAISE EXCEPTION 'T23 FAIL: recalculo permitido sobre snapshot existente';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_SNAPSHOT_IMMUTABLE%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.f3_root();
  PERFORM pg_temp.f3_pass(23,'Snapshot tributario e imutavel');

  -- T24 — Reserva de numeração: chave de acesso 44 dígitos com DV válido.
  PERFORM pg_temp.f3_as(U_FIN);
  v_res := public.rpc_fiscal_reserve_nfe_number_v1(v_inv,'harness-reserve-1');
  PERFORM pg_temp.f3_root();
  v_key := v_res->>'accessKey';
  IF v_key !~ '^[0-9]{44}$' THEN RAISE EXCEPTION 'T24 FAIL: chave invalida %', v_key; END IF;
  IF public.fn_fiscal_access_key_dv(left(v_key,43)) <> right(v_key,1)::int THEN
    RAISE EXCEPTION 'T24 FAIL: DV da chave incorreto';
  END IF;
  IF left(v_key,2) <> '52' THEN RAISE EXCEPTION 'T24 FAIL: cUF da chave incorreto'; END IF;
  PERFORM pg_temp.f3_pass(24,'Reserva DRAFT gera chave de acesso 44 digitos com DV correto', v_key);

  -- T25 — Idempotência da reserva e bloqueio de segunda reserva ativa.
  PERFORM pg_temp.f3_as(U_FIN);
  v_res := public.rpc_fiscal_reserve_nfe_number_v1(v_inv,'harness-reserve-1');
  IF NOT (v_res->>'idempotentReplay')::boolean THEN RAISE EXCEPTION 'T25 FAIL: replay de reserva nao sinalizado'; END IF;
  BEGIN
    PERFORM public.rpc_fiscal_reserve_nfe_number_v1(v_inv,'harness-reserve-2');
    RAISE EXCEPTION 'T25 FAIL: segunda reserva ativa permitida';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_NUMBER_ALREADY_RESERVED%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.f3_root();
  SELECT count(*) INTO v_num FROM public.fiscal_number_reservations WHERE fiscal_invoice_id=v_inv;
  IF v_num <> 1 THEN RAISE EXCEPTION 'T25 FAIL: % reservas para o mesmo documento', v_num; END IF;
  PERFORM pg_temp.f3_pass(25,'Numeracao idempotente e unica por documento');

  -- T26 — Uma NF-e por escopo fiscal.
  BEGIN
    INSERT INTO public.fiscal_invoices
      (invoice_type, status, document_model, direction, sales_channel, billing_scope,
       source_type, source_id, customer_id, issue_date, created_by)
    VALUES ('NFE','DRAFT','NFE','OUT','b2b_partner','PEDIDO','PARTNER_ORDER', v_order, v_cliente, current_date, U_GESTOR);
    RAISE EXCEPTION 'T26 FAIL: segunda NF-e criada para o mesmo escopo';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  PERFORM pg_temp.f3_pass(26,'Uma NF-e por pedido/escopo de faturamento');

  -- T27 — RLS: perfil sem acesso fiscal não lê regras nem prontidão.
  PERFORM pg_temp.f3_as(U_PROD);
  SELECT count(*) INTO v_num FROM public.fiscal_tax_rules;
  IF v_num <> 0 THEN RAISE EXCEPTION 'T27 FAIL: produtor leu % regras tributarias', v_num; END IF;
  BEGIN
    PERFORM public.rpc_fiscal_nfe_readiness_v1();
    RAISE EXCEPTION 'T27 FAIL: produtor obteve painel de prontidao';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'FISCAL_FORBIDDEN%' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.f3_root();
  PERFORM pg_temp.f3_pass(27,'RLS/RBAC bloqueia perfil sem competencia fiscal');

  -- T28 — Painel de prontidão agrega pendências acionáveis.
  PERFORM pg_temp.f3_as(U_ADMIN);
  v_res := public.rpc_fiscal_nfe_readiness_v1();
  PERFORM pg_temp.f3_root();
  IF v_res->'emitter'->>'status' <> 'READY_HOMOLOGATION' THEN RAISE EXCEPTION 'T28 FAIL: emitente %', v_res->'emitter'; END IF;
  IF (v_res->'operations'->>'publishedPolicies')::int < 2 THEN RAISE EXCEPTION 'T28 FAIL: politicas publicadas'; END IF;
  IF jsonb_array_length(v_res->'taxes'->'missingMandatoryKinds') <> 0 THEN
    RAISE EXCEPTION 'T28 FAIL: tributos obrigatorios faltando %', v_res->'taxes';
  END IF;
  PERFORM pg_temp.f3_pass(28,'Painel de prontidao NF-e consolidado', v_res->>'overallStatus');

  -- T29 — Microrganismos continuam 0 prontos (nenhum dado fiscal inventado).
  SELECT count(*) INTO v_num FROM public.v_microorganism_fiscal_readiness WHERE coalesce(fiscally_ready,false);
  IF v_num <> 0 THEN RAISE EXCEPTION 'T29 FAIL: % microrganismos marcados prontos', v_num; END IF;
  PERFORM pg_temp.f3_pass(29,'24 microrganismos permanecem 0 prontos');

  -- T30 — Auditoria fiscal sem segredos e com registro das mudanças.
  SELECT count(*) INTO v_num FROM public.fiscal_audit_log
   WHERE table_name IN ('fiscal_tax_rules','fiscal_operation_policies','fiscal_number_reservations');
  IF v_num = 0 THEN RAISE EXCEPTION 'T30 FAIL: auditoria fiscal nao registrou eventos'; END IF;
  SELECT bool_or(public.fiscal_json_has_sensitive_key(coalesce(new_values,'{}'::jsonb))) INTO v_bool
    FROM public.fiscal_audit_log
   WHERE table_name IN ('fiscal_tax_rules','fiscal_operation_policies','fiscal_number_reservations');
  IF coalesce(v_bool,false) THEN RAISE EXCEPTION 'T30 FAIL: segredo em audit log'; END IF;
  PERFORM pg_temp.f3_pass(30,'Auditoria fiscal registrada e livre de segredos', v_num::text||' eventos');
END $harness$;

SELECT n, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, coalesce(left(detail,90),'') AS detail
FROM _f3_result ORDER BY n;

DO $$
DECLARE p int; BEGIN
  SELECT count(*) INTO p FROM _f3_result WHERE ok;
  RAISE NOTICE 'RUNTIME HARNESS F3: %/30 PASS (fixtures revertidas)', p;
  IF p <> 30 THEN RAISE EXCEPTION 'RUNTIME HARNESS F3 FAIL: % de 30', p; END IF;
END $$;

ROLLBACK;
