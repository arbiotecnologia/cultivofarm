
-- =====================================================================
-- H12 — Correcoes fiscais pos-auditoria (NF-e totalizacao, certificado
-- por emitente, fechamento de autorizacao, caminho proprio de servicos e
-- infraestrutura parametrizada IBS/CBS).
-- Projeto canonico: swzpzcwiasxmjutrmvkm. Producao permanece bloqueada.
-- =====================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker
                  WHERE project_ref = 'swzpzcwiasxmjutrmvkm'
                    AND coalesce(production_emission_allowed,true) = false) THEN
    RAISE EXCEPTION 'FISCAL_CANONICAL_TARGET_REQUIRED';
  END IF;
END $guard$;

-- ---------------------------------------------------------------------
-- 1. Suporte parametrizado e versionado de leiaute RTC (IBS/CBS/IS).
--    Sem linha publicada => fail-closed (comportamento atual preservado).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_rtc_layout_support (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_model text NOT NULL CHECK (document_model IN ('NFE','NFSE')),
  tax_kind text NOT NULL CHECK (tax_kind IN ('IBS','CBS','IS')),
  layout_version text NOT NULL,
  xsd_validated boolean NOT NULL DEFAULT false,
  supported boolean NOT NULL DEFAULT false,
  valid_from date NOT NULL,
  valid_until date,
  evidence_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CHECK (valid_until IS NULL OR valid_until >= valid_from),
  UNIQUE (document_model, tax_kind, layout_version, valid_from)
);

GRANT SELECT ON public.fiscal_rtc_layout_support TO authenticated;
GRANT ALL ON public.fiscal_rtc_layout_support TO service_role;
ALTER TABLE public.fiscal_rtc_layout_support ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_rtc_layout_support_read ON public.fiscal_rtc_layout_support;
CREATE POLICY fiscal_rtc_layout_support_read ON public.fiscal_rtc_layout_support
  FOR SELECT TO authenticated USING (public.fn_fiscal_can_operate());

CREATE INDEX IF NOT EXISTS ix_fiscal_rtc_layout_support_lookup
  ON public.fiscal_rtc_layout_support (document_model, tax_kind, valid_from DESC);

