-- =====================================================================
-- FASE F4.2 — SETUP das fixtures sintéticas do harness remoto E2E
-- Alvo AUTORIZADO: staging ikaauvsflpmamgxmkhoq
-- PROIBIDO: produção navfzbwgwzruipouyfnk
--
-- Regras:
--   * Nenhum cadastro real é alterado. Tudo criado aqui é sintético e
--     carrega o prefixo F42-HARNESS- (ou a tag do run) no nome/observação.
--   * Nenhum trigger é desabilitado. Nenhum DELETE amplo. Nenhum UUID fixo
--     de dado real: todos os ids são gerados por gen_random_uuid().
--   * Todos os ids criados ficam registrados em public._f42_harness_fixtures,
--     que é a ÚNICA fonte usada pelo cleanup.
--
-- Uso:
--   psql --single-transaction -v ON_ERROR_STOP=1 \
--        -v f42_tag="'F42-HARNESS-20260806A'" -f 10-setup.sql
-- =====================================================================

\if :{?f42_tag}
\else
  \echo 'ERRO: informe -v f42_tag=''F42-HARNESS-<id>'''
  \quit
\endif

BEGIN;

-- ---------------------------------------------------------------------
-- Guarda de ambiente fail-closed (idêntica ao harness da Fase 1).
-- ---------------------------------------------------------------------
DO $g$
DECLARE v text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'F42_GUARD: ambiente nao identificado (marcador ausente)';
  END IF;
  SELECT project_ref INTO v FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'F42_GUARD: ambiente de PRODUCAO — execucao proibida';
  END IF;
  IF v IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'F42_GUARD: somente staging ikaauvsflpmamgxmkhoq';
  END IF;
END $g$;

DO $g$
BEGIN
  IF :'f42_tag' NOT LIKE 'F42-HARNESS-%' THEN
    RAISE EXCEPTION 'F42_GUARD: tag deve comecar com F42-HARNESS-';
  END IF;
END $g$;

