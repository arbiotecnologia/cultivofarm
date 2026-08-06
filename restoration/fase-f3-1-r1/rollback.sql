-- =====================================================================
-- FASE F3.1-R1 — ROLLBACK EXECUTAVEL E DETERMINISTICO
-- Restaura EXATAMENTE as definicoes vigentes antes de 20260819000000
-- (capturadas com pg_get_functiondef no staging ikaauvsflpmamgxmkhoq).
-- Executar com: psql --single-transaction -v ON_ERROR_STOP=1 -f rollback.sql
-- Nao remove dados, snapshots, reservas nem historicos.
-- =====================================================================
\set ON_ERROR_STOP on

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
  t_nf numeric := 0; n_items int := 0; ref_date date; kinds text[]; k text;
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

    pol := public.fn_fiscal_resolve_operation(
      coalesce(inv.direction,'OUT'), emit.state, coalesce(dest.fiscal_state, emit.state), emit.crt,
      dest.final_consumer, dest.taxpayer_indicator, it.ncm_snapshot, null, inv.sales_channel, ref_date);

    -- Ordem canonica: ICMS -> IPI -> ICMS_ST -> FCP/FCP_ST -> DIFAL -> PIS/COFINS.
    kinds := ARRAY['ICMS']::text[];
    IF coalesce(emit.ipi_taxpayer,false) THEN kinds := array_append(kinds,'IPI'); END IF;
    IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'ICMS_ST'); END IF;
    IF coalesce(emit.fcp_applicable,false) THEN
      kinds := array_append(kinds,'FCP');
      IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'FCP_ST'); END IF;
    END IF;
    IF coalesce(emit.difal_responsible,false)
       AND upper(coalesce(dest.fiscal_state,'')) <> upper(coalesce(emit.state,''))
       AND coalesce(dest.final_consumer,true) THEN
      kinds := array_append(kinds,'DIFAL');
    END IF;
    kinds := kinds || ARRAY['PIS','COFINS']::text[];

    item_taxes := '{}'::jsonb;
    v_icms_own := 0; v_ipi := 0; v_base_st := NULL; v_st_val := 0;
    v_fcp_own := 0; v_fcp_st := 0;
    v_difal_dest := 0; v_difal_orig := 0; v_fcp_dest := 0;

    FOREACH k IN ARRAY kinds LOOP
      -- Contexto ENCADEADO: cada etapa enxerga o resultado das anteriores.
      ctx := jsonb_build_object(
        'produto', v_prod,
        'frete', public.fn_fiscal_round(coalesce(it.freight_value,0)),
        'seguro', public.fn_fiscal_round(coalesce(it.insurance_value,0)),
        'outras', public.fn_fiscal_round(coalesce(it.other_value,0)),
        'desconto', public.fn_fiscal_round(coalesce(it.discount_value,0)),
        'ipi', v_ipi,
        'icmsSt', v_st_val,
        'icmsOwnValue', v_icms_own,
        'baseST', v_base_st);

      rule := public.fn_fiscal_resolve_tax_rule(k, emit.crt, emit.state,
        coalesce(dest.fiscal_state, emit.state), it.ncm_snapshot, null,
        dest.final_consumer, dest.taxpayer_indicator, ref_date);
      res := public.fn_fiscal_apply_tax_v2(rule, ctx);
      item_taxes := item_taxes || jsonb_build_object(k, res || jsonb_build_object('contextIn', ctx));

      IF k = 'ICMS'    THEN v_icms_own := (res->>'value')::numeric; END IF;
      IF k = 'IPI'     THEN v_ipi := (res->>'value')::numeric; END IF;
      IF k = 'ICMS_ST' THEN
        v_st_val  := (res->>'value')::numeric;
        v_base_st := (res->'params'->>'baseST')::numeric;
      END IF;
      IF k = 'FCP'     THEN v_fcp_own := (res->>'value')::numeric; END IF;
      IF k = 'FCP_ST'  THEN v_fcp_st := (res->>'value')::numeric; END IF;
      IF k = 'DIFAL'   THEN
        has_difal := true;
        v_difal_dest := coalesce((res->'params'->>'valueDestination')::numeric,0);
        v_difal_orig := coalesce((res->'params'->>'valueOrigin')::numeric,0);
        v_fcp_dest   := coalesce((res->'params'->>'fcpValue')::numeric,0);
      END IF;
    END LOOP;

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
      'engineVersion','F3.3',
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

  t_nf := public.fn_fiscal_round(t_prod - t_desc + t_frete + t_seg + t_outros + t_st + t_fcpst + t_ipi);

  IF inv.total_amount IS NOT NULL AND abs(inv.total_amount - t_nf) > 0.01 THEN
    RAISE EXCEPTION 'FISCAL_TOTAL_MISMATCH: total informado % difere do total calculado %', inv.total_amount, t_nf;
  END IF;

  totals := jsonb_build_object(
    'engineVersion','F3.3', 'roundingMode','HALF_UP_2',
    'itemCount', n_items,
    'vProd', public.fn_fiscal_round(t_prod), 'vDesc', public.fn_fiscal_round(t_desc),
    'vFrete', public.fn_fiscal_round(t_frete), 'vSeg', public.fn_fiscal_round(t_seg),
    'vOutro', public.fn_fiscal_round(t_outros),
    'vICMS', public.fn_fiscal_round(t_icms), 'vST', public.fn_fiscal_round(t_st),
    'vFCP', public.fn_fiscal_round(t_fcp), 'vFCPST', public.fn_fiscal_round(t_fcpst),
    'vDIFAL', public.fn_fiscal_round(t_difal),
    'vPIS', public.fn_fiscal_round(t_pis), 'vCOFINS', public.fn_fiscal_round(t_cofins),
    'vIPI', public.fn_fiscal_round(t_ipi), 'vNF', t_nf,
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
  VALUES (p_invoice_id, p_idempotency_key, 'F3.3', totals, auth.uid());

  RETURN totals || jsonb_build_object('idempotentReplay', false);
END $function$;


CREATE OR REPLACE FUNCTION public.rpc_fiscal_reserve_nfe_number_v1(p_invoice_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  s public.fiscal_document_series%ROWTYPE;
  existing public.fiscal_number_reservations%ROWTYPE;
  n int; cnf text; key43 text; dv int; full_key text; cuf text;
BEGIN
  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para reservar numeracao.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: documento nao informado.';
  END IF;

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;

  IF EXISTS (SELECT 1 FROM public.fiscal_number_reservations r
              WHERE r.idempotency_key = p_idempotency_key
                AND r.fiscal_invoice_id <> p_invoice_id) THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave de idempotencia ja utilizada por outro documento fiscal.'
      USING HINT = 'Gere uma chave exclusiva por documento. Reservas nunca sao compartilhadas entre documentos.';
  END IF;

  SELECT * INTO existing FROM public.fiscal_number_reservations
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('reservationId', existing.id, 'number', existing.number,
      'series', (SELECT series FROM public.fiscal_document_series WHERE id = existing.series_id),
      'accessKey', existing.access_key, 'checkDigit', existing.check_digit,
      'tpEmis', existing.tp_emis, 'status', existing.status, 'idempotentReplay', true);
  END IF;

  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: reserva permitida apenas em rascunho (status=%)', inv.status;
  END IF;
  IF coalesce(inv.tp_emis,1) <> 1 THEN
    RAISE EXCEPTION 'FISCAL_TPEMIS_UNSUPPORTED: apenas emissao normal (tpEmis=1) esta habilitada nesta fase.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fiscal_number_reservations r
             WHERE r.fiscal_invoice_id = p_invoice_id AND r.status = 'RESERVED') THEN
    RAISE EXCEPTION 'FISCAL_NUMBER_ALREADY_RESERVED: documento ja possui reserva ativa.';
  END IF;
  IF inv.tax_snapshot IS NULL OR NOT (inv.tax_snapshot ? 'engineVersion') THEN
    RAISE EXCEPTION 'FISCAL_CALCULATION_REQUIRED: calcule os tributos antes de reservar numeracao.';
  END IF;

  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %',
      (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'reasons';
  END IF;

  -- F3.1: devedor B2B x destinatario reavaliado na reserva.
  PERFORM public.fn_fiscal_assert_debtor_recipient(p_invoice_id);

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao (tpAmb=1) bloqueado na fase F3; teto READY_HOMOLOGATION.';
  END IF;
  IF emit.nfe_readiness_status <> 'READY_HOMOLOGATION' THEN
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
    SELECT * INTO s FROM public.fiscal_document_series WHERE id = s.id FOR UPDATE;
  END IF;
  IF s.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FISCAL_SERIES_BLOCKED: serie % bloqueada.', s.series;
  END IF;

  n := s.current_number + 1;
  IF n > 999999999 THEN RAISE EXCEPTION 'FISCAL_SERIES_EXHAUSTED: serie % esgotada.', s.series; END IF;

  cnf := lpad(((get_byte(extensions.gen_random_bytes(4),0)::bigint << 24
              | get_byte(extensions.gen_random_bytes(4),0)::bigint << 16
              | get_byte(extensions.gen_random_bytes(4),0)::bigint << 8
              | get_byte(extensions.gen_random_bytes(4),0)::bigint) % 100000000)::text, 8, '0');

  cuf := public.fn_fiscal_uf_ibge_code(emit.state);
  key43 := cuf
        || to_char(coalesce(inv.issue_date, current_date), 'YYMM')
        || public.fn_fiscal_digits(emit.cnpj)
        || '55'
        || lpad(s.series::text, 3, '0')
        || lpad(n::text, 9, '0')
        || coalesce(inv.tp_emis,1)::text
        || cnf;
  dv := public.fn_fiscal_access_key_dv(key43);
  full_key := key43 || dv::text;

  UPDATE public.fiscal_document_series SET current_number = n, updated_at = now() WHERE id = s.id;

  INSERT INTO public.fiscal_number_reservations
    (series_id, number, cnf, access_key, check_digit, status, fiscal_invoice_id,
     idempotency_key, reserved_by, tp_emis)
  VALUES (s.id, n, cnf, full_key, dv, 'RESERVED', p_invoice_id,
          p_idempotency_key, auth.uid(), coalesce(inv.tp_emis,1));

  UPDATE public.fiscal_invoices
     SET series = s.series::text, invoice_number = n::text, access_key = full_key, updated_at = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('number', n, 'series', s.series, 'accessKey', full_key,
                            'checkDigit', dv, 'tpEmis', coalesce(inv.tp_emis,1),
                            'status','RESERVED', 'idempotentReplay', false);
END $function$;


DROP FUNCTION IF EXISTS public.fn_fiscal_assert_environment_homologation();

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260819000000';
