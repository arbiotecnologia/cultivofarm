-- Fase C5 — auditoria da reducao da base sobre o snapshot REAL e motivo
-- obrigatorio na reducao MANUAL.
--
-- 1) fn_fiscal_audit_base_reduction passa a ler tax_snapshot->'taxes' como
--    objeto indexado por taxKind (formato realmente produzido pelo motor).
-- 2) fn_fiscal_apply_tax_v2 exige 'manualReason' quando a regra e MANUAL e
--    registra o motivo no snapshot (fail-closed, sem alterar a formula).
--
-- Incremental e idempotente. Nenhum snapshot historico e recalculado.


-- FASE C5: a funcao lia tax_snapshot->'taxes' como ARRAY, mas o motor canonico
-- grava um OBJETO indexado por taxKind. O formato canonico do snapshot NAO muda;
-- a funcao passa a ler o formato real (e o teste artificial foi substituido).
CREATE OR REPLACE FUNCTION public.fn_fiscal_audit_base_reduction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_actor uuid;
  v_old jsonb := coalesce(CASE WHEN TG_OP = 'UPDATE' THEN OLD.tax_input_snapshot END, '{}'::jsonb);
  v_new jsonb := coalesce(NEW.tax_input_snapshot, '{}'::jsonb);
  v_snap jsonb := coalesce(NEW.tax_snapshot, '{}'::jsonb);
  v_taxes jsonb;
  v_kind text;
  v_oldpct jsonb;
  v_newpct jsonb;
  v_tax jsonb;
BEGIN
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;

  v_taxes := v_snap->'taxes';
  IF v_taxes IS NULL OR jsonb_typeof(v_taxes) <> 'object' THEN
    v_taxes := '{}'::jsonb;
  END IF;

  -- Materializacao do calculo: registra a reducao efetivamente aplicada, com a
  -- regra, a versao e o fundamento legal vindos do snapshot REAL.
  IF TG_OP = 'UPDATE' AND NEW.tax_snapshot IS DISTINCT FROM OLD.tax_snapshot THEN
    FOR v_kind IN SELECT jsonb_object_keys(v_taxes) LOOP
      v_tax := coalesce(v_taxes -> v_kind, '{}'::jsonb);
      CONTINUE WHEN coalesce((v_tax->>'baseReductionPct')::numeric, 0) = 0;
      INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values, new_values)
      VALUES (
        'fiscal_invoice_items', NEW.id, 'BASE_REDUCTION_APPLIED', v_actor,
        jsonb_build_object('taxKind', v_kind,
          'baseReductionPct', (coalesce(OLD.tax_snapshot,'{}'::jsonb)->'taxes'->v_kind->>'baseReductionPct')),
        jsonb_build_object(
          'taxKind', v_kind,
          'baseReductionPct', v_tax->>'baseReductionPct',
          'reason', coalesce(v_tax->>'baseReductionReason', v_new -> v_kind ->> 'baseReductionReason'),
          'fiscalInvoiceId', NEW.fiscal_invoice_id,
          'itemId', NEW.id,
          'changedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
          'appliedBy', v_tax->>'baseReductionAppliedBy',
          'appliedAt', v_tax->>'baseReductionAppliedAt',
          'ruleId', v_tax->>'ruleId',
          'ruleKey', v_tax->>'ruleKey',
          'ruleVersion', v_tax->>'ruleVersion',
          'legalBasis', v_tax->>'legalBasis',
          'legalVersion', v_tax->>'legalVersion',
          'baseReductionMode', v_tax->>'baseReductionMode',
          'baseReductionSource', v_tax->>'baseReductionSource'));
    END LOOP;
  END IF;

  IF v_old = v_new THEN RETURN NEW; END IF;

  FOR v_kind IN
    SELECT DISTINCT k FROM (
      SELECT jsonb_object_keys(v_old) AS k
      UNION SELECT jsonb_object_keys(v_new)
    ) s
  LOOP
    v_oldpct := v_old -> v_kind -> 'baseReductionPct';
    v_newpct := v_new -> v_kind -> 'baseReductionPct';
    CONTINUE WHEN v_oldpct IS NOT DISTINCT FROM v_newpct;

    v_tax := coalesce(v_taxes -> v_kind, '{}'::jsonb);

    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (
      'fiscal_invoice_items', NEW.id, 'BASE_REDUCTION_CHANGE', v_actor,
      jsonb_build_object(
        'taxKind', v_kind,
        'baseReductionPct', v_oldpct,
        'reason', v_old -> v_kind ->> 'baseReductionReason'),
      jsonb_build_object(
        'taxKind', v_kind,
        'baseReductionPct', v_newpct,
        'reason', v_new -> v_kind ->> 'baseReductionReason',
        'fiscalInvoiceId', NEW.fiscal_invoice_id,
        'itemId', NEW.id,
        'changedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
        'ruleId', v_tax->>'ruleId',
        'ruleKey', v_tax->>'ruleKey',
        'ruleVersion', v_tax->>'ruleVersion',
        'legalBasis', v_tax->>'legalBasis',
        'legalVersion', v_tax->>'legalVersion',
        'baseReductionMode', v_tax->>'baseReductionMode'
      )
    );
  END LOOP;

  RETURN NEW;
END $fn$;

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
    'baseReductionReason', CASE WHEN v_src = 'MANUAL' THEN v_manual_reason ELSE NULL END,
    'baseComponents', r.base_components,
    'baseOriginal', base_raw, 'base', base_eff, 'value', val,
    'params', extra);
END $function$;

-- O gatilho passa a observar tambem tax_snapshot, para capturar a reducao
-- efetivamente aplicada pelo motor (com regra, versao e fundamento legal).
DROP TRIGGER IF EXISTS trg_fiscal_audit_base_reduction ON public.fiscal_invoice_items;
CREATE TRIGGER trg_fiscal_audit_base_reduction
AFTER INSERT OR UPDATE OF tax_input_snapshot, tax_snapshot ON public.fiscal_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.fn_fiscal_audit_base_reduction();