CREATE OR REPLACE FUNCTION public.fn_fiscal_rtc_layout_supported_v1(
  _document_model text, _tax_kind text, _ref_date date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_rtc_layout_support s
     WHERE s.document_model = _document_model
       AND s.tax_kind = _tax_kind
       AND s.supported IS TRUE
       AND s.xsd_validated IS TRUE
       AND s.valid_from <= coalesce(_ref_date, current_date)
       AND (s.valid_until IS NULL OR s.valid_until >= coalesce(_ref_date, current_date)));
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fiscal_rtc_layout_supported_v1(text,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_rtc_layout_supported_v1(text,text,date) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Certificado A1 vinculado ao emitente da nota (nunca "o mais recente").
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_certificate_for_invoice_v1(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_inv public.fiscal_invoices%ROWTYPE;
  v_company uuid; v_cnpj text; v_cert uuid; v_count int;
BEGIN
  SELECT * INTO v_inv FROM public.fiscal_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND'; END IF;

  v_cnpj := regexp_replace(coalesce(nullif(btrim(v_inv.company_cnpj),''),
                                    v_inv.company_snapshot->>'cnpj',''), '[^0-9]', '', 'g');
  IF v_cnpj = '' THEN
    RAISE EXCEPTION 'FISCAL_CERTIFICATE_BINDING_UNRESOLVED: nota sem CNPJ do emitente.';
  END IF;

  SELECT count(*), min(id) INTO v_count, v_company
    FROM public.company_fiscal_settings
   WHERE regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') = v_cnpj AND is_active;
  IF coalesce(v_count,0) <> 1 THEN
    RAISE EXCEPTION 'FISCAL_CERTIFICATE_BINDING_UNRESOLVED: emitente da nota nao resolvido de forma inequivoca.';
  END IF;

  SELECT count(*), min(id) INTO v_count, v_cert
    FROM public.fiscal_certificates
   WHERE company_settings_id = v_company
     AND environment = 'HOMOLOGATION'
     AND status = 'AVAILABLE'
     AND is_active IS TRUE
     AND revoked_at IS NULL
     AND (valid_until IS NULL OR valid_until > now());
  IF coalesce(v_count,0) = 0 THEN
    RAISE EXCEPTION 'CERTIFICATE_REQUIRED: emitente sem certificado de homologacao valido.';
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'FISCAL_CERTIFICATE_AMBIGUOUS: mais de um certificado ativo para o emitente.';
  END IF;

  RETURN jsonb_build_object('certificateId', v_cert, 'companySettingsId', v_company,
                            'environment','HOMOLOGATION');
END $$;

REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_certificate_for_invoice_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_for_invoice_v1(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 3. Fechamento server-side da autorizacao, sem sobrescrever historico.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(
  _invoice_id uuid, _access_key text, _protocol text, _dh_recbto timestamptz,
  _c_stat text, _x_motivo text, _transmission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_inv public.fiscal_invoices%ROWTYPE; v_xml uuid;
BEGIN
  IF nullif(btrim(coalesce(_protocol,'')),'') IS NULL
     OR coalesce(_access_key,'') !~ '^[0-9]{44}$' THEN
    RAISE EXCEPTION 'FISCAL_AUTHORIZATION_PAYLOAD_INVALID';
  END IF;

  SELECT * INTO v_inv FROM public.fiscal_invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND'; END IF;
  IF coalesce(v_inv.environment,'HOMOLOGATION') = 'PRODUCTION' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  -- Idempotente: documento ja autorizado nunca e reescrito.
  IF v_inv.normalized_status = 'AUTHORIZED' THEN
    IF coalesce(v_inv.access_key,'') <> _access_key THEN
      RAISE EXCEPTION 'FISCAL_AUTHORIZATION_CONFLICT: documento ja autorizado com outra chave.';
    END IF;
    RETURN jsonb_build_object('invoiceId', v_inv.id, 'applied', false,
      'normalizedStatus', v_inv.normalized_status,
      'reconciliationStatus', v_inv.reconciliation_status);
  END IF;

  -- Evidencia do XML assinado ja armazenado. O nfeProc (XML + protocolo) ainda
  -- nao e montado pelo transporte: enquanto nao existir, a nota fica PENDING.
  SELECT r.id INTO v_xml
    FROM public.fiscal_xml_runs r
   WHERE r.fiscal_invoice_id = _invoice_id
     AND r.signed_path IS NOT NULL
     AND (r.access_key IS NULL OR r.access_key = _access_key)
   ORDER BY coalesce(r.signed_at, r.updated_at) DESC LIMIT 1;

  UPDATE public.fiscal_invoices
     SET status = 'ISSUED',
         normalized_status = 'AUTHORIZED',
         access_key = _access_key,
         authorized_at = coalesce(_dh_recbto, now()),
         provider_status_raw = coalesce(_c_stat, provider_status_raw),
         tax_authority_notes = coalesce(_x_motivo, tax_authority_notes),
         -- xml_document_id NAO e sobrescrito aqui: o nfeProc protocolado ainda
         -- nao e gerado/armazenado pelo transporte (gate documentado).
         reconciliation_status = 'PENDING',
         updated_at = now()
   WHERE id = _invoice_id;

  INSERT INTO public.fiscal_audit_log (table_name, record_id, action, old_values, new_values, changed_by)
  VALUES ('fiscal_invoices', _invoice_id, 'UPDATE',
          jsonb_build_object('normalizedStatus', v_inv.normalized_status, 'status', v_inv.status),
          jsonb_build_object('normalizedStatus','AUTHORIZED','status','ISSUED',
                             'accessKey', _access_key, 'protocol', _protocol,
                             'transmissionId', _transmission_id,
                             'signedXmlRunId', v_xml,
                             'protocoledXmlStored', false), NULL);

  RETURN jsonb_build_object('invoiceId', _invoice_id, 'applied', true,
    'normalizedStatus','AUTHORIZED',
    'reconciliationStatus','PENDING',
    'signedXmlRunId', v_xml,
    'protocoledXmlStored', false);
END $$;

REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamptz,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamptz,text,text,uuid)
  TO service_role;

-- 4. Totalizacao NF-e corrigida.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_calculate_invoice_v1(p_invoice_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  it record; pol public.fiscal_operation_policies%ROWTYPE; rule public.fiscal_tax_rules%ROWTYPE;
  item_taxes jsonb; item_snapshot jsonb; ctx jsonb; res jsonb;
  totals jsonb; existing jsonb; debtor jsonb;
  t_icms numeric := 0; t_st numeric := 0; t_fcp numeric := 0; t_difal numeric := 0;
  t_pis numeric := 0; t_cofins numeric := 0; t_ipi numeric := 0; t_fcpst numeric := 0;
  t_difal_dest numeric := 0; t_difal_orig numeric := 0; t_fcp_dest numeric := 0;
  t_prod numeric := 0; t_desc numeric := 0; t_frete numeric := 0; t_seg numeric := 0; t_outros numeric := 0;
  t_nf numeric := 0; t_com numeric := 0; n_items int := 0; ref_date date; kinds text[]; k text;
  has_difal boolean := false;
  v_prod numeric; v_icms_own numeric; v_ipi numeric; v_base_st numeric;
  v_st_val numeric; v_fcp_own numeric; v_fcp_st numeric;
  v_difal_dest numeric; v_difal_orig numeric; v_fcp_dest numeric;
BEGIN
  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para calcular documento fiscal.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;

  -- F3.1-R1: gate de ambiente avaliado ANTES de qualquer leitura/efeito, fail-closed.
  PERFORM public.fn_fiscal_assert_environment_homologation();

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;

  IF EXISTS (SELECT 1 FROM public.fiscal_calculation_runs
              WHERE idempotency_key = p_idempotency_key
                AND fiscal_invoice_id <> p_invoice_id) THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave de idempotencia ja utilizada por outro documento fiscal.';
  END IF;

  SELECT result INTO existing FROM public.fiscal_calculation_runs
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF existing IS NOT NULL THEN
    RETURN existing || jsonb_build_object('idempotentReplay', true);
  END IF;

  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: somente rascunho pode ser calculado (status=%)', inv.status;
  END IF;
  IF inv.document_model <> 'NFE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: fase F3 cobre apenas NF-e modelo 55.';
  END IF;
  IF coalesce(inv.tp_emis,1) <> 1 THEN
    RAISE EXCEPTION 'FISCAL_TPEMIS_UNSUPPORTED: apenas emissao normal (tpEmis=1) esta habilitada nesta fase.';
  END IF;
  IF inv.tax_snapshot IS NOT NULL AND inv.tax_snapshot ? 'engineVersion' THEN
    RAISE EXCEPTION 'FISCAL_SNAPSHOT_IMMUTABLE: documento ja possui snapshot tributario; historico nao recalcula.';
  END IF;

  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %', (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'reasons';
  END IF;

  -- F3.1: devedor B2B x destinatario do documento (fail-closed, antes de qualquer efeito).
  debtor := public.fn_fiscal_assert_debtor_recipient(p_invoice_id);

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;

  -- F3.1: gate de ambiente/homologacao reavaliado tambem no CALCULO.
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao (tpAmb=1) bloqueado na fase F3; teto READY_HOMOLOGATION.';
  END IF;
  IF emit.nfe_readiness_status <> 'READY_HOMOLOGATION' THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_READY: emitente com pendencias %', emit.nfe_readiness_pendencies;
  END IF;

  IF inv.customer_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_RECIPIENT_MISSING: destinatario/devedor nao resolvido para o documento.';
  END IF;
  SELECT * INTO dest FROM public.customer_fiscal_profiles WHERE customer_id = inv.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECIPIENT_PROFILE_MISSING: perfil fiscal do destinatario nao cadastrado.'; END IF;
  IF dest.nfe_readiness_status <> 'READY' THEN
    RAISE EXCEPTION 'FISCAL_RECIPIENT_NOT_READY: destinatario com pendencias %', dest.nfe_readiness_pendencies;
  END IF;

  ref_date := coalesce(inv.issue_date, current_date);

  FOR it IN
    SELECT * FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id ORDER BY item_sequence
  LOOP
    n_items := n_items + 1;
    IF coalesce(it.quantity,0) <= 0 OR coalesce(it.unit_value,0) < 0 THEN
      RAISE EXCEPTION 'FISCAL_ITEM_INVALID: item % com quantidade ou valor unitario invalido.', it.item_sequence;
    END IF;
    IF nullif(btrim(coalesce(it.ncm_snapshot,'')),'') IS NULL THEN
      RAISE EXCEPTION 'FISCAL_ITEM_NCM_MISSING: item % sem NCM no snapshot do pedido.', it.item_sequence;
    END IF;

    v_prod := public.fn_fiscal_round(coalesce(it.gross_value, it.quantity * it.unit_value));

    res := public.fn_fiscal_compute_item_taxes_v1(
      emit, dest, coalesce(inv.direction,'OUT'), inv.sales_channel, ref_date, it.ncm_snapshot,
      v_prod, coalesce(it.discount_value,0), coalesce(it.freight_value,0),
      coalesce(it.insurance_value,0), coalesce(it.other_value,0),
      coalesce(it.tax_input_snapshot,'{}'::jsonb), auth.uid());

    item_taxes := res->'taxes';
    kinds := ARRAY(SELECT jsonb_array_elements_text(res->'taxOrder'));
    SELECT * INTO pol FROM public.fiscal_operation_policies WHERE id = (res->'policy'->>'id')::uuid;
    v_icms_own   := coalesce((res->'chained'->>'icmsOwnValue')::numeric,0);
    v_ipi        := coalesce((res->'chained'->>'ipi')::numeric,0);
    v_st_val     := coalesce((res->'chained'->>'icmsSt')::numeric,0);
    v_base_st    := nullif(res->'chained'->>'baseST','')::numeric;
    v_fcp_own    := coalesce((res->'itemTotals'->>'vFCP')::numeric,0);
    v_fcp_st     := coalesce((res->'itemTotals'->>'vFCPST')::numeric,0);
    v_difal_dest := coalesce((res->'itemTotals'->>'vICMSUFDest')::numeric,0);
    v_difal_orig := coalesce((res->'itemTotals'->>'vICMSUFRemet')::numeric,0);
    v_fcp_dest   := coalesce((res->'itemTotals'->>'vFCPUFDest')::numeric,0);
    has_difal    := has_difal OR coalesce((res->>'hasDifal')::boolean,false);

    t_prod   := t_prod + v_prod;
    t_desc   := t_desc + public.fn_fiscal_round(coalesce(it.discount_value,0));
    t_frete  := t_frete + public.fn_fiscal_round(coalesce(it.freight_value,0));
    t_seg    := t_seg + public.fn_fiscal_round(coalesce(it.insurance_value,0));
    t_outros := t_outros + public.fn_fiscal_round(coalesce(it.other_value,0));
    t_icms   := t_icms   + coalesce((item_taxes->'ICMS'->>'value')::numeric,0);
    t_st     := t_st     + v_st_val;
    -- vFCP = FCP proprio da operacao. vFCPST = FCP retido por ST.
    -- vFCPUFDest = FCP devido a UF de destino no DIFAL. Sem sobreposicao.
    t_fcp    := t_fcp    + v_fcp_own;
    t_fcpst  := t_fcpst  + v_fcp_st;
    t_difal  := t_difal  + coalesce((item_taxes->'DIFAL'->>'value')::numeric,0);
    t_difal_dest := t_difal_dest + v_difal_dest;
    t_difal_orig := t_difal_orig + v_difal_orig;
    t_fcp_dest   := t_fcp_dest + v_fcp_dest;
    t_pis    := t_pis    + coalesce((item_taxes->'PIS'->>'value')::numeric,0);
    t_cofins := t_cofins + coalesce((item_taxes->'COFINS'->>'value')::numeric,0);
    t_ipi    := t_ipi    + coalesce((item_taxes->'IPI'->>'value')::numeric,0);

    item_snapshot := jsonb_build_object(
      'engineVersion','F3.4',
      'calculatedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
      'ncm', it.ncm_snapshot,
      'cfop', pol.cfop,
      'natureOperation', pol.nature_operation,
      'operationPolicyId', pol.id,
      'operationPolicyVersion', pol.legal_version,
      'operationLegalBasis', pol.legal_basis,
      'operationSourceId', pol.source_id,
      'crt', emit.crt,
      'roundingMode','HALF_UP_2',
      'components', jsonb_build_object(
        'produto', v_prod,
        'desconto', public.fn_fiscal_round(coalesce(it.discount_value,0)),
        'frete', public.fn_fiscal_round(coalesce(it.freight_value,0)),
        'seguro', public.fn_fiscal_round(coalesce(it.insurance_value,0)),
        'outras', public.fn_fiscal_round(coalesce(it.other_value,0))),
      'taxOrder', to_jsonb(kinds),
      'taxInputs', coalesce(it.tax_input_snapshot, '{}'::jsonb),
      'chainedContext', jsonb_build_object(
        'icmsOwnValue', v_icms_own, 'ipi', v_ipi,
        'icmsSt', v_st_val, 'baseST', v_base_st),
      'itemTotals', jsonb_build_object(
        'vFCP', v_fcp_own, 'vFCPST', v_fcp_st,
        'vICMSUFDest', v_difal_dest, 'vICMSUFRemet', v_difal_orig,
        'vFCPUFDest', v_fcp_dest),
      'taxes', item_taxes);

    UPDATE public.fiscal_invoice_items
       SET tax_snapshot = item_snapshot,
           cfop_snapshot = pol.cfop,
           cst_icms_snapshot = item_taxes->'ICMS'->>'cst',
           csosn_snapshot = item_taxes->'ICMS'->>'csosn',
           net_value = coalesce((item_taxes->'ICMS'->>'baseOriginal')::numeric, v_prod),
           updated_at = now()
     WHERE id = it.id;
  END LOOP;

  IF n_items = 0 THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NO_ITEMS: documento sem itens.';
  END IF;

  -- H12: o total comercial do rascunho NAO contem tributos somados ao documento
  -- (ST/FCP-ST/IPI). O guard permanece, mas compara grandezas equivalentes.
  t_com := public.fn_fiscal_round(t_prod - t_desc + t_frete + t_seg + t_outros);
  t_nf  := public.fn_fiscal_round(t_com + t_st + t_fcpst + t_ipi);

  IF inv.total_amount IS NOT NULL
     AND abs(inv.total_amount - t_com) > 0.01
     AND abs(inv.total_amount - t_nf)  > 0.01 THEN
    RAISE EXCEPTION 'FISCAL_TOTAL_MISMATCH: total informado % difere do total comercial % e do total fiscal %',
      inv.total_amount, t_com, t_nf;
  END IF;

  totals := jsonb_build_object(
    'engineVersion','F3.4', 'roundingMode','HALF_UP_2',
    'itemCount', n_items,
    'vProd', public.fn_fiscal_round(t_prod), 'vDesc', public.fn_fiscal_round(t_desc),
    'vFrete', public.fn_fiscal_round(t_frete), 'vSeg', public.fn_fiscal_round(t_seg),
    'vOutro', public.fn_fiscal_round(t_outros),
    'vICMS', public.fn_fiscal_round(t_icms), 'vST', public.fn_fiscal_round(t_st),
    'vFCP', public.fn_fiscal_round(t_fcp), 'vFCPST', public.fn_fiscal_round(t_fcpst),
    'vDIFAL', public.fn_fiscal_round(t_difal),
    'vPIS', public.fn_fiscal_round(t_pis), 'vCOFINS', public.fn_fiscal_round(t_cofins),
    'vIPI', public.fn_fiscal_round(t_ipi), 'vNF', t_nf, 'vCommercial', t_com,
    'debtor', debtor);

  IF has_difal THEN
    totals := totals || jsonb_build_object(
      'vICMSUFDest', public.fn_fiscal_round(t_difal_dest),
      'vICMSUFRemet', public.fn_fiscal_round(t_difal_orig),
      'vFCPUFDest', public.fn_fiscal_round(t_fcp_dest));
  END IF;

  UPDATE public.fiscal_invoices
     SET tax_snapshot = totals,
         fiscal_totals_snapshot = totals,
         total_amount = t_nf,
         debtor_partner_id = coalesce(inv.debtor_partner_id, nullif(debtor->>'debtorPartnerId','')::uuid),
         debtor_customer_id = coalesce(inv.debtor_customer_id, nullif(debtor->>'recipientCustomerId','')::uuid),
         company_snapshot = jsonb_build_object(
           'cnpj', emit.cnpj, 'legalName', emit.legal_name, 'crt', emit.crt,
           'ie', emit.state_registration, 'uf', emit.state,
           'municipalityIbge', emit.municipality_ibge_code,
           'series', emit.nfe_series_number, 'environment', emit.nfe_environment_code),
         customer_snapshot = jsonb_build_object(
           'document', dest.cpf_cnpj, 'legalName', dest.legal_name,
           'indIEDest', dest.taxpayer_indicator, 'uf', dest.fiscal_state,
           'municipalityIbge', dest.fiscal_municipality_ibge_code,
           'finalConsumer', dest.final_consumer, 'icmsTaxpayer', dest.icms_taxpayer,
           'debtorPartnerId', debtor->>'debtorPartnerId'),
         updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.fiscal_calculation_runs (fiscal_invoice_id, idempotency_key, engine_version, result, created_by)
  VALUES (p_invoice_id, p_idempotency_key, 'F3.4', totals, auth.uid());

  RETURN totals || jsonb_build_object('idempotentReplay', false);
END $function$
;

-- 5. ISS no motor canonico.
CREATE OR REPLACE FUNCTION public.fn_fiscal_apply_tax_v2(r fiscal_tax_rules, _ctx jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  base_raw numeric; base_eff numeric; val numeric := 0;
  extra jsonb := '{}'::jsonb;
  icms_own numeric; base_st numeric; v_st numeric;
  v_mode text; v_src text; v_red numeric; v_manual numeric;
  v_manual_by text; v_manual_at text; v_manual_reason text;
  r_int numeric; r_inter numeric; share numeric;
  v_difal_dest numeric; v_difal_orig numeric; v_fcp numeric;
BEGIN
  IF r.tax_kind IN ('IBS','CBS','IS') THEN
    RAISE EXCEPTION 'FISCAL_RTC_ENGINE_UNAVAILABLE: IBS/CBS/IS permanecem em scaffolding bloqueado ate regra e leiaute oficiais.'
      USING HINT = 'Nao simule tributos da reforma como se fossem vigentes.';
  END IF;

  base_raw := public.fn_fiscal_item_base(r.base_components, _ctx);
  IF base_raw < 0 THEN
    RAISE EXCEPTION 'FISCAL_TAX_BASE_NEGATIVE: base negativa para tributo %.', r.tax_kind;
  END IF;
  -- Resolucao canonica do percentual de reducao da base (NONE / FIXED / MANUAL).
  v_mode := coalesce(r.base_reduction_mode,'NONE');
  v_manual := nullif(btrim(coalesce(_ctx->>'manualBaseReductionPct','')),'')::numeric;
  v_manual_by := nullif(btrim(coalesce(_ctx->>'manualBy','')),'');
  v_manual_at := nullif(btrim(coalesce(_ctx->>'manualAt','')),'');
  v_manual_reason := nullif(btrim(coalesce(_ctx->>'manualReason','')),'');

  IF v_mode = 'MANUAL' THEN
    IF v_manual IS NULL THEN
      RAISE EXCEPTION 'FISCAL_BASE_REDUCTION_INPUT_REQUIRED: tributo % exige percentual de reducao informado na preparacao.', r.tax_kind;
    END IF;
    IF v_manual < 0 OR v_manual > 100 THEN
      RAISE EXCEPTION 'FISCAL_BASE_REDUCTION_OUT_OF_RANGE: percentual de reducao % invalido para %; use 0 a 100.', v_manual, r.tax_kind;
    END IF;
    IF v_manual_reason IS NULL THEN
      RAISE EXCEPTION 'FISCAL_BASE_REDUCTION_REASON_REQUIRED: informe o motivo da reducao manual da base de calculo (%).', r.tax_kind;
    END IF;
    v_red := v_manual;
    v_src := 'MANUAL';
  ELSIF v_mode = 'FIXED' THEN
    IF v_manual IS NOT NULL THEN
      RAISE EXCEPTION 'FISCAL_BASE_REDUCTION_NOT_EDITABLE: regra % define reducao fixa; percentual manual nao e aceito.', r.rule_key;
    END IF;
    v_red := coalesce(r.base_reduction_pct,0);
    v_src := 'FIXED';
  ELSE
    IF v_manual IS NOT NULL THEN
      RAISE EXCEPTION 'FISCAL_BASE_REDUCTION_NOT_ALLOWED: regra % nao admite reducao da base de calculo.', r.rule_key;
    END IF;
    v_red := 0;
    v_src := 'NONE';
  END IF;

  base_eff := public.fn_fiscal_round(base_raw * (1 - v_red/100));

  IF r.calc_mode IN ('EXEMPT_DOCUMENTED','NOT_TAXED_DOCUMENTED','SUSPENDED_DOCUMENTED') THEN
    -- Modo documentado: preserva base/CST/motivo; nao apaga informacao exigida no leiaute.
    IF nullif(btrim(coalesce(r.justification,'')),'') IS NULL
       OR nullif(btrim(coalesce(r.legal_basis,'')),'') IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: modo % exige motivo e base legal documentados.', r.calc_mode;
    END IF;
    val := 0;
    extra := extra || jsonb_build_object('documentedMode', r.calc_mode, 'taxedBase', base_eff);

  ELSIF r.calc_mode = 'DEFERRED_DOCUMENTED' THEN
    -- Diferimento: exige percentual, motivo e base legal; valor diferido explicitado.
    IF nullif(btrim(coalesce(r.justification,'')),'') IS NULL
       OR nullif(btrim(coalesce(r.legal_basis,'')),'') IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: diferimento exige motivo e base legal documentados.';
    END IF;
    IF r.rate IS NULL OR r.deferral_pct IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: diferimento exige aliquota e deferral_pct.';
    END IF;
    val := public.fn_fiscal_round(base_eff * r.rate / 100);
    extra := extra || jsonb_build_object('documentedMode', r.calc_mode,
      'deferralPct', r.deferral_pct,
      'deferredValue', public.fn_fiscal_round(val * r.deferral_pct / 100));
    val := public.fn_fiscal_round(val * (1 - r.deferral_pct/100));

  ELSIF r.calc_mode <> 'PERCENT' THEN
    RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: calc_mode % nao suportado pelo motor F3.', r.calc_mode;

  ELSIF r.tax_kind IN ('ICMS','PIS','COFINS','IPI','ISS') THEN
    IF r.rate IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: aliquota ausente para tributo %.', r.tax_kind;
    END IF;
    val := public.fn_fiscal_round(base_eff * r.rate / 100);
    IF coalesce(r.deferral_pct,0) > 0 THEN
      extra := extra || jsonb_build_object('deferredValue',
        public.fn_fiscal_round(val * r.deferral_pct / 100));
      val := public.fn_fiscal_round(val * (1 - r.deferral_pct/100));
    END IF;

  ELSIF r.tax_kind = 'ICMS_ST' THEN
    IF coalesce(r.st_modality,'MVA') <> 'MVA' THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: modalidade de BC ST % nao implementada nesta fase.', r.st_modality;
    END IF;
    IF r.mva_pct IS NULL OR r.internal_rate_pct IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: ICMS-ST exige mva_pct e internal_rate_pct.';
    END IF;
    icms_own := coalesce((_ctx->>'icmsOwnValue')::numeric, 0);
    base_st := public.fn_fiscal_round(base_eff * (1 + r.mva_pct/100));
    v_st := public.fn_fiscal_round(base_st * r.internal_rate_pct / 100);
    IF coalesce(r.credit_own_icms,true) THEN
      v_st := public.fn_fiscal_round(v_st - icms_own);
    END IF;
    IF v_st < 0 THEN v_st := 0; END IF;
    val := v_st;
    extra := extra || jsonb_build_object('modBCST', r.st_modality, 'baseST', base_st,
      'internalRatePct', r.internal_rate_pct, 'mvaPct', r.mva_pct,
      'creditedOwnIcms', coalesce(r.credit_own_icms,true), 'ownIcmsValue', icms_own);

  ELSIF r.tax_kind IN ('FCP','FCP_ST') THEN
    IF r.fcp_rate IS NULL AND r.fcp_st_rate IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: FCP exige aliquota propria (fcp_rate/fcp_st_rate).';
    END IF;
    IF r.tax_kind = 'FCP' THEN
      IF r.fcp_rate IS NULL THEN
        RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: FCP exige fcp_rate.';
      END IF;
      val := public.fn_fiscal_round(base_eff * r.fcp_rate / 100);
      extra := extra || jsonb_build_object('fcpBase', base_eff, 'fcpRate', r.fcp_rate);
    ELSE
      IF r.fcp_st_rate IS NULL THEN
        RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: FCP-ST exige fcp_st_rate.';
      END IF;
      base_st := coalesce((_ctx->>'baseST')::numeric, null);
      IF base_st IS NULL THEN
        RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: FCP-ST exige base de ST previamente apurada.';
      END IF;
      val := public.fn_fiscal_round(base_st * r.fcp_st_rate / 100);
      extra := extra || jsonb_build_object('fcpStBase', base_st, 'fcpStRate', r.fcp_st_rate);
    END IF;

  ELSIF r.tax_kind = 'DIFAL' THEN
    r_int := r.internal_rate_pct; r_inter := r.interstate_rate_pct;
    share := r.difal_dest_share_pct;
    IF r_int IS NULL OR r_inter IS NULL OR share IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: DIFAL exige internal_rate_pct, interstate_rate_pct e difal_dest_share_pct.';
    END IF;
    IF r_int < r_inter THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: aliquota interna do destino menor que a interestadual; parametros incoerentes.';
    END IF;
    val := public.fn_fiscal_round(base_eff * (r_int - r_inter) / 100);
    v_difal_dest := public.fn_fiscal_round(val * share / 100);
    v_difal_orig := public.fn_fiscal_round(val - v_difal_dest);
    v_fcp := CASE WHEN r.fcp_rate IS NULL THEN NULL
                  ELSE public.fn_fiscal_round(base_eff * r.fcp_rate / 100) END;
    extra := extra || jsonb_build_object(
      'internalRatePct', r_int, 'interstateRatePct', r_inter,
      'destSharePct', share, 'valueDestination', v_difal_dest,
      'valueOrigin', v_difal_orig, 'fcpValue', v_fcp);

  ELSE
    RAISE EXCEPTION 'FISCAL_TAX_KIND_UNSUPPORTED: tributo % sem formula canonica implementada.', r.tax_kind;
  END IF;

  RETURN jsonb_build_object(
    'taxKind', r.tax_kind, 'calcMode', r.calc_mode, 'formula', 'F3.4/'||r.tax_kind,
    'ruleId', r.id, 'ruleKey', r.rule_key, 'ruleVersion', r.version,
    'sourceId', r.source_id, 'legalBasis', r.legal_basis, 'legalVersion', r.legal_version,
    'justification', r.justification,
    'cst', r.cst, 'csosn', r.csosn, 'crt', r.crt,
    'rate', r.rate, 'baseReductionPct', v_red, 'deferralPct', r.deferral_pct,
    'baseReductionMode', v_mode, 'baseReductionSource', v_src,
    'baseReductionRulePct', r.base_reduction_pct,
    'baseReductionAppliedBy', CASE WHEN v_src = 'MANUAL' THEN v_manual_by ELSE NULL END,
    'baseReductionAppliedAt', CASE WHEN v_src = 'MANUAL' THEN v_manual_at ELSE NULL END,
    'baseReductionReason', CASE WHEN v_src = 'MANUAL' THEN v_manual_reason ELSE NULL END,
    'baseComponents', r.base_components,
    'baseOriginal', base_raw, 'base', base_eff, 'value', val,
    'params', extra);
END $function$
;

-- 6. Fechamento da autorizacao no registro do retorno.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_sefaz_transmit_record_v1(_transmission_id uuid, _state text, _patch jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row     public.fiscal_sefaz_transmissions;
  v_cur     public.fiscal_sefaz_transmissions;
  v_cstat   text;
  v_prot    text;
  v_outcome text;
BEGIN
  IF _state NOT IN ('SENT','SUCCEEDED','FAILED','BLOCKED') THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_STATE_INVALID';
  END IF;

  SELECT * INTO v_cur FROM public.fiscal_sefaz_transmissions WHERE id = _transmission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_TRANSMISSION_NOT_FOUND'; END IF;

  v_cstat := coalesce(_patch->>'protocolCStat', _patch->>'cStat', v_cur.c_stat);
  v_prot  := coalesce(_patch->>'nProt', v_cur.n_prot);

  IF _state IN ('FAILED','BLOCKED') THEN
    v_outcome := 'TRANSPORT_ERROR';
  ELSIF _state = 'SENT' THEN
    v_outcome := 'PENDING';
  ELSIF v_cstat IN ('100','150') AND v_prot IS NOT NULL THEN
    v_outcome := 'AUTHORIZED';
  ELSIF v_cstat IN ('135','136','155') THEN
    v_outcome := 'EVENT_REGISTERED';
  ELSIF v_cstat IN ('103','105','104','106','107','108','109','111','128') THEN
    v_outcome := CASE WHEN v_cur.service = 'NFeStatusServico4'
                      THEN 'SERVICE_INFO' ELSE 'PROCESSING' END;
  ELSE
    v_outcome := 'REJECTED';
  END IF;

  UPDATE public.fiscal_sefaz_transmissions SET
    state            = _state,
    outcome          = v_outcome,
    c_stat           = coalesce(_patch->>'cStat', c_stat),
    x_motivo         = coalesce(_patch->>'xMotivo', x_motivo),
    ch_nfe           = coalesce(_patch->>'chNFe', ch_nfe),
    n_prot           = coalesce(_patch->>'nProt', n_prot),
    n_rec            = coalesce(_patch->>'nRec', n_rec),
    ambiente_retorno = coalesce(_patch->>'tpAmb', ambiente_retorno),
    dh_recbto        = coalesce((_patch->>'dhRecbto')::timestamptz, dh_recbto),
    error_code       = coalesce(_patch->>'errorCode', error_code),
    response_summary = coalesce(_patch->'responseSummary', response_summary),
    completed_at     = CASE WHEN _state IN ('SUCCEEDED','FAILED','BLOCKED')
                            THEN now() ELSE completed_at END
  WHERE id = _transmission_id
  RETURNING * INTO v_row;

  IF v_row.ambiente_retorno IS NOT NULL AND v_row.ambiente_retorno <> '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  -- Reconciliação append-only do evento, sem sobrescrever histórico fiscal.
  IF v_row.service = 'NFeRecepcaoEvento4' AND v_row.fiscal_event_id IS NOT NULL
     AND _state = 'SUCCEEDED' AND v_cstat IS NOT NULL THEN
    PERFORM public.rpc_fiscal_event_sefaz_reconcile_v1(
      v_row.fiscal_event_id, v_row.id, v_cstat,
      coalesce(_patch->>'xMotivo', ''), v_row.n_prot, v_row.dh_recbto);
  END IF;

  -- H12: autorizacao fecha o documento na MESMA transacao do registro do retorno.
  IF v_row.outcome = 'AUTHORIZED' AND v_row.fiscal_invoice_id IS NOT NULL
     AND v_row.ch_nfe IS NOT NULL AND v_row.n_prot IS NOT NULL THEN
    PERFORM public.rpc_fiscal_invoice_apply_authorization_v1(
      v_row.fiscal_invoice_id, v_row.ch_nfe, v_row.n_prot, v_row.dh_recbto,
      v_row.c_stat, v_row.x_motivo, v_row.id);
  END IF;

  RETURN jsonb_build_object(
    'transmissionId', v_row.id, 'state', v_row.state, 'outcome', v_row.outcome,
    'cStat', v_row.c_stat, 'xMotivo', v_row.x_motivo,
    'chNFe', v_row.ch_nfe, 'nProt', v_row.n_prot, 'nRec', v_row.n_rec);
END $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb) TO service_role;
-- ---------------------------------------------------------------------
-- 7. Caminho canonico de calculo de SERVICOS (NFS-e).
--    Mesmo motor/arquitetura: perfis cadastrados + fn_fiscal_round +
--    fiscal_calculation_runs + fiscal_audit_log. Sem motor paralelo e sem
--    reaproveitar formulas exclusivas de mercadorias (ICMS/IPI/ST/FCP).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_fiscal_service_withholding_valid_v1(_cfg jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$
  SELECT _cfg IS NULL
      OR (jsonb_typeof(_cfg) = 'object'
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_each(_cfg) e
             WHERE e.key NOT IN ('pis','cofins','csll','irrf','inss')
                OR jsonb_typeof(e.value) <> 'object'
                OR (e.value->>'rate') IS NULL
                OR (e.value->>'rate') !~ '^[0-9]+(\.[0-9]+)?$'
                OR (e.value->>'rate')::numeric > 100
                OR jsonb_typeof(coalesce(e.value->'withheld','false'::jsonb)) <> 'boolean'));
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fiscal_service_withholding_valid_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_service_withholding_valid_v1(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_calculate_service_invoice_v1(
  p_invoice_id uuid, p_idempotency_key text, p_persist boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  prof public.service_fiscal_profiles%ROWTYPE;
  it record; ref_date date; n_items int := 0;
  v_base numeric; v_iss numeric; v_rate numeric;
  t_gross numeric := 0; t_disc numeric := 0; t_base numeric := 0; t_iss numeric := 0;
  t_iss_withheld numeric := 0; t_fed_withheld numeric := 0;
  wk text; w jsonb; w_rate numeric; w_val numeric; w_out jsonb;
  fed jsonb; items_out jsonb := '[]'::jsonb; item_taxes jsonb; totals jsonb;
  existing jsonb;
BEGIN
  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para calcular documento fiscal.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;
  PERFORM public.fn_fiscal_assert_environment_homologation();

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;
  IF coalesce(inv.document_model,'') <> 'NFSE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: esta rotina calcula apenas NFS-e (servicos).';
  END IF;
  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: calculo disponivel apenas em rascunho (status=%).', inv.status;
  END IF;

  IF p_persist THEN
    SELECT result INTO existing FROM public.fiscal_calculation_runs
      WHERE idempotency_key = p_idempotency_key AND fiscal_invoice_id = p_invoice_id
      ORDER BY created_at DESC LIMIT 1;
    IF existing IS NOT NULL THEN
      RETURN existing || jsonb_build_object('idempotentReplay', true);
    END IF;
    IF EXISTS (SELECT 1 FROM public.fiscal_calculation_runs
                WHERE idempotency_key = p_idempotency_key AND fiscal_invoice_id <> p_invoice_id) THEN
      RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave ja utilizada por outro documento fiscal.';
    END IF;
  END IF;

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao bloqueado.';
  END IF;

  ref_date := coalesce(inv.issue_date, current_date);

  FOR it IN SELECT * FROM public.fiscal_invoice_items
             WHERE fiscal_invoice_id = p_invoice_id ORDER BY item_sequence
  LOOP
    n_items := n_items + 1;
    IF coalesce(it.quantity,0) <= 0 OR coalesce(it.unit_value,0) < 0 THEN
      RAISE EXCEPTION 'FISCAL_ITEM_INVALID: item % com quantidade ou valor unitario invalido.', it.item_sequence;
    END IF;

    SELECT * INTO prof FROM public.service_fiscal_profiles
     WHERE (service_id = it.source_item_id OR source_reference = it.source_item_id::text)
       AND is_active ORDER BY updated_at DESC LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FISCAL_SERVICE_PROFILE_MISSING: item % sem perfil fiscal de servico.', it.item_sequence;
    END IF;
    IF prof.profile_status <> 'VALIDATED' THEN
      RAISE EXCEPTION 'FISCAL_SERVICE_PROFILE_NOT_VALIDATED: item % com perfil em status %.', it.item_sequence, prof.profile_status;
    END IF;
    IF nullif(btrim(coalesce(prof.lc116_item,'')),'') IS NULL THEN
      RAISE EXCEPTION 'FISCAL_SERVICE_LC116_MISSING: item % sem enquadramento LC 116.', it.item_sequence;
    END IF;
    IF prof.iss_rate IS NULL OR prof.iss_rate < 0 OR prof.iss_rate > 100 THEN
      RAISE EXCEPTION 'FISCAL_SERVICE_ISS_RATE_INVALID: item % sem aliquota de ISS valida.', it.item_sequence;
    END IF;
    IF NOT public.fn_fiscal_service_withholding_valid_v1(prof.federal_withholding_defaults) THEN
      RAISE EXCEPTION 'FISCAL_SERVICE_WITHHOLDING_INVALID: retencoes federais do item % fora do contrato.', it.item_sequence;
    END IF;

    -- IBS/CBS so podem entrar quando a politica E o leiaute estiverem comprovados.
    IF coalesce(prof.ibs_cbs_configuration,'{}'::jsonb) <> '{}'::jsonb
       AND coalesce((prof.ibs_cbs_configuration->>'enabled')::boolean,false) THEN
      IF NOT (public.fn_fiscal_rtc_layout_supported_v1('NFSE','IBS',ref_date)
              AND public.fn_fiscal_rtc_layout_supported_v1('NFSE','CBS',ref_date)) THEN
        RAISE EXCEPTION 'FISCAL_RTC_LAYOUT_UNVALIDATED: leiaute IBS/CBS nao validado para NFS-e nesta vigencia.';
      END IF;
    END IF;

    v_base := public.fn_fiscal_round(
      coalesce(it.gross_value, it.quantity * it.unit_value) - coalesce(it.discount_value,0));
    IF v_base < 0 THEN
      RAISE EXCEPTION 'FISCAL_TAX_BASE_NEGATIVE: base negativa no item %.', it.item_sequence;
    END IF;
    v_rate := prof.iss_rate;
    v_iss  := public.fn_fiscal_round(v_base * v_rate / 100);

    fed := coalesce(prof.federal_withholding_defaults,'{}'::jsonb);
    w_out := '{}'::jsonb;
    FOREACH wk IN ARRAY ARRAY['pis','cofins','csll','irrf','inss'] LOOP
      w := fed->wk;
      IF w IS NOT NULL THEN
        w_rate := (w->>'rate')::numeric;
        w_val  := public.fn_fiscal_round(v_base * w_rate / 100);
        w_out  := w_out || jsonb_build_object(upper(wk), jsonb_build_object(
          'base', v_base, 'rate', w_rate, 'value', w_val,
          'withheld', coalesce((w->>'withheld')::boolean,false)));
        IF coalesce((w->>'withheld')::boolean,false) THEN
          t_fed_withheld := t_fed_withheld + w_val;
        END IF;
      END IF;
    END LOOP;

    item_taxes := jsonb_build_object(
      'ISS', jsonb_build_object(
        'taxKind','ISS','formula','SVC1/ISS','base', v_base, 'rate', v_rate,
        'value', v_iss, 'withheld', coalesce(prof.iss_withheld_default,false),
        'lc116Item', prof.lc116_item,
        'municipalTaxationCode', prof.municipal_taxation_code,
        'nationalTaxationCode', prof.national_taxation_code,
        'incidenceMunicipalityIbge', prof.incidence_municipality_ibge_code),
      'FEDERAL_WITHHOLDING', w_out);

    t_gross := t_gross + public.fn_fiscal_round(coalesce(it.gross_value, it.quantity * it.unit_value));
    t_disc  := t_disc  + public.fn_fiscal_round(coalesce(it.discount_value,0));
    t_base  := t_base  + v_base;
    t_iss   := t_iss   + v_iss;
    IF coalesce(prof.iss_withheld_default,false) THEN
      t_iss_withheld := t_iss_withheld + v_iss;
    END IF;

    items_out := items_out || jsonb_build_array(jsonb_build_object(
      'itemSequence', it.item_sequence, 'base', v_base, 'taxes', item_taxes));

    IF p_persist THEN
      UPDATE public.fiscal_invoice_items
         SET tax_snapshot = item_taxes,
             net_value = v_base,
             updated_at = now()
       WHERE id = it.id;
    END IF;
  END LOOP;

  IF n_items = 0 THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NO_ITEMS: documento sem itens.';
  END IF;

  totals := jsonb_build_object(
    'engineVersion','SVC1.0', 'documentModel','NFSE', 'roundingMode','HALF_UP_2',
    'itemCount', n_items,
    'vServ', public.fn_fiscal_round(t_gross),
    'vDesc', public.fn_fiscal_round(t_disc),
    'vBC',   public.fn_fiscal_round(t_base),
    'vISS',  public.fn_fiscal_round(t_iss),
    'vISSRetido', public.fn_fiscal_round(t_iss_withheld),
    'vRetFederais', public.fn_fiscal_round(t_fed_withheld),
    -- Liquido = servicos menos descontos e SOMENTE tributos efetivamente retidos.
    'vLiq', public.fn_fiscal_round(t_base - t_iss_withheld - t_fed_withheld),
    'ibsCbsApplied', false,
    'ibsCbsGate','FISCAL_RTC_LAYOUT_UNVALIDATED',
    'nationalTransmissionSupported', false,
    'items', items_out);

  IF p_persist THEN
    UPDATE public.fiscal_invoices
       SET tax_snapshot = totals - 'items',
           fiscal_totals_snapshot = totals - 'items',
           updated_at = now()
     WHERE id = p_invoice_id;

    INSERT INTO public.fiscal_calculation_runs
      (fiscal_invoice_id, idempotency_key, engine_version, result, created_by)
    VALUES (p_invoice_id, p_idempotency_key, 'SVC1.0', totals, auth.uid());

    INSERT INTO public.fiscal_audit_log (table_name, record_id, action, old_values, new_values, changed_by)
    VALUES ('fiscal_invoices', p_invoice_id, 'UPDATE',
            jsonb_build_object('taxSnapshot', inv.tax_snapshot),
            jsonb_build_object('engine','SVC1.0','vISS', t_iss, 'vLiq',
              public.fn_fiscal_round(t_base - t_iss_withheld - t_fed_withheld)),
            auth.uid());
  END IF;

  RETURN totals || jsonb_build_object('idempotentReplay', false, 'persisted', p_persist);
END $$;

REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_calculate_service_invoice_v1(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_calculate_service_invoice_v1(uuid,text,boolean) TO authenticated, service_role;
