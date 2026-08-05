-- =====================================================================
-- FASE F3 — CORREÇÃO 1: unicidade de política de operação por destino
-- Staging ikaauvsflpmamgxmkhoq. Produção NÃO acessada.
-- Motivo: o índice legado fop_active_uq ignorava origin_uf/destination_uf,
-- impedindo políticas concorrentes GO->GO (5101) e GO->SP (6101) com a
-- mesma vigência — requisito de resolução de CFOP por destino da Fase F3.
-- =====================================================================

DROP INDEX IF EXISTS public.fop_active_uq;

CREATE UNIQUE INDEX IF NOT EXISTS fop_active_uq
  ON public.fiscal_operation_policies (
    sales_channel,
    operation_type,
    COALESCE(uf, '*'),
    COALESCE(origin_uf, '*'),
    COALESCE(destination_uf, '*'),
    COALESCE(document_model, '*'),
    COALESCE(taxpayer_indicator, '*'),
    COALESCE(final_consumer, false),
    valid_from
  )
  WHERE active;

COMMENT ON INDEX public.fop_active_uq IS
  'F3: unicidade de politica ativa considerando origem, destino, modelo e perfil do destinatario.';

-- ---------------------------------------------------------------------
-- CORREÇÃO 2: sincronizar normalized_status a partir de status.
-- Motivo: documentos NF-e criados pelo fluxo F3 nasciam com
-- normalized_status NULL, o que fazia o guard de itens bloquear a
-- montagem do documento ainda em rascunho.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_fiscal_invoice_sync_normalized_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
DECLARE v_norm text;
BEGIN
  v_norm := upper(btrim(coalesce(NEW.status,'')));
  v_norm := CASE v_norm
    WHEN 'PENDING' THEN 'DRAFT'
    WHEN 'RASCUNHO' THEN 'DRAFT'
    WHEN 'EMITIDA' THEN 'AUTHORIZED'
    WHEN 'AUTORIZADA' THEN 'AUTHORIZED'
    WHEN 'CANCELADA' THEN 'CANCELED'
    WHEN 'REJEITADA' THEN 'REJECTED'
    WHEN 'ERRO' THEN 'ERROR'
    ELSE v_norm
  END;
  IF v_norm NOT IN ('LEGACY_RECORDED','DRAFT','VALIDATING','READY','QUEUED','PROCESSING',
                    'AUTHORIZED','REJECTED','ERROR','CANCEL_REQUESTED','CANCELED','SUBSTITUTED') THEN
    v_norm := COALESCE(NEW.normalized_status, 'DRAFT');
  END IF;
  NEW.normalized_status := v_norm;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fiscal_invoice_sync_normalized_status ON public.fiscal_invoices;
CREATE TRIGGER trg_fiscal_invoice_sync_normalized_status
  BEFORE INSERT OR UPDATE OF status ON public.fiscal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_invoice_sync_normalized_status();

