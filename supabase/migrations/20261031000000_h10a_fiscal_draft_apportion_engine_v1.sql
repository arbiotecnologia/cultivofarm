-- Fase C2/C3/C4 — fluxo real do rascunho, rateio canonico de encargos e
-- unificacao entre preview e calculo definitivo.
--
-- C2: rpc_fiscal_draft_save materializa server-side ncm/cest/origem/cfop/CST/CSOSN
--     a partir de product_fiscal_profiles (perfil ativo do produto), sem confiar
--     no frontend, e falha fechado quando o NCM nao pode ser resolvido.
-- C3: fn_fiscal_apportion_v1 distribui frete/seguro/outras despesas por item
--     (maior resto, proporcional ao valor bruto) e os valores sao PERSISTIDOS.
-- C4: fn_fiscal_compute_item_taxes_v1 vira o unico motor por item; preview e
--     calculo definitivo chamam a mesma funcao (a unica diferenca e persistir).
--
-- Incremental, idempotente (CREATE OR REPLACE) e reversivel: nenhum dado e
-- apagado, nenhum snapshot historico e recalculado.


-- FASE C3: rateio canonico com maior resto; soma dos itens == total informado.
CREATE OR REPLACE FUNCTION public.fn_fiscal_apportion_v1(p_total numeric, p_weights numeric[])
RETURNS numeric[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  n int := coalesce(array_length(p_weights,1),0);
  total_c bigint;
  sum_w numeric := 0;
  out_c bigint[] := '{}';
  frac numeric[] := '{}';
  i int; assigned bigint := 0; rest bigint; idx int; best int; best_frac numeric;
  used boolean[] := '{}';
  res numeric[] := '{}';
BEGIN
  IF n = 0 THEN RETURN '{}'::numeric[]; END IF;
  IF coalesce(p_total,0) < 0 THEN
    RAISE EXCEPTION 'FISCAL_APPORTION_NEGATIVE_TOTAL' USING ERRCODE = '22023';
  END IF;
  total_c := round(coalesce(p_total,0) * 100)::bigint;
  FOR i IN 1..n LOOP
    IF coalesce(p_weights[i],0) < 0 THEN
      RAISE EXCEPTION 'FISCAL_APPORTION_NEGATIVE_WEIGHT' USING ERRCODE = '22023';
    END IF;
    sum_w := sum_w + coalesce(p_weights[i],0);
  END LOOP;

  IF total_c = 0 THEN
    FOR i IN 1..n LOOP res := res || 0::numeric; END LOOP;
    RETURN res;
  END IF;

  FOR i IN 1..n LOOP
    IF sum_w > 0 THEN
      out_c := out_c || floor(total_c * coalesce(p_weights[i],0) / sum_w)::bigint;
      frac  := frac  || ((total_c * coalesce(p_weights[i],0) / sum_w) - floor(total_c * coalesce(p_weights[i],0) / sum_w));
    ELSE
      out_c := out_c || floor(total_c / n)::bigint;
      frac  := frac  || ((total_c::numeric / n) - floor(total_c::numeric / n));
    END IF;
    used := used || false;
    assigned := assigned + out_c[i];
  END LOOP;

  rest := total_c - assigned;
  WHILE rest > 0 LOOP
    best := NULL; best_frac := -1;
    FOR i IN 1..n LOOP
      IF NOT used[i] AND frac[i] > best_frac THEN best := i; best_frac := frac[i]; END IF;
    END LOOP;
    IF best IS NULL THEN
      FOR i IN 1..n LOOP used[i] := false; END LOOP;
      CONTINUE;
    END IF;
    out_c[best] := out_c[best] + 1;
    used[best] := true;
    rest := rest - 1;
  END LOOP;

  FOR i IN 1..n LOOP res := res || (out_c[i]::numeric / 100); END LOOP;
  RETURN res;
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_fiscal_apportion_v1(numeric, numeric[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_apportion_v1(numeric, numeric[]) TO authenticated, service_role;

-- FASE C4: apuracao tributaria canonica do item. Preview e calculo definitivo
-- passam a chamar EXCLUSIVAMENTE esta funcao; a unica diferenca entre eles e a
-- persistencia. Nenhuma formula e duplicada.
CREATE OR REPLACE FUNCTION public.fn_fiscal_compute_item_taxes_v1(
  p_emit public.company_fiscal_settings,
  p_dest public.customer_fiscal_profiles,
  p_direction text,
  p_sales_channel text,
  p_ref_date date,
  p_ncm text,
  p_prod numeric,
  p_desconto numeric,
  p_frete numeric,
  p_seguro numeric,
  p_outras numeric,
  p_inputs jsonb,
  p_manual_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  pol public.fiscal_operation_policies%ROWTYPE;
  rule public.fiscal_tax_rules%ROWTYPE;
  kinds text[]; k text; ctx jsonb; res jsonb; item_taxes jsonb := '{}'::jsonb;
  v_prod numeric := public.fn_fiscal_round(coalesce(p_prod,0));
  v_icms_own numeric := 0; v_ipi numeric := 0; v_base_st numeric := NULL; v_st_val numeric := 0;
  v_fcp_own numeric := 0; v_fcp_st numeric := 0;
  v_difal_dest numeric := 0; v_difal_orig numeric := 0; v_fcp_dest numeric := 0;
  has_difal boolean := false;
BEGIN
  pol := public.fn_fiscal_resolve_operation(
    coalesce(p_direction,'OUT'), p_emit.state, coalesce(p_dest.fiscal_state, p_emit.state), p_emit.crt,
    p_dest.final_consumer, p_dest.taxpayer_indicator, p_ncm, null, p_sales_channel, p_ref_date);

  kinds := ARRAY['ICMS']::text[];
  IF coalesce(p_emit.ipi_taxpayer,false) THEN kinds := array_append(kinds,'IPI'); END IF;
  IF coalesce(p_emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'ICMS_ST'); END IF;
  IF coalesce(p_emit.fcp_applicable,false) THEN
    kinds := array_append(kinds,'FCP');
    IF coalesce(p_emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'FCP_ST'); END IF;
  END IF;
  IF coalesce(p_emit.difal_responsible,false)
     AND upper(coalesce(p_dest.fiscal_state,'')) <> upper(coalesce(p_emit.state,''))
     AND coalesce(p_dest.final_consumer,true) THEN
    kinds := array_append(kinds,'DIFAL');
  END IF;
  kinds := kinds || ARRAY['PIS','COFINS']::text[];

  FOREACH k IN ARRAY kinds LOOP
    ctx := jsonb_build_object(
      'produto', v_prod,
      'frete',    public.fn_fiscal_round(coalesce(p_frete,0)),
      'seguro',   public.fn_fiscal_round(coalesce(p_seguro,0)),
      'outras',   public.fn_fiscal_round(coalesce(p_outras,0)),
      'desconto', public.fn_fiscal_round(coalesce(p_desconto,0)),
      'ipi', v_ipi, 'icmsSt', v_st_val, 'icmsOwnValue', v_icms_own, 'baseST', v_base_st);

    rule := public.fn_fiscal_resolve_tax_rule(k, p_emit.crt, p_emit.state,
      coalesce(p_dest.fiscal_state, p_emit.state), p_ncm, null,
      p_dest.final_consumer, p_dest.taxpayer_indicator, p_ref_date);

    IF coalesce(rule.base_reduction_mode,'NONE') = 'MANUAL' THEN
      ctx := ctx || jsonb_build_object(
        'manualBaseReductionPct', coalesce(p_inputs,'{}'::jsonb)->k->>'baseReductionPct',
        'manualReason',           coalesce(p_inputs,'{}'::jsonb)->k->>'baseReductionReason',
        'manualBy', p_manual_by::text,
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

  RETURN jsonb_build_object(
    'taxOrder', to_jsonb(kinds),
    'hasDifal', has_difal,
    'policy', jsonb_build_object(
      'id', pol.id, 'cfop', pol.cfop, 'natureOperation', pol.nature_operation,
      'legalVersion', pol.legal_version, 'legalBasis', pol.legal_basis, 'sourceId', pol.source_id),
    'chained', jsonb_build_object(
      'icmsOwnValue', v_icms_own, 'ipi', v_ipi, 'icmsSt', v_st_val, 'baseST', v_base_st),
    'itemTotals', jsonb_build_object(
      'vFCP', v_fcp_own, 'vFCPST', v_fcp_st,
      'vICMSUFDest', v_difal_dest, 'vICMSUFRemet', v_difal_orig, 'vFCPUFDest', v_fcp_dest),
    'taxes', item_taxes);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_fiscal_compute_item_taxes_v1(
  public.company_fiscal_settings, public.customer_fiscal_profiles, text, text, date, text,
  numeric, numeric, numeric, numeric, numeric, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_compute_item_taxes_v1(
  public.company_fiscal_settings, public.customer_fiscal_profiles, text, text, date, text,
  numeric, numeric, numeric, numeric, numeric, jsonb, uuid) TO authenticated, service_role;

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
  v_emit_uf        text;
  v_dest_uf        text;
  v_freight_total  numeric := 0;
  v_insurance_total numeric := 0;
  v_other_total    numeric := 0;
  v_gross_arr      numeric[];
  v_fr_arr         numeric[];
  v_in_arr         numeric[];
  v_ot_arr         numeric[];
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

  -- FASE C2/C3: UFs e encargos resolvidos no servidor (o cliente nao e autoridade).
  SELECT upper(coalesce(state,'')) INTO v_emit_uf
    FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  SELECT upper(coalesce(fiscal_state,'')) INTO v_dest_uf
    FROM public.customer_fiscal_profiles WHERE customer_id = v_customer_id;
  v_dest_uf := coalesce(nullif(v_dest_uf,''), v_emit_uf);

  v_freight_total   := round(coalesce(nullif(p_invoice->>'freight_value','')::numeric, 0), 2);
  v_insurance_total := round(coalesce(nullif(p_invoice->>'insurance_value','')::numeric, 0), 2);
  v_other_total     := round(coalesce(nullif(p_invoice->>'other_value','')::numeric, 0), 2);
  IF v_freight_total < 0 OR v_insurance_total < 0 OR v_other_total < 0 THEN
    RAISE EXCEPTION 'invoice_charges_negative' USING ERRCODE = '22023';
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
      v_pfp          public.product_fiscal_profiles%ROWTYPE;
      v_ncm_s        text;
      v_cest_s       text;
      v_orig_s       text;
      v_cfop_s       text;
      v_cst_s        text;
      v_csosn_s      text;
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
          SELECT * INTO v_pfp FROM public.product_fiscal_profiles pfp
            WHERE pfp.product_id = v_source_id AND pfp.is_active = true LIMIT 1;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'source_item_product_profile_missing:%', v_seq USING ERRCODE = 'P0002';
          END IF;
        END IF;

        -- FASE C2: materializacao server-side dos snapshots fisicos do item.
        v_ncm_s   := nullif(btrim(coalesce(v_pfp.ncm,        v_item_profile->>'ncm',              '')), '');
        v_cest_s  := nullif(btrim(coalesce(v_pfp.cest,       v_item_profile->>'cest',             '')), '');
        v_orig_s  := nullif(btrim(coalesce(v_pfp.origin_code,v_item_profile->>'origem_mercadoria','')), '');
        v_cfop_s  := nullif(btrim(coalesce(
                        CASE WHEN v_dest_uf = v_emit_uf THEN v_pfp.cfop_in_state ELSE v_pfp.cfop_interstate END,
                        v_item_profile->>'cfop', '')), '');
        v_cst_s   := nullif(btrim(coalesce(v_pfp.icms_cst,   v_item_profile->>'cst_icms', '')), '');
        v_csosn_s := nullif(btrim(coalesce(v_pfp.icms_csosn, v_item_profile->>'csosn',    '')), '');
        IF v_ncm_s IS NULL THEN
          RAISE EXCEPTION 'item_ncm_unresolved:%', v_seq USING ERRCODE = '22023';
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
        'tax_input_snapshot',      v_item_input,
        'ncm_snapshot',       v_ncm_s,
        'cest_snapshot',      v_cest_s,
        'origem_snapshot',    v_orig_s,
        'cfop_snapshot',      v_cfop_s,
        'cst_icms_snapshot',  v_cst_s,
        'csosn_snapshot',     v_csosn_s
      );
    END;
    v_total := v_total + v_net;
  END LOOP;

  -- FASE C3: rateio canonico server-side, proporcional ao valor bruto, sem perder centavos.
  SELECT array_agg((it->>'gross_value')::numeric ORDER BY (it->>'seq')::integer)
    INTO v_gross_arr FROM jsonb_array_elements(v_computed_items) it;
  v_fr_arr := public.fn_fiscal_apportion_v1(v_freight_total,   v_gross_arr);
  v_in_arr := public.fn_fiscal_apportion_v1(v_insurance_total, v_gross_arr);
  v_ot_arr := public.fn_fiscal_apportion_v1(v_other_total,     v_gross_arr);
  v_total := round(v_total + v_freight_total + v_insurance_total + v_other_total, 2);

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
      jsonb_build_object('total_net', v_total, 'vFrete', v_freight_total, 'vSeg', v_insurance_total, 'vOutro', v_other_total, 'computed_at', now()),
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
      fiscal_totals_snapshot  = jsonb_build_object('total_net', v_total, 'vFrete', v_freight_total, 'vSeg', v_insurance_total, 'vOutro', v_other_total, 'computed_at', now()),
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
    fiscal_profile_snapshot, tax_snapshot, tax_input_snapshot,
    ncm_snapshot, cest_snapshot, origem_snapshot, cfop_snapshot,
    cst_icms_snapshot, csosn_snapshot,
    freight_value, insurance_value, other_value
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
    COALESCE(it->'tax_input_snapshot','{}'::jsonb),
    it->>'ncm_snapshot',
    it->>'cest_snapshot',
    it->>'origem_snapshot',
    it->>'cfop_snapshot',
    it->>'cst_icms_snapshot',
    it->>'csosn_snapshot',
    COALESCE(v_fr_arr[(it->>'seq')::integer], 0),
    COALESCE(v_in_arr[(it->>'seq')::integer], 0),
    COALESCE(v_ot_arr[(it->>'seq')::integer], 0)
  FROM jsonb_array_elements(v_computed_items) AS it;

  SELECT * INTO v_row FROM public.fiscal_invoices WHERE id = v_new_id;
  RETURN jsonb_build_object(
    'id',            v_row.id,
    'draft_version', v_row.draft_version,
    'total_amount',  v_row.total_amount
  );
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.rpc_fiscal_tax_preview_v1(p_invoice_id uuid, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

    -- FASE C3/C4: encargos vem SEMPRE dos valores canonicos ja rateados pelo
    -- servidor no rascunho; o cliente nao e autoridade de rateio.
    res := public.fn_fiscal_compute_item_taxes_v1(
      emit, dest, coalesce(inv.direction,'OUT'), inv.sales_channel, ref_date, it.ncm_snapshot,
      v_prod,
      public.fn_fiscal_round(coalesce(nullif(ov->>'discount_value','')::numeric, it.discount_value, 0)),
      public.fn_fiscal_round(coalesce(it.freight_value,0)),
      public.fn_fiscal_round(coalesce(it.insurance_value,0)),
      public.fn_fiscal_round(coalesce(it.other_value,0)),
      v_inputs, auth.uid());
    item_taxes := res->'taxes';

    out_items := out_items || jsonb_build_object(
      'itemSequence', it.item_sequence,
      'description', it.description,
      'taxOrder', res->'taxOrder',
      'policy', res->'policy',
      'chained', res->'chained',
      'itemTotals', res->'itemTotals',
      'components', jsonb_build_object(
        'produto', v_prod,
        'desconto', public.fn_fiscal_round(coalesce(nullif(ov->>'discount_value','')::numeric, it.discount_value, 0)),
        'frete', public.fn_fiscal_round(coalesce(it.freight_value,0)),
        'seguro', public.fn_fiscal_round(coalesce(it.insurance_value,0)),
        'outras', public.fn_fiscal_round(coalesce(it.other_value,0))),
      'taxes', item_taxes);
  END LOOP;

  RETURN jsonb_build_object(
    'engineVersion','F3.4',
    'preview', true,
    'persisted', false,
    'items', out_items);
END $function$;
