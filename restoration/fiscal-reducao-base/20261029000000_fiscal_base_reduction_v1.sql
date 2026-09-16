-- ============================================================================
-- Fiscal — Reducao da base de calculo por tributo (Fases 1 e 2)
-- Projeto canonico: swzpzcwiasxmjutrmvkm
-- Incremental, idempotente e reversivel. Nao remove dados nem altera snapshots
-- historicos. Rollback documentado em README.md desta pasta.
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------- FASE 1 ---
ALTER TABLE public.fiscal_tax_rules
  ADD COLUMN IF NOT EXISTS base_reduction_mode text NOT NULL DEFAULT 'NONE';

UPDATE public.fiscal_tax_rules
   SET base_reduction_mode = 'FIXED'
 WHERE base_reduction_mode = 'NONE'
   AND coalesce(base_reduction_pct,0) > 0;

ALTER TABLE public.fiscal_tax_rules DROP CONSTRAINT IF EXISTS ftr_base_reduction_mode_domain;
ALTER TABLE public.fiscal_tax_rules
  ADD CONSTRAINT ftr_base_reduction_mode_domain
  CHECK (base_reduction_mode IN ('NONE','FIXED','MANUAL'));

ALTER TABLE public.fiscal_tax_rules DROP CONSTRAINT IF EXISTS ftr_base_reduction_mode_coherent;
ALTER TABLE public.fiscal_tax_rules
  ADD CONSTRAINT ftr_base_reduction_mode_coherent
  CHECK (
    (base_reduction_mode = 'NONE'  AND coalesce(base_reduction_pct,0) = 0)
    OR (base_reduction_mode = 'FIXED'  AND base_reduction_pct IS NOT NULL AND base_reduction_pct > 0)
    OR (base_reduction_mode = 'MANUAL' AND base_reduction_pct IS NULL)
  );

COMMENT ON COLUMN public.fiscal_tax_rules.base_reduction_mode IS
  'NONE = sem reducao; FIXED = percentual da regra (somente leitura); MANUAL = percentual informado na preparacao, validado no servidor.';