-- ---------------------------------------------------------------------
-- CORREÇÃO 3: rpc_fiscal_calculate_invoice_v1 — concatenação de tributos.
-- Motivo: `kinds || 'IPI'` era interpretado como literal de array,
-- abortando o cálculo com "malformed array literal".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_calculate_invoice_v1(
  p_invoice_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  it record; pol public.fiscal_operation_policies%ROWTYPE; rule public.fiscal_tax_rules%ROWTYPE;
  item_taxes jsonb; item_snapshot jsonb; base numeric;
  totals jsonb := '{}'::jsonb; existing jsonb;
  t_icms numeric := 0; t_st numeric := 0; t_fcp numeric := 0; t_difal numeric := 0;
  t_pis numeric := 0; t_cofins numeric := 0; t_ipi numeric := 0;
  t_prod numeric := 0; t_desc numeric := 0; t_frete numeric := 0; t_seg numeric := 0; t_outros numeric := 0;
  t_nf numeric := 0; n_items int := 0; ref_date date; kinds text[]; k text;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() AND NOT public.has_role(auth.uid(),'financeiro'::app_role) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para calcular documento fiscal.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;

  SELECT result INTO existing FROM public.fiscal_calculation_runs
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF existing IS NOT NULL THEN
    RETURN existing || jsonb_build_object('idempotentReplay', true);
  END IF;

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;
  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: somente rascunho pode ser calculado (status=%)', inv.status;
  END IF;
  IF inv.document_model <> 'NFE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: fase F3 cobre apenas NF-e modelo 55.';
  END IF;
  IF inv.tax_snapshot IS NOT NULL AND inv.tax_snapshot ? 'engineVersion' THEN
    RAISE EXCEPTION 'FISCAL_SNAPSHOT_IMMUTABLE: documento ja possui snapshot tributario; historico nao recalcula.';
  END IF;

  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %', (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'reasons';
  END IF;

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF emit.nfe_readiness_status NOT IN ('READY_HOMOLOGATION','READY_PRODUCTION') THEN
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

    base := public.fn_fiscal_round(coalesce(it.gross_value, it.quantity * it.unit_value)
            - coalesce(it.discount_value,0) + coalesce(it.freight_value,0)
            + coalesce(it.insurance_value,0) + coalesce(it.other_value,0));
    IF base < 0 THEN
      RAISE EXCEPTION 'FISCAL_ITEM_BASE_NEGATIVE: item % com base negativa apos descontos.', it.item_sequence;
    END IF;

    pol := public.fn_fiscal_resolve_operation(
      coalesce(inv.direction,'OUT'), emit.state, coalesce(dest.fiscal_state, emit.state), emit.crt,
      dest.final_consumer, dest.taxpayer_indicator, it.ncm_snapshot, null, inv.sales_channel, ref_date);

    kinds := ARRAY['ICMS','PIS','COFINS'];
    IF coalesce(emit.ipi_taxpayer,false) THEN kinds := kinds || 'IPI'::text; END IF;
    IF coalesce(emit.icms_st_responsible,false) THEN kinds := kinds || 'ICMS_ST'::text; END IF;
    IF coalesce(emit.fcp_applicable,false) THEN kinds := kinds || 'FCP'::text; END IF;
    IF coalesce(emit.difal_responsible,false)
       AND upper(coalesce(dest.fiscal_state,'')) <> upper(coalesce(emit.state,''))
       AND coalesce(dest.final_consumer,true) THEN
      kinds := kinds || 'DIFAL'::text;
    END IF;
    IF coalesce(emit.rtc_scaffolding_enabled,false) THEN kinds := kinds || ARRAY['IBS','CBS']; END IF;

    item_taxes := '{}'::jsonb;
    FOREACH k IN ARRAY kinds LOOP
      rule := public.fn_fiscal_resolve_tax_rule(k, emit.crt, emit.state, coalesce(dest.fiscal_state, emit.state),
                                                it.ncm_snapshot, null, dest.final_consumer, dest.taxpayer_indicator, ref_date);
      item_taxes := item_taxes || jsonb_build_object(k, public.fn_fiscal_apply_tax(rule, base));
    END LOOP;

    t_prod   := t_prod + public.fn_fiscal_round(coalesce(it.gross_value, it.quantity * it.unit_value));
    t_desc   := t_desc + public.fn_fiscal_round(coalesce(it.discount_value,0));
    t_frete  := t_frete + public.fn_fiscal_round(coalesce(it.freight_value,0));
    t_seg    := t_seg + public.fn_fiscal_round(coalesce(it.insurance_value,0));
    t_outros := t_outros + public.fn_fiscal_round(coalesce(it.other_value,0));
    t_icms   := t_icms   + coalesce((item_taxes->'ICMS'->>'value')::numeric,0);
    t_st     := t_st     + coalesce((item_taxes->'ICMS_ST'->>'value')::numeric,0);
    t_fcp    := t_fcp    + coalesce((item_taxes->'FCP'->>'value')::numeric,0);
    t_difal  := t_difal  + coalesce((item_taxes->'DIFAL'->>'value')::numeric,0);
    t_pis    := t_pis    + coalesce((item_taxes->'PIS'->>'value')::numeric,0);
    t_cofins := t_cofins + coalesce((item_taxes->'COFINS'->>'value')::numeric,0);
    t_ipi    := t_ipi    + coalesce((item_taxes->'IPI'->>'value')::numeric,0);

    item_snapshot := jsonb_build_object(
      'engineVersion','F3.1',
      'calculatedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
      'ncm', it.ncm_snapshot,
      'cfop', pol.cfop,
      'natureOperation', pol.nature_operation,
      'operationPolicyId', pol.id,
      'operationLegalBasis', pol.legal_basis,
      'operationSourceId', pol.source_id,
      'base', base,
      'taxes', item_taxes);

    UPDATE public.fiscal_invoice_items
       SET tax_snapshot = item_snapshot,
           cfop_snapshot = pol.cfop,
           cst_icms_snapshot = item_taxes->'ICMS'->>'cst',
           csosn_snapshot = item_taxes->'ICMS'->>'csosn',
           net_value = base,
           updated_at = now()
     WHERE id = it.id;
  END LOOP;

  IF n_items = 0 THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NO_ITEMS: documento sem itens.';
  END IF;

  t_nf := public.fn_fiscal_round(t_prod - t_desc + t_frete + t_seg + t_outros + t_st + t_ipi);

  IF inv.total_amount IS NOT NULL AND abs(inv.total_amount - t_nf) > 0.01 THEN
    RAISE EXCEPTION 'FISCAL_TOTAL_MISMATCH: total informado % difere do total calculado %', inv.total_amount, t_nf;
  END IF;

  totals := jsonb_build_object(
    'engineVersion','F3.1',
    'itemCount', n_items,
    'vProd', public.fn_fiscal_round(t_prod), 'vDesc', public.fn_fiscal_round(t_desc),
    'vFrete', public.fn_fiscal_round(t_frete), 'vSeg', public.fn_fiscal_round(t_seg),
    'vOutro', public.fn_fiscal_round(t_outros),
    'vICMS', public.fn_fiscal_round(t_icms), 'vST', public.fn_fiscal_round(t_st),
    'vFCP', public.fn_fiscal_round(t_fcp), 'vDIFAL', public.fn_fiscal_round(t_difal),
    'vPIS', public.fn_fiscal_round(t_pis), 'vCOFINS', public.fn_fiscal_round(t_cofins),
    'vIPI', public.fn_fiscal_round(t_ipi), 'vNF', t_nf);

  UPDATE public.fiscal_invoices
     SET tax_snapshot = totals,
         fiscal_totals_snapshot = totals,
         total_amount = t_nf,
         company_snapshot = jsonb_build_object(
           'cnpj', emit.cnpj, 'legalName', emit.legal_name, 'crt', emit.crt,
           'ie', emit.state_registration, 'uf', emit.state,
           'municipalityIbge', emit.municipality_ibge_code,
           'series', emit.nfe_series_number, 'environment', emit.nfe_environment_code),
         customer_snapshot = jsonb_build_object(
           'document', dest.cpf_cnpj, 'legalName', dest.legal_name,
           'indIEDest', dest.taxpayer_indicator, 'uf', dest.fiscal_state,
           'municipalityIbge', dest.fiscal_municipality_ibge_code,
           'finalConsumer', dest.final_consumer, 'icmsTaxpayer', dest.icms_taxpayer),
         updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.fiscal_calculation_runs (fiscal_invoice_id, idempotency_key, result, created_by)
  VALUES (p_invoice_id, p_idempotency_key, totals, auth.uid());

  RETURN totals || jsonb_build_object('idempotentReplay', false);
END $$;

-- ---------------------------------------------------------------------
-- CORREÇÃO 4: rpc_fiscal_reserve_nfe_number_v1 — pgcrypto qualificado.
-- Motivo: gen_random_bytes vive no schema `extensions`, fora do
-- search_path fixado da função, abortando a reserva de numeração.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_reserve_nfe_number_v1(
  p_invoice_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  s public.fiscal_document_series%ROWTYPE;
  existing public.fiscal_number_reservations%ROWTYPE;
  n int; cnf text; key43 text; dv int; full_key text; cuf text;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() AND NOT public.has_role(auth.uid(),'financeiro'::app_role) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para reservar numeracao.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;

  SELECT * INTO existing FROM public.fiscal_number_reservations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('reservationId', existing.id, 'number', existing.number,
      'accessKey', existing.access_key, 'status', existing.status, 'idempotentReplay', true);
  END IF;

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;
  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: reserva permitida apenas em rascunho (status=%)', inv.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fiscal_number_reservations r
             WHERE r.fiscal_invoice_id = p_invoice_id AND r.status = 'RESERVED') THEN
    RAISE EXCEPTION 'FISCAL_NUMBER_ALREADY_RESERVED: documento ja possui reserva ativa.';
  END IF;
  IF inv.tax_snapshot IS NULL OR NOT (inv.tax_snapshot ? 'engineVersion') THEN
    RAISE EXCEPTION 'FISCAL_CALCULATION_REQUIRED: calcule os tributos antes de reservar numeracao.';
  END IF;

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF emit.nfe_readiness_status NOT IN ('READY_HOMOLOGATION','READY_PRODUCTION') THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_READY: emitente com pendencias %', emit.nfe_readiness_pendencies;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('fiscal_series:' || emit.id::text || ':' ||
          coalesce(emit.nfe_series_number,0)::text || ':' || coalesce(emit.nfe_environment_code,'2')));

  SELECT * INTO s FROM public.fiscal_document_series
   WHERE company_id = emit.id AND document_model = '55'
     AND series = emit.nfe_series_number AND environment_code = emit.nfe_environment_code
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.fiscal_document_series (company_id, series, environment_code, created_by)
    VALUES (emit.id, emit.nfe_series_number, emit.nfe_environment_code, auth.uid())
    RETURNING * INTO s;
  END IF;
  IF s.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FISCAL_SERIES_BLOCKED: serie % bloqueada.', s.series;
  END IF;

  n := s.current_number + 1;
  IF n > 999999999 THEN RAISE EXCEPTION 'FISCAL_SERIES_EXHAUSTED: serie % esgotada.', s.series; END IF;

  cnf := lpad(((get_byte(extensions.gen_random_bytes(4),0)::bigint << 24)
             | (get_byte(extensions.gen_random_bytes(4),0)::bigint << 16)
             | (get_byte(extensions.gen_random_bytes(4),0)::bigint << 8)
             | get_byte(extensions.gen_random_bytes(4),0)::bigint) % 100000000, 8, '0');

  cuf := public.fn_fiscal_uf_ibge_code(emit.state);
  key43 := cuf
        || to_char(coalesce(inv.issue_date, current_date), 'YYMM')
        || public.fn_fiscal_digits(emit.cnpj)
        || '55'
        || lpad(s.series::text, 3, '0')
        || lpad(n::text, 9, '0')
        || '1'
        || cnf;
  dv := public.fn_fiscal_access_key_dv(key43);
  full_key := key43 || dv::text;

  UPDATE public.fiscal_document_series SET current_number = n, updated_at = now() WHERE id = s.id;

  INSERT INTO public.fiscal_number_reservations
    (series_id, number, cnf, access_key, check_digit, status, fiscal_invoice_id, idempotency_key, reserved_by)
  VALUES (s.id, n, cnf, full_key, dv, 'RESERVED', p_invoice_id, p_idempotency_key, auth.uid());

  UPDATE public.fiscal_invoices
     SET series = s.series::text, invoice_number = n::text, access_key = full_key, updated_at = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('number', n, 'series', s.series, 'accessKey', full_key,
                            'checkDigit', dv, 'status','RESERVED', 'idempotentReplay', false);
END $$;