-- ---------------------------------------------------------------------
-- Registro de fixtures (base do cleanup determinístico).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._f42_harness_fixtures (
  id          bigserial PRIMARY KEY,
  tag         text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  entity_text text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public._f42_harness_fixtures FROM PUBLIC, anon, authenticated;
GRANT ALL ON public._f42_harness_fixtures TO service_role;
ALTER TABLE public._f42_harness_fixtures ENABLE ROW LEVEL SECURITY;

DO $f$
DECLARE
  v_tag        text := :'f42_tag';
  v_company    uuid := gen_random_uuid();
  v_prev_comp  uuid;
  v_client     uuid := gen_random_uuid();
  v_partner    uuid := gen_random_uuid();
  v_order      uuid := gen_random_uuid();
  v_order_ok   uuid;
  v_series     uuid := gen_random_uuid();
  v_invoice    uuid := gen_random_uuid();
  v_inv_quote  uuid := gen_random_uuid();
  v_order_quo  uuid := gen_random_uuid();
  v_suffix     text := right(replace(v_tag, 'F42-HARNESS-', ''), 12);
  v_status     text;
BEGIN
  IF EXISTS (SELECT 1 FROM public._f42_harness_fixtures WHERE tag = v_tag) THEN
    RAISE EXCEPTION 'F42_SETUP: tag % ja possui fixtures; rode o cleanup antes.', v_tag;
  END IF;

  -- 1. Isolamento REVERSÍVEL do emitente ativo.
  --    `ux_company_fiscal_settings_active_singleton` admite um único emitente
  --    ativo. O id do emitente ativo atual é REGISTRADO ANTES de qualquer
  --    alteração; só então ele é desativado. O cleanup restaura exatamente
  --    esse id, inclusive quando acionado após falha.
  SELECT id INTO v_prev_comp
    FROM public.company_fiscal_settings
   WHERE is_active
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  INSERT INTO public._f42_harness_fixtures(tag, entity, entity_id, entity_text)
  VALUES (v_tag, 'previous_active_company_fiscal_settings', v_prev_comp,
          CASE WHEN v_prev_comp IS NULL THEN 'NONE' ELSE 'ACTIVE' END);

  IF v_prev_comp IS NOT NULL THEN
    UPDATE public.company_fiscal_settings
       SET is_active = false, updated_at = now()
     WHERE id = v_prev_comp;
  END IF;

  -- 1b. Emitente sintético, homologação (tpAmb=2), pronto.
  --     A prontidão é recalculada pelo gatilho `trg_fiscal_emitter_readiness`
  --     (função `tg_fiscal_emitter_refresh_readiness`) no próprio INSERT.
  --     Não existe `fn_fiscal_recompute_emitter_readiness`.
  INSERT INTO public.company_fiscal_settings (
    id, is_active, legal_name, trade_name, cnpj, state_registration,
    tax_regime, crt, primary_cnae, fiscal_email, postal_code, street, number,
    neighborhood, city, municipality_ibge_code, state, country_code,
    fiscal_provider, fiscal_environment, nfe_enabled, production_enabled,
    configuration_status, nfe_series_number, nfe_environment_code,
    pis_cofins_regime, uf_accreditations, certificate_ref,
    accounting_validated_at, created_at, updated_at
  ) VALUES (
    v_company, true, v_tag || ' EMITENTE LTDA', v_tag || ' EMIT', '19131243000197',
    'ISENTO', 'SIMPLES_NACIONAL', '1', '2029100', 'f42-harness@example.invalid',
    '95700000', 'RUA SINTETICA F42', '1', 'CENTRO', 'BENTO GONCALVES', '4302105',
    'RS', 'BR', 'NONE', 'HOMOLOGATION', true, false, 'VALIDATED',
    899, '2', 'CUMULATIVO',
    jsonb_build_array(jsonb_build_object('uf','RS','status','CREDENCIADO','environment','2')),
    v_tag, now(), now(), now()
  );
  INSERT INTO public._f42_harness_fixtures(tag, entity, entity_id)
  VALUES (v_tag, 'company_fiscal_settings', v_company);

  -- Prontidão REAL exigida pelo motor (rpc_fiscal_xml_prepare_v1).
  SELECT nfe_readiness_status INTO v_status
    FROM public.company_fiscal_settings WHERE id = v_company;
  IF v_status <> 'READY_HOMOLOGATION' THEN
    RAISE EXCEPTION 'F42_SETUP: emitente sintetico ficou % (esperado READY_HOMOLOGATION); pendencias=%',
      v_status,
      (SELECT nfe_readiness_pendencies FROM public.company_fiscal_settings WHERE id = v_company);
  END IF;

  IF (SELECT count(*) FROM public.company_fiscal_settings WHERE is_active) <> 1 THEN
    RAISE EXCEPTION 'F42_SETUP: singleton de emitente ativo violado';
  END IF;

  -- 2. Cliente fiscal + perfil fiscal do destinatário (parceiro devedor).
  --    A tabela real é `public.clientes` (não `clients`); não possui `ativo`
  --    e exige `codigo_cliente` NOT NULL.
  INSERT INTO public.clientes (id, nome, tipo_pessoa, cpf_cnpj, email, codigo_cliente)
  VALUES (v_client, v_tag || ' DESTINATARIO', 'juridica', '45723174000110',
          'f42-dest@example.invalid', 'F42' || v_suffix);
  INSERT INTO public._f42_harness_fixtures(tag, entity, entity_id)
  VALUES (v_tag, 'clientes', v_client);

  INSERT INTO public.customer_fiscal_profiles (
    customer_id, taxpayer_indicator, person_type, cpf_cnpj, legal_name,
    state_registration, final_consumer, icms_taxpayer, use_main_address,
    fiscal_postal_code, fiscal_street, fiscal_number, fiscal_neighborhood,
    fiscal_city, fiscal_municipality_ibge_code, fiscal_state, country_code,
    fiscal_email, profile_status
  ) VALUES (
    v_client, '9', 'PJ', '45723174000110', v_tag || ' DESTINATARIO LTDA',
    NULL, true, false, false,
    '95700000', 'AV SINTETICA F42', '2', 'CENTRO',
    'BENTO GONCALVES', '4302105', 'RS', 'BR',
    'f42-dest@example.invalid', 'VALIDATED'
  );
  INSERT INTO public._f42_harness_fixtures(tag, entity, entity_id)
  VALUES (v_tag, 'customer_fiscal_profiles', v_client);

  -- Prontidão do destinatário é recalculada por
  -- `trg_fiscal_recipient_readiness` no INSERT; o contrato exige 'READY'.
  SELECT nfe_readiness_status INTO v_status
    FROM public.customer_fiscal_profiles WHERE customer_id = v_client;
  IF v_status <> 'READY' THEN
    RAISE EXCEPTION 'F42_SETUP: destinatario sintetico ficou % (esperado READY); pendencias=%',
      v_status,
      (SELECT nfe_readiness_pendencies FROM public.customer_fiscal_profiles WHERE customer_id = v_client);
  END IF;

  -- 3. Conta de parceiro B2B devedora, vinculada ao cliente fiscal.
  --    `partner_accounts` não possui `nome`: exige `razao_social`.
  INSERT INTO public.partner_accounts (id, razao_social, nome_fantasia, client_id, ativo)
  VALUES (v_partner, v_tag || ' PARCEIRO LTDA', v_tag || ' PARCEIRO', v_client, true);
  INSERT INTO public._f42_harness_fixtures(tag, entity, entity_id)
  VALUES (v_tag, 'partner_accounts', v_partner);

  -- 4a. Pedido elegível (faturável).
  INSERT INTO public.partner_orders (id, partner_id, status, subtotal, total, observacoes)
  VALUES (v_order, v_partner, 'aprovado', 1000.00, 1000.00, v_tag || ' pedido elegivel');
  UPDATE public.partner_orders
     SET financial_approval_status = 'approved',
         payment_condition_status  = 'defined'
   WHERE id = v_order;
  INSERT INTO public._f42_harness_fixtures(tag, entity, entity_id)
  VALUES (v_tag, 'partner_orders', v_order);

  -- 4b. Pedido em cotação (deve BLOQUEAR sem efeitos colaterais).
  INSERT INTO public.partner_orders (id, partner_id, status, subtotal, total, observacoes)
  VALUES (v_order_quo, v_partner, 'em_analise_comercial', 500.00, 500.00, v_tag || ' pedido cotacao');
  INSERT INTO public._f42_harness_fixtures(tag, entity, entity_id)
  VALUES (v_tag, 'partner_orders', v_order_quo);

  -- 5. Série de numeração exclusiva do teste (série 899, homologação).
  INSERT INTO public.fiscal_document_series (
    id, company_id, document_model, series, environment_code, current_number,
    status, notes
  ) VALUES (v_series, v_company, '55', 899, '2', 0, 'ACTIVE', v_tag);
  INSERT INTO public._f42_harness_fixtures(tag, entity, entity_id)
  VALUES (v_tag, 'fiscal_document_series', v_series);

  -- 6a. Documento fiscal elegível (NF-e 55, homologação).
  INSERT INTO public.fiscal_invoices (
    id, invoice_type, document_model, status, source_type, source_id,
    customer_id, debtor_partner_id, debtor_customer_id, direction, fin_nfe,
    nature_operation, tp_emis, issue_date, total_amount, created_by, notes
  ) VALUES (
    v_invoice, 'NFE', 'NFE', 'PENDING', 'PARTNER_ORDER', v_order,
    v_client, v_partner, v_client, 'OUT', 1,
    'VENDA DE MERCADORIA (HOMOLOGACAO F42)', 1, current_date, 1000.00,
    '00000000-0000-0000-0000-000000000000', v_tag
  );
  INSERT INTO public._f42_harness_fixtures(tag, entity, entity_id)
  VALUES (v_tag, 'fiscal_invoices', v_invoice);

  INSERT INTO public.fiscal_invoice_items (
    fiscal_invoice_id, item_sequence, item_kind, description, quantity,
    commercial_unit, unit_value, gross_value, discount_value, freight_value,
    insurance_value, other_value, net_value
  ) VALUES (
    v_invoice, 1, 'PRODUCT', v_tag || ' PRODUTO SINTETICO', 10.000000,
    'UN', 100.000000, 1000.00, 0, 0, 0, 0, 1000.00
  );

  -- 6b. Documento vinculado ao pedido em cotação (deve bloquear).
  INSERT INTO public.fiscal_invoices (
    id, invoice_type, document_model, status, source_type, source_id,
    customer_id, debtor_partner_id, debtor_customer_id, direction, fin_nfe,
    nature_operation, tp_emis, issue_date, total_amount, created_by, notes
  ) VALUES (
    v_inv_quote, 'NFE', 'NFE', 'PENDING', 'PARTNER_ORDER', v_order_quo,
    v_client, v_partner, v_client, 'OUT', 1,
    'VENDA BLOQUEADA (COTACAO)', 1, current_date, 500.00,
    '00000000-0000-0000-0000-000000000000', v_tag
  );
  INSERT INTO public._f42_harness_fixtures(tag, entity, entity_id)
  VALUES (v_tag, 'fiscal_invoices', v_inv_quote);

  INSERT INTO public.fiscal_invoice_items (
    fiscal_invoice_id, item_sequence, item_kind, description, quantity,
    commercial_unit, unit_value, gross_value, net_value
  ) VALUES (
    v_inv_quote, 1, 'PRODUCT', v_tag || ' PRODUTO COTACAO', 5.000000,
    'UN', 100.000000, 500.00, 500.00
  );

  RAISE NOTICE 'F42 SETUP OK tag=% invoice=% invoice_quote=% company=% series=%',
    v_tag, v_invoice, v_inv_quote, v_company, v_series;
END $f$;

-- Saída consumida pelo `run` (exportar para o ambiente do harness).
SELECT entity, entity_id
  FROM public._f42_harness_fixtures
 WHERE tag = :'f42_tag'
 ORDER BY id;

COMMIT;