-- Validador do snapshot de ENTRADAS do operador. Aceita apenas objeto com
-- chaves de tributo conhecidas e, dentro delas, somente baseReductionPct
-- numerico entre 0 e 100. Qualquer resultado calculado e rejeitado.
CREATE OR REPLACE FUNCTION public.fn_fiscal_tax_input_valid(_input jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  k text; v jsonb; ik text; pct numeric;
  allowed_kinds text[] := ARRAY['ICMS','ICMS_ST','FCP','FCP_ST','DIFAL','PIS','COFINS','IPI'];
BEGIN
  IF _input IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(_input) <> 'object' THEN RETURN false; END IF;

  FOR k, v IN SELECT * FROM jsonb_each(_input) LOOP
    IF NOT (k = ANY(allowed_kinds)) THEN RETURN false; END IF;
    IF jsonb_typeof(v) <> 'object' THEN RETURN false; END IF;
    FOR ik IN SELECT jsonb_object_keys(v) LOOP
      IF ik <> 'baseReductionPct' THEN RETURN false; END IF;
    END LOOP;
    IF NOT (v ? 'baseReductionPct') THEN RETURN false; END IF;
    IF jsonb_typeof(v->'baseReductionPct') <> 'number' THEN RETURN false; END IF;
    pct := (v->>'baseReductionPct')::numeric;
    IF pct < 0 OR pct > 100 THEN RETURN false; END IF;
  END LOOP;

  RETURN true;
END $fn$;

REVOKE ALL ON FUNCTION public.fn_fiscal_tax_input_valid(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_tax_input_valid(jsonb) TO authenticated, service_role;

ALTER TABLE public.fiscal_invoice_items
  ADD COLUMN IF NOT EXISTS tax_input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.fiscal_invoice_items DROP CONSTRAINT IF EXISTS fii_tax_input_snapshot_chk;
ALTER TABLE public.fiscal_invoice_items
  ADD CONSTRAINT fii_tax_input_snapshot_chk
  CHECK (public.fn_fiscal_tax_input_valid(tax_input_snapshot));

COMMENT ON COLUMN public.fiscal_invoice_items.tax_input_snapshot IS
  'Somente ENTRADAS do operador (ex.: {"ICMS":{"baseReductionPct":60}}). Nunca armazena base, aliquota ou valor calculado.';

-- ---------------------------------------------------------------- FASE 2 ---
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
  v_manual_by text; v_manual_at text;
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

  IF v_mode = 'MANUAL' THEN
    IF v_manual IS NULL THEN
      RAISE EXCEPTION 'FISCAL_BASE_REDUCTION_INPUT_REQUIRED: tributo % exige percentual de reducao informado na preparacao.', r.tax_kind;
    END IF;
    IF v_manual < 0 OR v_manual > 100 THEN
      RAISE EXCEPTION 'FISCAL_BASE_REDUCTION_OUT_OF_RANGE: percentual de reducao % invalido para %; use 0 a 100.', v_manual, r.tax_kind;
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

  ELSIF r.tax_kind IN ('ICMS','PIS','COFINS','IPI') THEN
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
    'baseComponents', r.base_components,
    'baseOriginal', base_raw, 'base', base_eff, 'value', val,
    'params', extra);
END $function$;

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

      -- Entrada do operador: SOMENTE quando a regra publicada admite modo MANUAL.
      IF coalesce(rule.base_reduction_mode,'NONE') = 'MANUAL' THEN
        ctx := ctx || jsonb_build_object(
          'manualBaseReductionPct',
            coalesce(it.tax_input_snapshot, '{}'::jsonb)->k->>'baseReductionPct',
          'manualBy', auth.uid()::text,
          'manualAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'));
      END IF;

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

  t_nf := public.fn_fiscal_round(t_prod - t_desc + t_frete + t_seg + t_outros + t_st + t_fcpst + t_ipi);

  IF inv.total_amount IS NOT NULL AND abs(inv.total_amount - t_nf) > 0.01 THEN
    RAISE EXCEPTION 'FISCAL_TOTAL_MISMATCH: total informado % difere do total calculado %', inv.total_amount, t_nf;
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
  VALUES (p_invoice_id, p_idempotency_key, 'F3.4', totals, auth.uid());

  RETURN totals || jsonb_build_object('idempotentReplay', false);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_draft_save(p_invoice_id uuid, p_invoice jsonb, p_items jsonb, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user           uuid := auth.uid();
  v_row            public.fiscal_invoices;
  v_new_id         uuid;
  v_total          numeric(14,2) := 0;
  v_item           jsonb;
  v_seq            integer := 0;
  v_env            text;
  v_invoice_type   text;
  v_customer_id    uuid;
  v_qty            numeric;
  v_unit           numeric;
  v_gross          numeric;
  v_disc           numeric;
  v_net            numeric;
  v_kind           text;
  v_items_count    integer;
  v_computed_items jsonb := '[]'::jsonb;
  v_profile_snap   jsonb;
  v_tax_snap       jsonb;
  FORBIDDEN_KEYS   text[] := ARRAY[
    'sefaz_key','access_key','protocol_number','authorization_number',
    'authorized_at','authorization_xml','xml','pdf','signed_xml',
    'cancel_protocol','provider_response'
  ];
  k text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_user, 'administrador'::app_role)
          OR public.has_role(v_user, 'financeiro'::app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object' THEN
    RAISE EXCEPTION 'invoice_object_required' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items_array_required' USING ERRCODE = '22023';
  END IF;

  IF public.fiscal_json_has_sensitive_key(p_invoice)
     OR public.fiscal_json_has_sensitive_key(p_items) THEN
    RAISE EXCEPTION 'sensitive_key_in_payload' USING ERRCODE = '22023';
  END IF;

  FOREACH k IN ARRAY FORBIDDEN_KEYS LOOP
    IF p_invoice ? k THEN
      RAISE EXCEPTION 'emission_field_forbidden' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_items_count := jsonb_array_length(p_items);
  IF v_items_count < 1 OR v_items_count > 500 THEN
    RAISE EXCEPTION 'items_count_out_of_range' USING ERRCODE = '22023';
  END IF;

  v_invoice_type := COALESCE(p_invoice->>'invoice_type','');
  IF v_invoice_type NOT IN ('NFE','NFSE') THEN
    RAISE EXCEPTION 'invoice_type_invalid' USING ERRCODE = '22023';
  END IF;

  v_env := COALESCE(p_invoice->>'environment','NOT_CONFIGURED');
  IF v_env NOT IN ('HOMOLOGATION','NOT_CONFIGURED') THEN
    RAISE EXCEPTION 'environment_not_allowed' USING ERRCODE = '22023';
  END IF;

  v_customer_id := NULLIF(p_invoice->>'customer_id','')::uuid;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = v_customer_id) THEN
    RAISE EXCEPTION 'customer_not_found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_seq  := v_seq + 1;
    v_kind := COALESCE(v_item->>'item_kind','');
    IF v_invoice_type = 'NFE'  AND v_kind <> 'PRODUCT' THEN
      RAISE EXCEPTION 'nfe_requires_product_items' USING ERRCODE = '22023';
    END IF;
    IF v_invoice_type = 'NFSE' AND v_kind <> 'SERVICE' THEN
      RAISE EXCEPTION 'nfse_requires_service_items' USING ERRCODE = '22023';
    END IF;

    v_qty  := COALESCE(NULLIF(v_item->>'quantity','')::numeric, 0);
    v_unit := COALESCE(NULLIF(v_item->>'unit_value','')::numeric, 0);
    v_disc := COALESCE(NULLIF(v_item->>'discount_value','')::numeric, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'item_quantity_must_be_positive' USING ERRCODE = '22023';
    END IF;
    IF v_unit < 0 THEN
      RAISE EXCEPTION 'item_unit_value_negative' USING ERRCODE = '22023';
    END IF;
    IF v_disc < 0 THEN
      RAISE EXCEPTION 'item_discount_negative' USING ERRCODE = '22023';
    END IF;

    v_gross := round(v_qty * v_unit, 2);
    IF v_disc > v_gross THEN
      RAISE EXCEPTION 'item_discount_gt_gross' USING ERRCODE = '22023';
    END IF;
    v_net  := round(v_gross - v_disc, 2);

    -- 3.16.2-C: whitelist FAIL-CLOSED por item + verificação de source_item_id
    DECLARE
      v_item_profile jsonb := COALESCE(v_item->'fiscal_profile_snapshot', '{}'::jsonb);
      v_item_tax     jsonb := COALESCE(v_item->'tax_snapshot', '{}'::jsonb);
      v_item_input   jsonb := COALESCE(v_item->'tax_input_snapshot', '{}'::jsonb);
      v_source_id    uuid  := NULLIF(v_item->>'source_item_id','')::uuid;
      v_icms_obj     jsonb;
      v_pis_obj      jsonb;
      v_cofins_obj   jsonb;
      v_ipi_obj      jsonb;
      v_rate         numeric;
      v_withheld     jsonb;
      v_rets         jsonb;
    BEGIN
      IF jsonb_typeof(v_item_profile) <> 'object' THEN v_item_profile := '{}'::jsonb; END IF;
      IF jsonb_typeof(v_item_tax)     <> 'object' THEN v_item_tax     := '{}'::jsonb; END IF;
      IF jsonb_typeof(v_item_input)   <> 'object' THEN v_item_input   := '{}'::jsonb; END IF;
      IF NOT public.fn_fiscal_tax_input_valid(v_item_input) THEN
        RAISE EXCEPTION 'tax_input_snapshot_invalid:%', v_seq USING ERRCODE = '22023';
      END IF;
      IF public.fiscal_json_has_sensitive_key(v_item_profile)
         OR public.fiscal_json_has_sensitive_key(v_item_tax) THEN
        RAISE EXCEPTION 'sensitive_key_in_snapshot' USING ERRCODE = '22023';
      END IF;

      IF v_invoice_type = 'NFE' THEN
        -- Whitelist do perfil NF-e
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_profile,
          ARRAY['ncm','cest','cfop','origem_mercadoria','cst_icms','csosn','unidade'],
          'nfe_profile'
        );
        -- Whitelist da tributação NF-e (somente configuração preparatória)
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_tax, ARRAY['pis','cofins','ipi','icms'], 'nfe_tax'
        );
        v_icms_obj   := v_item_tax->'icms';
        v_pis_obj    := v_item_tax->'pis';
        v_cofins_obj := v_item_tax->'cofins';
        v_ipi_obj    := v_item_tax->'ipi';
        IF v_icms_obj IS NOT NULL THEN
          IF jsonb_typeof(v_icms_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_icms_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(
            v_icms_obj, ARRAY['cst','csosn','aliquota','base_calculo_modalidade'], 'nfe_tax.icms'
          );
        END IF;
        IF v_pis_obj IS NOT NULL THEN
          IF jsonb_typeof(v_pis_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_pis_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_pis_obj, ARRAY['cst','aliquota'], 'nfe_tax.pis');
        END IF;
        IF v_cofins_obj IS NOT NULL THEN
          IF jsonb_typeof(v_cofins_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_cofins_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_cofins_obj, ARRAY['cst','aliquota'], 'nfe_tax.cofins');
        END IF;
        IF v_ipi_obj IS NOT NULL THEN
          IF jsonb_typeof(v_ipi_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_ipi_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_ipi_obj, ARRAY['cst','aliquota'], 'nfe_tax.ipi');
        END IF;

        -- Verificação de existência do source_item_id (produto + perfil)
        IF v_source_id IS NOT NULL THEN
          IF NOT EXISTS (SELECT 1 FROM public.produtos pr WHERE pr.id = v_source_id) THEN
            RAISE EXCEPTION 'source_item_product_not_found:%', v_seq USING ERRCODE = 'P0002';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM public.product_fiscal_profiles pfp
            WHERE pfp.product_id = v_source_id AND pfp.is_active = true
          ) THEN
            RAISE EXCEPTION 'source_item_product_profile_missing:%', v_seq USING ERRCODE = 'P0002';
          END IF;
        END IF;
      ELSE
        -- NFS-e
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_profile,
          ARRAY['lc116_item','cnae','municipal_tax_code','national_tax_code','municipality_ibge_code'],
          'nfse_profile'
        );
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_tax, ARRAY['iss_rate','iss_withheld','retencoes_suportadas'], 'nfse_tax'
        );
        IF v_item_tax ? 'iss_rate' THEN
          IF jsonb_typeof(v_item_tax->'iss_rate') <> 'number' THEN
            RAISE EXCEPTION 'nfse_iss_rate_not_number' USING ERRCODE = '22023';
          END IF;
          v_rate := (v_item_tax->>'iss_rate')::numeric;
          IF v_rate < 0 OR v_rate > 100 THEN
            RAISE EXCEPTION 'nfse_iss_rate_out_of_range' USING ERRCODE = '22023';
          END IF;
        END IF;
        v_withheld := v_item_tax->'iss_withheld';
        IF v_withheld IS NOT NULL AND jsonb_typeof(v_withheld) <> 'boolean' THEN
          RAISE EXCEPTION 'nfse_iss_withheld_not_boolean' USING ERRCODE = '22023';
        END IF;
        v_rets := v_item_tax->'retencoes_suportadas';
        IF v_rets IS NOT NULL THEN
          IF jsonb_typeof(v_rets) <> 'object' THEN
            RAISE EXCEPTION 'nfse_retencoes_not_object' USING ERRCODE = '22023';
          END IF;
          PERFORM public.fiscal_validate_snapshot_keys(
            v_rets, ARRAY['pis','cofins','csll','irrf','inss'], 'nfse_tax.retencoes_suportadas'
          );
        END IF;

        IF v_source_id IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.service_fiscal_profiles sfp
            WHERE sfp.service_id = v_source_id AND sfp.is_active = true
          ) THEN
            RAISE EXCEPTION 'source_item_service_profile_missing:%', v_seq USING ERRCODE = 'P0002';
          END IF;
        END IF;
      END IF;

      v_computed_items := v_computed_items || jsonb_build_object(
        'seq', v_seq,
        'item_kind', v_kind,
        'description', COALESCE(v_item->>'description',''),
        'quantity', v_qty,
        'commercial_unit', v_item->>'commercial_unit',
        'unit_value', v_unit,
        'gross_value', v_gross,
        'discount_value', v_disc,
        'net_value', v_net,
        'source_item_type', v_item->>'source_item_type',
        'source_item_id',   NULLIF(v_item->>'source_item_id','')::uuid,
        'fiscal_profile_snapshot', v_item_profile,
        'tax_snapshot',            v_item_tax,
        'tax_input_snapshot',      v_item_input
      );
    END;
    v_total := v_total + v_net;
  END LOOP;

  v_profile_snap := COALESCE(p_invoice->'fiscal_profile_snapshot', '{}'::jsonb);
  v_tax_snap     := COALESCE(p_invoice->'tax_snapshot', '{}'::jsonb);
  IF jsonb_typeof(v_profile_snap) <> 'object' THEN v_profile_snap := '{}'::jsonb; END IF;
  IF jsonb_typeof(v_tax_snap)     <> 'object' THEN v_tax_snap     := '{}'::jsonb; END IF;
  IF public.fiscal_json_has_sensitive_key(v_profile_snap)
     OR public.fiscal_json_has_sensitive_key(v_tax_snap) THEN
    RAISE EXCEPTION 'sensitive_key_in_snapshot' USING ERRCODE = '22023';
  END IF;

  IF p_invoice_id IS NULL THEN
    INSERT INTO public.fiscal_invoices (
      invoice_type, document_model, document_origin, environment, provider,
      status, normalized_status, series, issue_date, notes,
      company_cnpj, customer_id, receivable_id, delivery_id,
      customer_snapshot, company_snapshot, fiscal_totals_snapshot,
      fiscal_profile_snapshot, tax_snapshot,
      draft_version, created_by, total_amount
    ) VALUES (
      v_invoice_type,
      p_invoice->>'document_model',
      'MANUAL_RECORD',
      v_env,
      'NONE',
      'DRAFT',
      'DRAFT',
      p_invoice->>'series',
      NULLIF(p_invoice->>'issue_date','')::date,
      p_invoice->>'notes',
      p_invoice->>'company_cnpj',
      v_customer_id,
      NULLIF(p_invoice->>'receivable_id','')::uuid,
      NULLIF(p_invoice->>'delivery_id','')::uuid,
      COALESCE(p_invoice->'customer_snapshot','{}'::jsonb),
      COALESCE(p_invoice->'company_snapshot','{}'::jsonb),
      jsonb_build_object('total_net', v_total, 'computed_at', now()),
      v_profile_snap,
      v_tax_snap,
      1,
      v_user,
      v_total
    ) RETURNING id INTO v_new_id;
  ELSE
    SELECT * INTO v_row FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;
    IF v_row.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'invoice_locked' USING ERRCODE = '55006';
    END IF;
    IF v_row.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'invoice_not_editable' USING ERRCODE = '22023';
    END IF;
    IF v_row.provider <> 'NONE' THEN
      RAISE EXCEPTION 'invoice_has_provider' USING ERRCODE = '22023';
    END IF;
    IF v_row.document_origin <> 'MANUAL_RECORD' THEN
      RAISE EXCEPTION 'invoice_origin_forbidden' USING ERRCODE = '22023';
    END IF;
    IF v_row.draft_version <> p_expected_version THEN
      RAISE EXCEPTION 'conflict' USING ERRCODE = '40001';
    END IF;

    UPDATE public.fiscal_invoices SET
      invoice_type      = v_invoice_type,
      document_model    = COALESCE(p_invoice->>'document_model', document_model),
      document_origin   = 'MANUAL_RECORD',
      environment       = v_env,
      provider          = 'NONE',
      status            = 'DRAFT',
      normalized_status = 'DRAFT',
      series            = COALESCE(p_invoice->>'series', series),
      issue_date        = COALESCE(NULLIF(p_invoice->>'issue_date','')::date, issue_date),
      notes             = COALESCE(p_invoice->>'notes', notes),
      customer_id       = v_customer_id,
      customer_snapshot = COALESCE(p_invoice->'customer_snapshot', customer_snapshot),
      fiscal_profile_snapshot = v_profile_snap,
      tax_snapshot            = v_tax_snap,
      fiscal_totals_snapshot  = jsonb_build_object('total_net', v_total, 'computed_at', now()),
      total_amount            = v_total,
      draft_version           = draft_version + 1,
      updated_at              = now()
    WHERE id = p_invoice_id;
    v_new_id := p_invoice_id;
  END IF;

  DELETE FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = v_new_id;

  INSERT INTO public.fiscal_invoice_items (
    fiscal_invoice_id, item_sequence, item_kind, description,
    quantity, commercial_unit, unit_value, gross_value, discount_value, net_value,
    source_item_type, source_item_id,
    fiscal_profile_snapshot, tax_snapshot, tax_input_snapshot
  )
  SELECT
    v_new_id,
    (it->>'seq')::integer,
    it->>'item_kind',
    it->>'description',
    (it->>'quantity')::numeric,
    it->>'commercial_unit',
    (it->>'unit_value')::numeric,
    (it->>'gross_value')::numeric,
    (it->>'discount_value')::numeric,
    (it->>'net_value')::numeric,
    it->>'source_item_type',
    NULLIF(it->>'source_item_id','')::uuid,
    COALESCE(it->'fiscal_profile_snapshot','{}'::jsonb),
    COALESCE(it->'tax_snapshot','{}'::jsonb),
    COALESCE(it->'tax_input_snapshot','{}'::jsonb)
  FROM jsonb_array_elements(v_computed_items) AS it;

  SELECT * INTO v_row FROM public.fiscal_invoices WHERE id = v_new_id;
  RETURN jsonb_build_object(
    'id',            v_row.id,
    'draft_version', v_row.draft_version,
    'total_amount',  v_row.total_amount
  );
END;
$function$;

-- Preview server-side: mesmo motor canonico, sem qualquer escrita.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_tax_preview_v1(p_invoice_id uuid, p_items jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  it record; ov jsonb; rule public.fiscal_tax_rules%ROWTYPE;
  ctx jsonb; res jsonb; item_taxes jsonb; out_items jsonb := '[]'::jsonb;
  ref_date date; kinds text[]; k text;
  v_prod numeric; v_icms_own numeric; v_ipi numeric; v_base_st numeric; v_st_val numeric;
  v_inputs jsonb; v_manual text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para simular tributos.' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items_array_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;
  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: preview disponivel apenas em rascunho (status=%)', inv.status;
  END IF;

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao bloqueado.';
  END IF;

  SELECT * INTO dest FROM public.customer_fiscal_profiles WHERE customer_id = inv.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECIPIENT_PROFILE_MISSING: perfil fiscal do destinatario nao cadastrado.'; END IF;

  ref_date := coalesce(inv.issue_date, current_date);

  FOR it IN SELECT * FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id ORDER BY item_sequence
  LOOP
    SELECT e INTO ov FROM jsonb_array_elements(p_items) e
     WHERE (e->>'item_sequence')::int = it.item_sequence LIMIT 1;

    v_inputs := coalesce(ov->'tax_input_snapshot', it.tax_input_snapshot, '{}'::jsonb);
    IF NOT public.fn_fiscal_tax_input_valid(v_inputs) THEN
      RAISE EXCEPTION 'tax_input_snapshot_invalid:%', it.item_sequence USING ERRCODE = '22023';
    END IF;

    v_prod := public.fn_fiscal_round(coalesce(
      nullif(ov->>'gross_value','')::numeric,
      it.gross_value, it.quantity * it.unit_value));

    kinds := ARRAY['ICMS']::text[];
    IF coalesce(emit.ipi_taxpayer,false) THEN kinds := array_append(kinds,'IPI'); END IF;
    kinds := kinds || ARRAY['PIS','COFINS']::text[];

    item_taxes := '{}'::jsonb;
    v_icms_own := 0; v_ipi := 0; v_base_st := NULL; v_st_val := 0;

    FOREACH k IN ARRAY kinds LOOP
      ctx := jsonb_build_object(
        'produto', v_prod,
        'frete',    public.fn_fiscal_round(coalesce(nullif(ov->>'freight_value','')::numeric,   it.freight_value, 0)),
        'seguro',   public.fn_fiscal_round(coalesce(nullif(ov->>'insurance_value','')::numeric, it.insurance_value, 0)),
        'outras',   public.fn_fiscal_round(coalesce(nullif(ov->>'other_value','')::numeric,     it.other_value, 0)),
        'desconto', public.fn_fiscal_round(coalesce(nullif(ov->>'discount_value','')::numeric,  it.discount_value, 0)),
        'ipi', v_ipi, 'icmsSt', v_st_val, 'icmsOwnValue', v_icms_own, 'baseST', v_base_st);

      rule := public.fn_fiscal_resolve_tax_rule(k, emit.crt, emit.state,
        coalesce(dest.fiscal_state, emit.state), it.ncm_snapshot, null,
        dest.final_consumer, dest.taxpayer_indicator, ref_date);

      IF coalesce(rule.base_reduction_mode,'NONE') = 'MANUAL' THEN
        v_manual := v_inputs->k->>'baseReductionPct';
        ctx := ctx || jsonb_build_object(
          'manualBaseReductionPct', v_manual,
          'manualBy', auth.uid()::text,
          'manualAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'));
      END IF;

      res := public.fn_fiscal_apply_tax_v2(rule, ctx);
      item_taxes := item_taxes || jsonb_build_object(k, res);

      IF k = 'ICMS' THEN v_icms_own := (res->>'value')::numeric; END IF;
      IF k = 'IPI'  THEN v_ipi := (res->>'value')::numeric; END IF;
    END LOOP;

    out_items := out_items || jsonb_build_object(
      'itemSequence', it.item_sequence,
      'description', it.description,
      'taxes', item_taxes);
  END LOOP;

  RETURN jsonb_build_object(
    'engineVersion','F3.4',
    'preview', true,
    'persisted', false,
    'items', out_items);
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_tax_preview_v1(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_tax_preview_v1(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_tax_preview_v1(uuid, jsonb) TO authenticated;

COMMIT;
