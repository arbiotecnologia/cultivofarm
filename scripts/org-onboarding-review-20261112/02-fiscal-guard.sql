-- GERADO por generate.py: injeta a contenção após h15_require_staff nas RPCs da Central Fiscal (corpos LIVE capturados).
CREATE OR REPLACE FUNCTION public.rpc_fiscal_certificate_revoke(p_certificate_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
  PERFORM public.h15_require_company((SELECT company_settings_id FROM (SELECT * FROM public.fiscal_certificates WHERE public.h15_company_access(company_settings_id)) fiscal_certificates WHERE id=p_certificate_id));

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_user, 'administrador'::app_role) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_certificates WHERE public.h15_company_access(company_settings_id)) fiscal_certificates WHERE id = p_certificate_id) THEN
    RAISE EXCEPTION 'certificate_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.fiscal_certificates
  SET is_active = false,
      status = CASE WHEN status <> 'REVOKED' THEN 'REVOKED' ELSE status END,
      revoked_at = COALESCE(revoked_at, now()),
      revoked_by = COALESCE(revoked_by, v_user),
      revoke_reason = COALESCE(NULLIF(LEFT(COALESCE(p_reason, ''), 500), ''), revoke_reason),
      updated_at = now()
  WHERE id = p_certificate_id;

  UPDATE public.company_fiscal_settings
  SET certificate_ref = NULL,
      updated_at = now()
  WHERE certificate_ref = p_certificate_id::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_rtc_get()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_row public.company_fiscal_settings%ROWTYPE;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();

  IF NOT public._fiscal_rtc_can_read(v_uid) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings
   ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  RETURN jsonb_build_object(
    'configuration', COALESCE(v_row.rtc_configuration,'{}'::jsonb),
    'revision', COALESCE(v_row.updated_at::text,''),
    'exists', v_row.id IS NOT NULL);
END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_rtc_save(payload jsonb, expected_revision text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_org uuid; v_id uuid; v_stamp timestamptz; v_new text; v_count integer;
BEGIN
 PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
 IF v_uid IS NULL THEN RAISE EXCEPTION 'FISCAL_UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
 IF NOT public.has_role(v_uid,'administrador'::public.app_role) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 v_org:=public.h15_actor_organization();
 PERFORM public._fiscal_rtc_assert_payload(payload,'company');
 PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_GATE_UNAVAILABLE' USING ERRCODE='55000'; END IF;
 PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
 IF public.h15_actor_organization() IS DISTINCT FROM v_org OR NOT public.has_role(v_uid,'administrador'::public.app_role) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO v_count FROM public.company_fiscal_settings WHERE organization_id=v_org;
 IF v_count=0 THEN RAISE EXCEPTION 'FISCAL_COMPANY_NOT_INITIALIZED' USING ERRCODE='PT404'; END IF;
 IF v_count<>1 THEN RAISE EXCEPTION 'FISCAL_COMPANY_AMBIGUOUS' USING ERRCODE='PT409'; END IF;
 SELECT id,updated_at INTO v_id,v_stamp FROM public.company_fiscal_settings WHERE organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_COMPANY_NOT_INITIALIZED' USING ERRCODE='PT404'; END IF;
 IF expected_revision IS NULL OR expected_revision IS DISTINCT FROM v_stamp::text THEN RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='PT409'; END IF;
 UPDATE public.company_fiscal_settings SET rtc_configuration=payload,updated_at=greatest(clock_timestamp(),v_stamp+interval '1 microsecond')
 WHERE id=v_id AND organization_id=v_org AND updated_at=v_stamp RETURNING updated_at::text INTO v_new;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('configuration',payload,'revision',v_new);
END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_settings_init()
 RETURNS company_fiscal_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing public.company_fiscal_settings;
  v_actor    uuid;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();

  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'administrador') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  -- Advisory lock transacional: elimina corrida de singleton entre
  -- chamadas concorrentes desta RPC.
  PERFORM pg_advisory_xact_lock(hashtext('fiscal_company_settings_singleton'));

  SELECT * INTO v_existing
    FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings
    WHERE is_active = true
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.company_fiscal_settings (
    organization_id, is_active, fiscal_environment, configuration_status,
    fiscal_provider, nfe_provider, nfse_provider,
    nfe_enabled, nfse_enabled, production_enabled,
    last_validation_status, configuration_version,
    created_by, updated_by
  ) VALUES (
    public.h15_actor_organization(), true, 'NOT_CONFIGURED', 'DRAFT',
    'NONE', 'NONE', 'NONE',
    false, false, false,
    'NOT_VALIDATED', 1,
    v_actor, v_actor
  ) RETURNING * INTO v_existing;

  RETURN v_existing;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_draft_save(p_invoice_id uuid, p_invoice jsonb, p_items jsonb, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
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
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
  IF p_invoice_id IS NOT NULL THEN PERFORM public.h15_require_invoice(p_invoice_id); END IF;

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
    FROM (SELECT * FROM public.company_fiscal_settings WHERE id = COALESCE((SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id),public.h15_active_company())) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
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
          IF NOT EXISTS (SELECT 1 FROM public.produtos pr WHERE pr.id = v_source_id AND pr.owner_organization_id = public.h15_actor_organization()) THEN
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
    INSERT INTO public.fiscal_invoices (company_settings_id, 
      invoice_type, document_model, document_origin, environment, provider,
      status, normalized_status, series, issue_date, notes,
      company_cnpj, customer_id, receivable_id, delivery_id,
      customer_snapshot, company_snapshot, fiscal_totals_snapshot,
      fiscal_profile_snapshot, tax_snapshot,
      draft_version, created_by, total_amount
    ) VALUES (public.h15_active_company(), 
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
    SELECT * INTO v_row FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;
    PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
    PERFORM public.h15_require_invoice(p_invoice_id);
    IF NOT (public.has_role(v_user,'administrador'::public.app_role) OR public.has_role(v_user,'financeiro'::public.app_role)) THEN
      RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
    END IF;
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
    IF p_expected_version IS NULL OR p_expected_version < 1 OR v_row.draft_version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'conflict' USING ERRCODE = 'PT409';
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
    WHERE id = p_invoice_id
      AND company_settings_id = v_row.company_settings_id
      AND public.h15_company_access(company_settings_id)
      AND draft_version = p_expected_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'conflict' USING ERRCODE = 'PT409'; END IF;
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

  SELECT * INTO v_row FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = v_new_id;
  RETURN jsonb_build_object(
    'id',            v_row.id,
    'draft_version', v_row.draft_version,
    'total_amount',  v_row.total_amount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_draft_validate_homologation(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_row     public.fiscal_invoices;
  v_items   integer;
  v_missing jsonb := '[]'::jsonb;
  v_status  text;
  v_has_cert boolean;
  v_has_company boolean;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_user, 'administrador'::app_role)
          OR public.has_role(v_user, 'financeiro'::app_role)
          OR public.has_role(v_user, 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;

  IF v_row.status <> 'DRAFT' THEN
    RETURN jsonb_build_object(
      'status','BLOCKED',
      'reason','Documento nao esta em rascunho (status atual: '||v_row.status||').'
    );
  END IF;
  IF v_row.provider <> 'NONE' THEN
    RETURN jsonb_build_object(
      'status','BLOCKED',
      'reason','Documento com provedor configurado nao pode ser homologado por esta central.'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) cs WHERE cs.cnpj = v_row.company_cnpj
  ) INTO v_has_company;

  SELECT EXISTS (
    SELECT 1 FROM (SELECT * FROM public.fiscal_certificates WHERE public.h15_company_access(company_settings_id)) fc
    JOIN (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) cs ON cs.id = fc.company_settings_id
    WHERE cs.cnpj = v_row.company_cnpj
      AND fc.environment = 'HOMOLOGATION'
      AND fc.is_active = true
      AND fc.status = 'AVAILABLE'
  ) INTO v_has_cert;

  IF NOT v_has_company THEN
    v_missing := v_missing || jsonb_build_object('field','company','message','Configuracao fiscal da empresa nao encontrada.');
  END IF;
  IF v_row.customer_id IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','customer','message','Cliente destinatario e obrigatorio.');
  ELSIF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = v_row.customer_id) THEN
    v_missing := v_missing || jsonb_build_object('field','customer','message','Cliente informado nao existe mais no cadastro.');
  END IF;
  IF v_row.invoice_type IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','invoice_type','message','Tipo de documento (NF-e/NFS-e) e obrigatorio.');
  END IF;
  IF v_row.document_model IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','document_model','message','Modelo do documento e obrigatorio.');
  END IF;
  IF v_row.series IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','series','message','Serie do documento e obrigatoria.');
  END IF;
  IF v_row.issue_date IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','issue_date','message','Data de emissao e obrigatoria.');
  END IF;

  SELECT COUNT(*) INTO v_items FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id;
  IF v_items = 0 THEN
    v_missing := v_missing || jsonb_build_object('field','items','message','Documento precisa de ao menos um item.');
  END IF;

  -- 3.16.2-C: perfil fiscal + tributos obrigatórios por item
  -- Produto (NF-e): NCM, CFOP e (CST_ICMS ou CSOSN).
  -- Serviço (NFS-e): LC116, CNAE e ISS rate.
  DECLARE
    r RECORD;
    v_prof jsonb;
    v_tax  jsonb;
    v_icms jsonb;
    v_has_cst_or_csosn boolean;
  BEGIN
    FOR r IN
      SELECT item_sequence, item_kind,
             COALESCE(fiscal_profile_snapshot, '{}'::jsonb) AS prof,
             COALESCE(tax_snapshot, '{}'::jsonb) AS tax
      FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items
      WHERE fiscal_invoice_id = p_invoice_id
      ORDER BY item_sequence
    LOOP
      v_prof := r.prof;
      v_tax  := r.tax;
      IF r.item_kind = 'PRODUCT' THEN
        IF v_prof = '{}'::jsonb OR NULLIF(v_prof->>'ncm','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_fiscal_profile','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem NCM no perfil fiscal.'
          );
        END IF;
        IF NULLIF(v_prof->>'cfop','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_cfop','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem CFOP no perfil fiscal.'
          );
        END IF;
        v_icms := v_tax->'icms';
        v_has_cst_or_csosn :=
          NULLIF(v_prof->>'cst_icms','') IS NOT NULL
          OR NULLIF(v_prof->>'csosn','') IS NOT NULL
          OR (v_icms IS NOT NULL AND (NULLIF(v_icms->>'cst','') IS NOT NULL OR NULLIF(v_icms->>'csosn','') IS NOT NULL));
        IF NOT v_has_cst_or_csosn THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_cst_csosn','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem CST_ICMS ou CSOSN definido.'
          );
        END IF;
      ELSIF r.item_kind = 'SERVICE' THEN
        IF v_prof = '{}'::jsonb OR NULLIF(v_prof->>'lc116_item','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_lc116','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem item LC 116 no perfil fiscal.'
          );
        END IF;
        IF NULLIF(v_prof->>'cnae','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_cnae','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem CNAE no perfil fiscal.'
          );
        END IF;
        IF NOT (v_tax ? 'iss_rate') OR jsonb_typeof(v_tax->'iss_rate') <> 'number' THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_iss_rate','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem aliquota de ISS definida.'
          );
        END IF;
      END IF;
    END LOOP;
  END;

  IF v_row.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customer_fiscal_profiles WHERE customer_id = v_row.customer_id
  ) THEN
    v_missing := v_missing || jsonb_build_object('field','customer_fiscal_profile','message','Cliente ainda nao possui perfil fiscal cadastrado.');
  END IF;

  IF NOT v_has_cert THEN
    v_missing := v_missing || jsonb_build_object('field','certificate','message','Certificado digital ativo para homologacao nao configurado.');
  END IF;

  v_status := CASE WHEN jsonb_array_length(v_missing) = 0 THEN 'READY' ELSE 'INCOMPLETE' END;

  RETURN jsonb_build_object(
    'status', v_status,
    'missing', v_missing,
    'item_count', v_items,
    'total_amount', v_row.total_amount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_emitter_accounting_validate(p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE r public.company_fiscal_settings%ROWTYPE;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();

  IF NOT public.fn_regulatory_can_approve('FISCAL') THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: somente responsavel fiscal/contabil valida o emitente.';
  END IF;
  IF length(btrim(coalesce(p_notes,''))) < 20 THEN
    RAISE EXCEPTION 'FISCAL_JUSTIFICATION_REQUIRED: registre a justificativa da validacao (min. 20 caracteres).';
  END IF;
  SELECT * INTO r FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF r.updated_by IS NOT NULL AND r.updated_by = auth.uid() AND r.configuration_status = 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_SEGREGATION_OF_DUTIES: preparador e validador contabil devem ser pessoas distintas.';
  END IF;
  UPDATE public.company_fiscal_settings
     SET configuration_status = 'VALIDATED', accounting_validated_at = now(),
         accounting_validated_by = auth.uid(), configuration_notes = btrim(p_notes), updated_at = now()
   WHERE id = r.id;
  RETURN jsonb_build_object('companyId', r.id, 'status','VALIDATED');
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_emitter_request_accounting_review(p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();

  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para solicitar validacao contabil.';
  END IF;
  IF length(btrim(coalesce(p_notes,''))) < 20 THEN
    RAISE EXCEPTION 'FISCAL_JUSTIFICATION_REQUIRED: descreva a solicitacao com pelo menos 20 caracteres.';
  END IF;
  UPDATE public.company_fiscal_settings
     SET configuration_status = 'PENDING_ACCOUNTING',
         configuration_notes = btrim(p_notes), updated_by = auth.uid(), updated_at = now()
   WHERE is_active AND organization_id=public.h15_actor_organization() RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  RETURN jsonb_build_object('companyId', v_id, 'status','PENDING_ACCOUNTING');
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_homologation_readiness()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
 v_uid uuid := auth.uid(); v_authorized boolean := false;
 v_company public.company_fiscal_settings%ROWTYPE;
 v_env_ok boolean := false; v_prod_off boolean := false; v_company_ok boolean := false;
 v_nfe_ok boolean := false; v_nfse_ok boolean := false;
 v_products_available boolean := false; v_services_available boolean := false;
 v_customers_available boolean := false; v_drafts_available boolean := false;
 v_products_ready integer := 0; v_services_ready integer := 0; v_customers_ready integer := 0;
 v_cert_ok boolean := false; v_vault_available boolean := false;
 v_upload_fn_ok boolean := false; v_revoke_fn_ok boolean := false;
 v_rpc_save_ok boolean := false; v_rpc_validate_ok boolean := false;
 v_drafts_total integer := 0; v_drafts_ready integer := 0;
 v_drafts_incomp integer := 0; v_drafts_blocked integer := 0;
 v_checklist jsonb := '[]'::jsonb; v_status text := 'INCOMPLETE';
 v_has_blocker boolean := false; v_has_unavailable boolean := false; v_all_items_ready boolean;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();

 IF v_uid IS NULL THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT public.has_role(v_uid,'administrador'::app_role)
     OR public.has_role(v_uid,'gestor'::app_role)
     OR public.has_role(v_uid,'financeiro'::app_role) INTO v_authorized;
 IF NOT v_authorized THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_company FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings
 WHERE is_active=true ORDER BY updated_at DESC NULLS LAST LIMIT 1;
 IF FOUND THEN
  v_env_ok := v_company.fiscal_environment='HOMOLOGATION';
  v_prod_off := COALESCE(v_company.production_enabled,false)=false;
  v_company_ok := v_company.cnpj IS NOT NULL AND length(v_company.cnpj)>=14
    AND v_company.legal_name IS NOT NULL AND length(btrim(v_company.legal_name))>0
    AND v_company.fiscal_email IS NOT NULL AND v_company.municipality_ibge_code IS NOT NULL;
  v_nfe_ok := COALESCE(v_company.nfe_enabled,false)
    AND COALESCE(jsonb_typeof(v_company.nfe_configuration),'null')='object'
    AND v_company.nfe_configuration<>'{}'::jsonb;
  v_nfse_ok := COALESCE(v_company.nfse_enabled,false)
    AND COALESCE(jsonb_typeof(v_company.nfse_configuration),'null')='object'
    AND v_company.nfse_configuration<>'{}'::jsonb;
 END IF;

 BEGIN SELECT count(*)::int INTO v_products_ready FROM public.v_product_fiscal_readiness WHERE minimally_classified=true AND accounting_validated=true; v_products_available:=true;
 EXCEPTION WHEN OTHERS THEN v_products_available:=false; v_products_ready:=0; END;
 BEGIN SELECT count(*)::int INTO v_services_ready FROM public.v_service_fiscal_readiness WHERE minimally_classified=true AND accounting_validated=true; v_services_available:=true;
 EXCEPTION WHEN OTHERS THEN v_services_available:=false; v_services_ready:=0; END;
 BEGIN SELECT count(*)::int INTO v_customers_ready FROM public.v_customer_fiscal_readiness WHERE has_ibge=true; v_customers_available:=true;
 EXCEPTION WHEN OTHERS THEN v_customers_available:=false; v_customers_ready:=0; END;

 IF v_company.id IS NOT NULL THEN
  SELECT EXISTS(SELECT 1 FROM (SELECT * FROM public.fiscal_certificates WHERE public.h15_company_access(company_settings_id)) c WHERE c.company_settings_id=v_company.id AND c.is_active=true AND c.status='AVAILABLE' AND c.environment='HOMOLOGATION' AND c.valid_from IS NOT NULL AND c.valid_from<=now() AND c.valid_until IS NOT NULL AND c.valid_until>now()) INTO v_cert_ok;
 END IF;
 v_vault_available := EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='fiscal_certificate_material');
 v_rpc_save_ok := EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_fiscal_draft_save');
 v_rpc_validate_ok := EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_fiscal_draft_validate_homologation');
 v_upload_fn_ok := EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_fiscal_certificate_register_a1');
 v_revoke_fn_ok := EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_fiscal_certificate_revoke');

 BEGIN
  SELECT count(*)::int,
   count(*) FILTER(WHERE homologation_validation_status='READY')::int,
   count(*) FILTER(WHERE homologation_validation_status IN ('INCOMPLETE','NOT_VALIDATED'))::int,
   count(*) FILTER(WHERE homologation_validation_status='BLOCKED')::int
  INTO v_drafts_total,v_drafts_ready,v_drafts_incomp,v_drafts_blocked
  FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE document_origin='MANUAL_RECORD' AND status='DRAFT';
  v_drafts_available:=true;
 EXCEPTION WHEN OTHERS THEN v_drafts_available:=false; v_drafts_total:=0; v_drafts_ready:=0; v_drafts_incomp:=0; v_drafts_blocked:=0; END;

 IF v_company.id IS NOT NULL AND COALESCE(v_company.production_enabled,false)=true THEN v_has_blocker:=true; END IF;
 v_checklist := jsonb_build_array(
  jsonb_build_object('key','env_homologation','label','Ambiente fiscal em homologação','status',CASE WHEN v_company.id IS NULL THEN 'NOT_CONFIGURED' WHEN v_env_ok THEN 'READY' ELSE 'INCOMPLETE' END),
  jsonb_build_object('key','production_disabled','label','Produção desabilitada','status',CASE WHEN v_prod_off THEN 'READY' ELSE 'BLOCKED' END),
  jsonb_build_object('key','company_profile','label','Dados da empresa completos','status',CASE WHEN v_company.id IS NULL THEN 'NOT_CONFIGURED' WHEN v_company_ok THEN 'READY' ELSE 'INCOMPLETE' END),
  jsonb_build_object('key','nfe_configured','label','NF-e habilitada e configurada','status',CASE WHEN v_nfe_ok THEN 'READY' ELSE 'INCOMPLETE' END),
  jsonb_build_object('key','nfse_configured','label','NFS-e habilitada e configurada','status',CASE WHEN v_nfse_ok THEN 'READY' ELSE 'INCOMPLETE' END),
  jsonb_build_object('key','product_ready','label','Ao menos um produto fiscal pronto','status',CASE WHEN NOT v_products_available THEN 'UNAVAILABLE' WHEN v_products_ready>0 THEN 'READY' ELSE 'INCOMPLETE' END,'count',v_products_ready),
  jsonb_build_object('key','service_ready','label','Ao menos um serviço fiscal pronto','status',CASE WHEN NOT v_services_available THEN 'UNAVAILABLE' WHEN v_services_ready>0 THEN 'READY' ELSE 'INCOMPLETE' END,'count',v_services_ready),
  jsonb_build_object('key','customer_ready','label','Ao menos um cliente fiscal pronto','status',CASE WHEN NOT v_customers_available THEN 'UNAVAILABLE' WHEN v_customers_ready>0 THEN 'READY' ELSE 'INCOMPLETE' END,'count',v_customers_ready),
  jsonb_build_object('key','drafts_source','label','Fonte de rascunhos disponível','status',CASE WHEN v_drafts_available THEN 'READY' ELSE 'UNAVAILABLE' END,'count',v_drafts_total),
  jsonb_build_object('key','certificate_active','label','Certificado de homologação ativo e vigente','status',CASE WHEN v_company.id IS NULL THEN 'NOT_CONFIGURED' WHEN v_cert_ok THEN 'READY' ELSE 'INCOMPLETE' END),
  jsonb_build_object('key','vault_available','label','Cofre de certificados disponível','status',CASE WHEN v_vault_available THEN 'READY' ELSE 'UNAVAILABLE' END),
  jsonb_build_object('key','upload_function','label','Função de registro de certificado disponível','status',CASE WHEN v_upload_fn_ok THEN 'READY' ELSE 'UNAVAILABLE' END),
  jsonb_build_object('key','revoke_function','label','Função de revogação de certificado disponível','status',CASE WHEN v_revoke_fn_ok THEN 'READY' ELSE 'UNAVAILABLE' END),
  jsonb_build_object('key','rpc_draft_save','label','RPC de salvamento de rascunho disponível','status',CASE WHEN v_rpc_save_ok THEN 'READY' ELSE 'UNAVAILABLE' END),
  jsonb_build_object('key','rpc_draft_validate','label','RPC de validação de homologação disponível','status',CASE WHEN v_rpc_validate_ok THEN 'READY' ELSE 'UNAVAILABLE' END)
 );
 SELECT bool_and((e->>'status')='READY'),bool_or((e->>'status')='UNAVAILABLE') INTO v_all_items_ready,v_has_unavailable FROM jsonb_array_elements(v_checklist)e;
 IF v_has_blocker THEN v_status:='BLOCKED'; ELSIF v_has_unavailable THEN v_status:='UNAVAILABLE'; ELSIF COALESCE(v_all_items_ready,false) AND v_env_ok THEN v_status:='READY'; ELSE v_status:='INCOMPLETE'; END IF;
 RETURN jsonb_build_object('status',v_status,'generated_at',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'environment_label',CASE WHEN v_company.id IS NULL THEN 'Não configurado' WHEN v_env_ok THEN 'Homologação' ELSE 'Indisponível' END,'production_enabled',COALESCE(v_company.production_enabled,false),'checklist',v_checklist,'counts',jsonb_build_object('drafts_total',v_drafts_total,'drafts_ready',v_drafts_ready,'drafts_incomplete',v_drafts_incomp,'drafts_blocked',v_drafts_blocked,'products_ready',v_products_ready,'services_ready',v_services_ready,'customers_ready',v_customers_ready));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_nfe_readiness_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  emit public.company_fiscal_settings%ROWTYPE;
  rec_total int; rec_ready int; pol_pub int; rules_pub int; series_cnt int;
  cert_ok boolean; pend jsonb := '[]'::jsonb;
  cov jsonb; micro jsonb;
  m_active int; m_ready int; m_draft int; m_blocked int; m_inactive int;
  emitter_status text; overall text;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();

  IF NOT public.fn_fiscal_can_read_internal() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao de leitura fiscal.';
  END IF;

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  SELECT count(*), count(*) FILTER (WHERE nfe_readiness_status = 'READY')
    INTO rec_total, rec_ready FROM public.customer_fiscal_profiles;
  SELECT count(*) INTO pol_pub FROM public.fiscal_operation_policies
   WHERE policy_status = 'PUBLISHED' AND document_model = '55';
  SELECT count(*) INTO rules_pub FROM public.fiscal_tax_rules WHERE status = 'PUBLISHED';
  SELECT count(*) INTO series_cnt FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series WHERE status = 'ACTIVE';
  cert_ok := EXISTS (SELECT 1 FROM public.fiscal_certificates c
    WHERE c.id::text = emit.certificate_ref AND c.company_settings_id = emit.id
      AND c.environment = 'HOMOLOGATION' AND c.status = 'AVAILABLE'
      AND c.is_active IS TRUE AND c.revoked_at IS NULL
      AND c.valid_from <= now() AND c.valid_until > now());

  cov := public.fn_fiscal_scenario_coverage();
  micro := coalesce(cov->'microorganisms','{}'::jsonb);
  m_active   := coalesce((micro->>'active')::int,0);
  m_ready    := coalesce((micro->>'ready')::int,0);
  m_draft    := coalesce((micro->>'draft')::int,0);
  m_blocked  := coalesce((micro->>'blocked')::int,0);
  m_inactive := coalesce((micro->>'inactive')::int,0);

  -- Teto absoluto da F3: nunca READY_PRODUCTION.
  emitter_status := coalesce(emit.nfe_readiness_status,'NOT_READY');
  IF NOT cert_ok OR emitter_status = 'READY_PRODUCTION' THEN
    emitter_status := 'NOT_READY';
  END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','EMITTER_PRODUCTION_BLOCKED_F3',
      'severity','BLOCK','message','Ambiente de producao (tpAmb=1) bloqueado nesta fase. Teto: READY_HOMOLOGATION.');
  END IF;
  IF emit.id IS NOT NULL AND emit.sefaz_homologation_at IS NULL THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','SEFAZ_HOMOLOGATION_NOT_RECORDED',
      'severity','WARN','message','Homologacao SEFAZ ainda nao registrada. A transicao so ocorrera por RPC controlada em fase posterior.');
  END IF;

  IF emit.id IS NULL THEN
    pend := pend || jsonb_build_object('section','EMITENTE','code','EMITTER_NOT_CONFIGURED','severity','BLOCK','message','Emitente nao cadastrado.');
  ELSE
    pend := pend || coalesce((SELECT jsonb_agg(e || jsonb_build_object('section','EMITENTE'))
                              FROM jsonb_array_elements(emit.nfe_readiness_pendencies) e), '[]'::jsonb);
  END IF;

  IF rec_total = 0 THEN
    pend := pend || jsonb_build_object('section','DESTINATARIOS','code','RECIPIENTS_NONE','severity','BLOCK','message','Nenhum perfil fiscal de destinatario cadastrado.');
  ELSIF rec_ready = 0 THEN
    pend := pend || jsonb_build_object('section','DESTINATARIOS','code','RECIPIENTS_NONE_READY','severity','BLOCK','message','Nenhum destinatario com cadastro fiscal completo.');
  END IF;

  IF pol_pub = 0 THEN
    pend := pend || jsonb_build_object('section','OPERACOES','code','OPERATION_POLICIES_NONE','severity','BLOCK','message','Nenhuma politica de operacao/CFOP publicada para modelo 55.');
  END IF;

  IF coalesce((cov->>'total')::int,0) = 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','COVERAGE_NO_SCENARIOS','severity','BLOCK',
      'message','Nao ha cenarios reais (destinatario pronto x canal ativo x NCM oficial) para aferir cobertura tributaria.');
  ELSIF (cov->>'covered')::int < (cov->>'total')::int THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','COVERAGE_INCOMPLETE','severity','BLOCK',
      'message','Cobertura tributaria incompleta: '||(cov->>'covered')||' de '||(cov->>'total')||' cenarios validados no motor.');
  END IF;

  -- Somente microrganismos ATIVOS podem bloquear. Inativos sao informativos.
  IF m_blocked > 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','MICROORGANISMS_BLOCKED','severity','BLOCK',
      'message', m_blocked||' microrganismo(s) ativo(s) com perfil fiscal BLOQUEADO.');
  END IF;
  IF m_draft > 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','MICROORGANISMS_NOT_READY','severity','BLOCK',
      'message', m_draft||' de '||m_active||' microrganismos ativos sem dossie aprovado e validacao contabil.');
  END IF;

  IF NOT cert_ok THEN
    pend := pend || jsonb_build_object('section','CERTIFICADO','code','CERTIFICATE_MISSING','severity','BLOCK','message','Certificado ausente, indisponivel, revogado, vencido ou de outra empresa.');
  END IF;
  IF series_cnt = 0 THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','SERIES_NOT_INITIALIZED','severity','WARN','message','Nenhuma serie de numeracao inicializada; sera criada na primeira reserva.');
  END IF;

  overall := CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(pend) e WHERE e->>'severity'='BLOCK') THEN 'NOT_READY'
    WHEN jsonb_array_length(pend) > 0 THEN 'PARTIAL'
    ELSE 'READY_HOMOLOGATION' END;

  RETURN jsonb_build_object(
    'generatedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
    'documentModel','55',
    'maxAllowedStatus','READY_HOMOLOGATION',
    'emitter', jsonb_build_object(
      'configured', emit.id IS NOT NULL,
      'status', emitter_status,
      'crt', emit.crt, 'uf', emit.state,
      'series', emit.nfe_series_number, 'environment', emit.nfe_environment_code,
      'certificateLinked', cert_ok,
      'sefazHomologationRecorded', emit.sefaz_homologation_at IS NOT NULL,
      'productionBlocked', true,
      'accountingValidated', emit.accounting_validated_at IS NOT NULL),
    'recipients', jsonb_build_object('total', rec_total, 'ready', rec_ready),
    'operations', jsonb_build_object('publishedPolicies', pol_pub),
    'taxes', jsonb_build_object('publishedRules', rules_pub, 'missingMandatoryKinds', '[]'::jsonb),
    'coverage', cov,
    'microorganisms', jsonb_build_object(
      'active', m_active, 'ready', m_ready, 'draft', m_draft,
      'blocked', m_blocked, 'inactive', m_inactive,
      'total', m_active + m_inactive),
    'numbering', jsonb_build_object('activeSeries', series_cnt),
    'pendencies', pend,
    'overallStatus', overall);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_preflight_v1(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_user      uuid := auth.uid();
  v_inv       public.fiscal_invoices;
  v_blockers  jsonb := '[]'::jsonb;
  v_warnings  jsonb := '[]'::jsonb;
  v_env       text := NULL;
  v_validate  jsonb;
  v_sum       numeric(14,2);
  v_diff      numeric(14,2);
  v_tolerance numeric := 0.01;
  v_dups      integer;
  v_miss      jsonb;
  v_pend      jsonb;
  v_cfs       public.company_fiscal_settings;
  v_cfp       public.customer_fiscal_profiles;
  r           RECORD;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_user, 'administrador'::app_role)
          OR public.has_role(v_user, 'financeiro'::app_role)
          OR public.has_role(v_user, 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem competencia fiscal.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id USING ERRCODE = 'P0002';
  END IF;

  -- 1) Ambiente (fail-closed; produção sempre recusada pelo gate).
  BEGIN
    v_env := public.fn_fiscal_environment_gate_v1('PREFLIGHT');
  EXCEPTION WHEN OTHERS THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', split_part(SQLERRM, ':', 1),
      'section', 'AMBIENTE',
      'field', 'environment',
      'message', SQLERRM,
      'action', 'Revisar configuracao do emitente/ambiente com a contabilidade.');
  END;

  -- 2) Regras de documento/itens/tributos, explodidas POR CAMPO.
  BEGIN
    v_validate := public.rpc_fiscal_draft_validate_homologation(p_invoice_id);
  EXCEPTION WHEN OTHERS THEN
    v_validate := jsonb_build_object('status','BLOCKED','reason', SQLERRM);
  END;

  IF coalesce(v_validate->>'status','BLOCKED') = 'BLOCKED'
     AND coalesce(jsonb_array_length(v_validate->'missing'), 0) = 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','FISCAL_DOCUMENT_BLOCKED','section','DOCUMENTO','field','document',
      'message', coalesce(v_validate->>'reason','Documento fiscal bloqueado para homologacao.'),
      'action','Revisar a situacao do documento antes de transmitir.');
  END IF;

  FOR v_miss IN
    SELECT value FROM jsonb_array_elements(coalesce(v_validate->'missing','[]'::jsonb))
  LOOP
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'FISCAL_FIELD_REQUIRED',
      'section', CASE
                   WHEN v_miss->>'field' LIKE 'item%' THEN 'ITENS'
                   WHEN v_miss->>'field' LIKE 'customer%' THEN 'DESTINATARIO'
                   WHEN v_miss->>'field' IN ('company','certificate') THEN 'EMITENTE'
                   ELSE 'DOCUMENTO'
                 END,
      'field', v_miss->>'field',
      'itemSequence', v_miss->'item_sequence',
      'message', v_miss->>'message',
      'action', 'Preencher o campo indicado no cadastro de origem.');
  END LOOP;

  -- 3) Pendências do EMITENTE (reutiliza a função canônica de prontidão).
  SELECT * INTO v_cfs FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) company_fiscal_settings WHERE is_active LIMIT 1;
  IF FOUND THEN
    FOR v_pend IN
      SELECT value FROM jsonb_array_elements(
        coalesce(public.fn_fiscal_emitter_pendencies_row(v_cfs), '[]'::jsonb))
    LOOP
      IF coalesce(v_pend->>'severity','BLOCK') = 'BLOCK' THEN
        v_blockers := v_blockers || jsonb_build_object(
          'code', v_pend->>'code', 'section','EMITENTE',
          'field', v_pend->>'field', 'message', v_pend->>'message',
          'action','Completar o cadastro do emitente.');
      ELSE
        v_warnings := v_warnings || jsonb_build_object(
          'code', v_pend->>'code', 'section','EMITENTE',
          'field', v_pend->>'field', 'message', v_pend->>'message',
          'action','Conferir manualmente com a contabilidade.');
      END IF;
    END LOOP;
  END IF;

  -- 4) Pendências do DESTINATÁRIO (documento/IE/UF/município/endereço).
  IF v_inv.customer_id IS NOT NULL THEN
    SELECT * INTO v_cfp FROM public.customer_fiscal_profiles
     WHERE customer_id = v_inv.customer_id LIMIT 1;
    IF FOUND THEN
      FOR v_pend IN
        SELECT value FROM jsonb_array_elements(
          coalesce(public.fn_fiscal_recipient_pendencies_row(v_cfp), '[]'::jsonb))
      LOOP
        IF coalesce(v_pend->>'severity','BLOCK') = 'BLOCK' THEN
          v_blockers := v_blockers || jsonb_build_object(
            'code', v_pend->>'code', 'section','DESTINATARIO',
            'field', v_pend->>'field', 'message', v_pend->>'message',
            'action','Completar o perfil fiscal do destinatario.');
        ELSE
          v_warnings := v_warnings || jsonb_build_object(
            'code', v_pend->>'code', 'section','DESTINATARIO',
            'field', v_pend->>'field', 'message', v_pend->>'message',
            'action','Conferir o perfil fiscal do destinatario.');
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- 5) Sanidade aritmética item a item (unidade, quantidade, valores).
  FOR r IN
    SELECT item_sequence, quantity, unit_value, commercial_unit,
           net_value, gross_value, discount_value
      FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items
     WHERE fiscal_invoice_id = p_invoice_id
     ORDER BY item_sequence
  LOOP
    IF r.quantity IS NULL OR r.quantity <= 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_QUANTITY_INVALID','section','ITENS','field','quantity',
        'itemSequence', r.item_sequence,
        'message', format('Item %s com quantidade invalida.', r.item_sequence),
        'action','Corrigir a quantidade do item.');
    END IF;
    IF r.commercial_unit IS NULL OR btrim(r.commercial_unit) = '' THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_UNIT_MISSING','section','ITENS','field','commercial_unit',
        'itemSequence', r.item_sequence,
        'message', format('Item %s sem unidade comercial.', r.item_sequence),
        'action','Definir a unidade comercial do item.');
    END IF;
    IF r.unit_value IS NULL OR r.unit_value < 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_UNIT_VALUE_INVALID','section','ITENS','field','unit_value',
        'itemSequence', r.item_sequence,
        'message', format('Item %s com valor unitario invalido.', r.item_sequence),
        'action','Corrigir o valor unitario do item.');
    END IF;
    IF r.net_value IS NULL THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_NET_VALUE_MISSING','section','ITENS','field','net_value',
        'itemSequence', r.item_sequence,
        'message', format('Item %s sem valor liquido calculado.', r.item_sequence),
        'action','Recalcular o documento fiscal.');
    ELSIF r.quantity IS NOT NULL AND r.unit_value IS NOT NULL
          AND abs(r.net_value - (r.quantity * r.unit_value - coalesce(r.discount_value,0))) > v_tolerance THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_TOTAL_MISMATCH','section','ITENS','field','net_value',
        'itemSequence', r.item_sequence,
        'message', format('Item %s: liquido diverge de quantidade x unitario - desconto.', r.item_sequence),
        'action','Recalcular o documento a partir do snapshot de origem.');
    END IF;
  END LOOP;

  -- 6) Coerência aritmética dos totais (tolerância documentada de R$ 0,01).
  SELECT coalesce(sum(coalesce(net_value, gross_value, quantity * unit_value)), 0)::numeric(14,2)
    INTO v_sum
    FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id;

  IF v_inv.total_amount IS NULL THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','FISCAL_TOTAL_MISSING','section','TOTAIS','field','total_amount',
      'message','Total do documento nao informado.','action','Recalcular o documento.');
  ELSE
    v_diff := abs(v_inv.total_amount - v_sum);
    IF v_diff > v_tolerance THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_TOTAL_MISMATCH','section','TOTAIS','field','total_amount',
        'message', format('Total do documento (%s) diverge da soma dos itens (%s).', v_inv.total_amount, v_sum),
        'action','Recalcular o documento a partir do snapshot de origem.');
    END IF;
  END IF;

  -- 7) Duplicidade ativa por origem (mesma regra do índice ux_fiscal_invoice_scope_nfe).
  IF v_inv.source_id IS NOT NULL AND v_inv.document_model = 'NFE' THEN
    SELECT count(*) INTO v_dups FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) f
     WHERE f.source_type = v_inv.source_type
       AND f.source_id = v_inv.source_id
       AND f.document_model = 'NFE'
       AND f.id <> v_inv.id
       AND f.status <> 'CANCELED';
    IF v_dups > 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_DUPLICATE_ACTIVE_DOCUMENT','section','ORIGEM','field','source_id',
        'message','Ja existe documento fiscal ativo para esta origem.',
        'action','Cancelar ou reaproveitar o documento existente.');
    END IF;
  END IF;

  -- 8) Pré-requisito externo: certificado de homologação para transmitir.
  IF NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM public.fiscal_certificates WHERE public.h15_company_access(company_settings_id)) fc
     JOIN (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) cs ON cs.id = fc.company_settings_id
    WHERE fc.environment = 'HOMOLOGATION' AND fc.is_active AND fc.status = 'AVAILABLE'
  ) THEN
    v_warnings := v_warnings || jsonb_build_object(
      'code','EXTERNAL_PREREQUISITE_MISSING','section','CERTIFICADO','field','certificate',
      'message','Certificado de homologacao indisponivel: transmissao nao pode ser executada.',
      'action','Provisionar certificado A1 de homologacao antes do smoke SEFAZ.');
  END IF;

  RETURN jsonb_build_object(
    'invoiceId', p_invoice_id,
    'preflightVersion', 'h7k-v1',
    'environment', coalesce(v_env, 'UNKNOWN'),
    'status', CASE WHEN jsonb_array_length(v_blockers) > 0 THEN 'BLOCKED'
                   WHEN jsonb_array_length(v_warnings) > 0 THEN 'READY_WITH_PREREQUISITES'
                   ELSE 'READY' END,
    'canTransmit', (jsonb_array_length(v_blockers) = 0 AND jsonb_array_length(v_warnings) = 0),
    'blockers', v_blockers,
    'warnings', v_warnings,
    'fields', (
      SELECT coalesce(jsonb_object_agg(f.field, f.msgs), '{}'::jsonb)
        FROM (
          SELECT b->>'field' AS field, jsonb_agg(b->>'message') AS msgs
            FROM jsonb_array_elements(v_blockers) b
           WHERE b->>'field' IS NOT NULL
           GROUP BY b->>'field'
        ) f
    ),
    'itemsTotal', v_sum,
    'documentTotal', v_inv.total_amount,
    'toleranceBRL', v_tolerance,
    'evaluatedAt', now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_reserve_nfe_number_v1(p_invoice_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  s public.fiscal_document_series%ROWTYPE;
  existing public.fiscal_number_reservations%ROWTYPE;
  n int; cnf text; key43 text; dv int; full_key text; cuf text;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para reservar numeracao.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;

  -- F3.1-R1: gate de ambiente avaliado ANTES de qualquer leitura/efeito, fail-closed.
  PERFORM public.fn_fiscal_assert_environment_homologation();
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: documento nao informado.';
  END IF;

  SELECT * INTO inv FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;

  IF EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_number_reservations WHERE public.h15_invoice_access(fiscal_invoice_id)) r
              WHERE r.idempotency_key = p_idempotency_key
                AND r.fiscal_invoice_id <> p_invoice_id) THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave de idempotencia ja utilizada por outro documento fiscal.'
      USING HINT = 'Gere uma chave exclusiva por documento. Reservas nunca sao compartilhadas entre documentos.';
  END IF;

  SELECT * INTO existing FROM (SELECT * FROM public.fiscal_number_reservations WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_number_reservations
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('reservationId', existing.id, 'number', existing.number,
      'series', (SELECT series FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series WHERE id = existing.series_id),
      'accessKey', existing.access_key, 'checkDigit', existing.check_digit,
      'tpEmis', existing.tp_emis, 'status', existing.status, 'idempotentReplay', true);
  END IF;

  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: reserva permitida apenas em rascunho (status=%)', inv.status;
  END IF;
  IF coalesce(inv.tp_emis,1) <> 1 THEN
    RAISE EXCEPTION 'FISCAL_TPEMIS_UNSUPPORTED: apenas emissao normal (tpEmis=1) esta habilitada nesta fase.';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_number_reservations WHERE public.h15_invoice_access(fiscal_invoice_id)) r
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

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao (tpAmb=1) bloqueado na fase F3; teto READY_HOMOLOGATION.';
  END IF;
  IF emit.nfe_readiness_status <> 'READY_HOMOLOGATION' THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_READY: emitente com pendencias %', emit.nfe_readiness_pendencies;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('fiscal_series:' || emit.id::text || ':' ||
          coalesce(emit.nfe_series_number,0)::text || ':' || coalesce(emit.nfe_environment_code,'2')));

  SELECT * INTO s FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series
   WHERE company_id = emit.id AND document_model = '55'
     AND series = emit.nfe_series_number AND environment_code = emit.nfe_environment_code
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.fiscal_document_series (company_id, series, environment_code, created_by)
    VALUES (emit.id, emit.nfe_series_number, emit.nfe_environment_code, auth.uid())
    RETURNING * INTO s;
    SELECT * INTO s FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series WHERE id = s.id FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.rpc_fiscal_sefaz_transmission_status_v1(_invoice_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_items jsonb;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
  IF _invoice_id IS NOT NULL THEN PERFORM public.h15_require_invoice(_invoice_id); END IF;

  IF NOT public.fn_fiscal_can_read_internal(auth.uid()) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'createdAt' DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'transmissionId', t.id, 'service', t.service, 'state', t.state,
      'outcome', t.outcome,
      'invoiceId', t.fiscal_invoice_id, 'xmlRunId', t.xml_run_id,
      'eventId', t.fiscal_event_id,
      'environmentCode', t.environment_code, 'endpointHost', t.endpoint_host,
      'cStat', t.c_stat, 'xMotivo', t.x_motivo, 'chNFe', t.ch_nfe,
      'nProt', t.n_prot, 'nRec', t.n_rec, 'dhRecbto', t.dh_recbto,
      'errorCode', t.error_code, 'attempt', t.attempt,
      'correlationId', t.correlation_id,
      'createdAt', t.created_at, 'completedAt', t.completed_at) AS x
    FROM (SELECT * FROM public.fiscal_sefaz_transmissions WHERE public.h15_invoice_access(fiscal_invoice_id)) t
    WHERE (_invoice_id IS NULL OR t.fiscal_invoice_id = _invoice_id)
    ORDER BY t.created_at DESC
    LIMIT 50
  ) s;

  RETURN jsonb_build_object('ceiling', 'HOMOLOGATION', 'environmentCode', '2',
                            'items', v_items);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_tax_preview_v1(p_invoice_id uuid, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
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
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para simular tributos.' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items_array_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO inv FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;
  IF inv.document_model IS DISTINCT FROM 'NFE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: preview de servicos ainda indisponivel.';
  END IF;
  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: preview disponivel apenas em rascunho (status=%)', inv.status;
  END IF;

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao bloqueado.';
  END IF;

  SELECT * INTO dest FROM public.customer_fiscal_profiles WHERE customer_id = inv.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECIPIENT_PROFILE_MISSING: perfil fiscal do destinatario nao cadastrado.'; END IF;

  ref_date := coalesce(inv.issue_date, current_date);

  FOR it IN SELECT * FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id ORDER BY item_sequence
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

CREATE OR REPLACE FUNCTION public.rpc_fiscal_xml_prepare_v1(p_invoice_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  inv  public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  resv public.fiscal_number_reservations%ROWTYPE;
  srs  public.fiscal_document_series%ROWTYPE;
  existing public.fiscal_xml_runs%ROWTYPE;
  v_items jsonb;
  v_payload jsonb;
  v_hash text;
  v_schema text;
  v_version int;
  v_prev uuid;
  v_run public.fiscal_xml_runs%ROWTYPE;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF NOT public.fn_fiscal_can_operate(auth.uid()) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para gerar XML fiscal.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: documento nao informado.';
  END IF;

  -- Gate de ambiente fail-closed ANTES de qualquer leitura/efeito (F3.1-R2).
  PERFORM public.fn_fiscal_assert_environment_homologation();

  IF EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_xml_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_xml_runs
              WHERE idempotency_key = p_idempotency_key
                AND fiscal_invoice_id <> p_invoice_id) THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave de idempotencia ja utilizada por outro documento fiscal.';
  END IF;

  SELECT * INTO inv FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;

  IF inv.document_model <> 'NFE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: fase F4 cobre apenas NF-e modelo 55.';
  END IF;
  IF coalesce(inv.tp_emis,1) <> 1 THEN
    RAISE EXCEPTION 'FISCAL_TPEMIS_UNSUPPORTED: apenas emissao normal (tpEmis=1) esta habilitada nesta fase.';
  END IF;
  IF inv.tax_snapshot IS NULL OR NOT (inv.tax_snapshot ? 'engineVersion') THEN
    RAISE EXCEPTION 'FISCAL_CALCULATION_REQUIRED: calcule os tributos antes de gerar o XML.';
  END IF;

  SELECT * INTO resv FROM (SELECT * FROM public.fiscal_number_reservations WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_number_reservations
   WHERE fiscal_invoice_id = p_invoice_id AND status = 'RESERVED'
   ORDER BY reserved_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_NUMBER_RESERVATION_REQUIRED: reserve a numeracao antes de gerar o XML.';
  END IF;
  SELECT * INTO srs FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series WHERE id = resv.series_id;

  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id, p_invoice_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %',
      (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id, p_invoice_id))->>'reasons';
  END IF;

  PERFORM public.fn_fiscal_assert_debtor_recipient(p_invoice_id);

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') <> '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: apenas homologacao (tpAmb=2) e permitida na fase F4.';
  END IF;
  IF emit.nfe_readiness_status <> 'READY_HOMOLOGATION' THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_READY: emitente com pendencias %', emit.nfe_readiness_pendencies;
  END IF;

  SELECT * INTO dest FROM public.customer_fiscal_profiles WHERE customer_id = inv.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECIPIENT_PROFILE_MISSING: perfil fiscal do destinatario nao cadastrado.'; END IF;
  IF dest.nfe_readiness_status <> 'READY' THEN
    RAISE EXCEPTION 'FISCAL_RECIPIENT_NOT_READY: destinatario com pendencias %', dest.nfe_readiness_pendencies;
  END IF;

  SELECT schema_version INTO v_schema
    FROM public.fiscal_xsd_registry
   WHERE schema_name = 'nfe_v4.00' AND is_active
   ORDER BY published_at DESC LIMIT 1;
  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'FISCAL_XSD_NOT_REGISTERED: esquema NF-e 4.00 ausente no registro oficial.';
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'nItem', i.item_sequence,
             'cProd', coalesce(nullif(btrim(coalesce(i.source_item_id::text,'')),''), 'ITEM' || i.item_sequence::text),
             'xProd', i.description,
             'NCM', i.ncm_snapshot,
             'CEST', i.cest_snapshot,
             'CFOP', i.cfop_snapshot,
             'uCom', i.commercial_unit,
             'qCom', i.quantity,
             'vUnCom', i.unit_value,
             'vProd', coalesce(i.gross_value, i.quantity * i.unit_value),
             'vDesc', coalesce(i.discount_value,0),
             'vFrete', coalesce(i.freight_value,0),
             'vSeg', coalesce(i.insurance_value,0),
             'vOutro', coalesce(i.other_value,0),
             'orig', coalesce(i.origem_snapshot,'0'),
             'CST', i.cst_icms_snapshot,
             'CSOSN', i.csosn_snapshot,
             'taxSnapshot', i.tax_snapshot)
           ORDER BY i.item_sequence)
    INTO v_items
    FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) i
   WHERE i.fiscal_invoice_id = p_invoice_id;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NO_ITEMS: documento sem itens.';
  END IF;

  v_payload := jsonb_build_object(
    'engineVersion','F4.1',
    'schemaVersion', v_schema,
    'tpAmb', emit.nfe_environment_code,
    'accessKey', resv.access_key,
    'ide', jsonb_build_object(
      'cUF', left(resv.access_key,2),
      'cNF', resv.cnf,
      'natOp', coalesce(inv.nature_operation, 'VENDA'),
      'mod', '55',
      'serie', coalesce(srs.series, emit.nfe_series_number),
      'nNF', resv.number,
      'dhEmi', to_char(coalesce(inv.issue_date, current_date), 'YYYY-MM-DD'),
      'tpNF', CASE WHEN coalesce(inv.direction,'OUT') = 'OUT' THEN '1' ELSE '0' END,
      'idDest', CASE
                  WHEN upper(coalesce(dest.fiscal_state,'')) = upper(coalesce(emit.state,'')) THEN '1'
                  ELSE '2' END,
      'cMunFG', emit.municipality_ibge_code,
      'tpImp','1', 'tpEmis','1',
      'cDV', resv.check_digit::text,
      'finNFe', coalesce(inv.fin_nfe,'1'),
      'indFinal', CASE WHEN coalesce(dest.final_consumer,true) THEN '1' ELSE '0' END,
      'indPres','9', 'procEmi','0', 'verProc','ARBIO-F4.1'),
    'emit', jsonb_build_object(
      'CNPJ', public.fn_fiscal_digits(emit.cnpj),
      'xNome', emit.legal_name,
      'xFant', emit.trade_name,
      'IE', public.fn_fiscal_digits(coalesce(emit.state_registration,'')),
      'CRT', emit.crt,
      'CNAE', emit.primary_cnae,
      'enderEmit', jsonb_build_object(
        'xLgr', emit.street, 'nro', emit.number, 'xCpl', emit.complement,
        'xBairro', emit.neighborhood, 'cMun', emit.municipality_ibge_code,
        'xMun', emit.city, 'UF', emit.state,
        'CEP', public.fn_fiscal_digits(coalesce(emit.postal_code,'')),
        'cPais','1058','xPais','BRASIL')),
    'dest', jsonb_build_object(
      'personType', dest.person_type,
      'doc', public.fn_fiscal_digits(coalesce(dest.cpf_cnpj,'')),
      'xNome', dest.legal_name,
      'indIEDest', dest.taxpayer_indicator,
      'IE', public.fn_fiscal_digits(coalesce(dest.state_registration,'')),
      'enderDest', jsonb_build_object(
        'xLgr', dest.fiscal_street, 'nro', dest.fiscal_number, 'xCpl', dest.fiscal_complement,
        'xBairro', dest.fiscal_neighborhood, 'cMun', dest.fiscal_municipality_ibge_code,
        'xMun', dest.fiscal_city, 'UF', dest.fiscal_state,
        'CEP', public.fn_fiscal_digits(coalesce(dest.fiscal_postal_code,'')),
        'cPais','1058','xPais','BRASIL')),
    'det', v_items,
    'total', inv.fiscal_totals_snapshot,
    'infAdic', jsonb_build_object(
      'infCpl', 'AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'));

  IF public.fiscal_json_has_sensitive_key(v_payload) THEN
    RAISE EXCEPTION 'FISCAL_PAYLOAD_SENSITIVE: payload de XML contem chave sensivel.';
  END IF;

  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  SELECT * INTO existing FROM (SELECT * FROM public.fiscal_xml_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_xml_runs
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing.payload_sha256 <> v_hash THEN
      RAISE EXCEPTION 'FISCAL_XML_FINGERPRINT_MISMATCH: documento mudou apos o preparo; use nova chave de idempotencia.';
    END IF;
    RETURN jsonb_build_object(
      'runId', existing.id, 'state', existing.state, 'runVersion', existing.run_version,
      'schemaVersion', existing.schema_version, 'accessKey', existing.access_key,
      'payloadSha256', existing.payload_sha256, 'payload', existing.payload,
      'idempotentReplay', true);
  END IF;

  SELECT id, run_version INTO v_prev, v_version
    FROM (SELECT * FROM public.fiscal_xml_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_xml_runs
   WHERE fiscal_invoice_id = p_invoice_id
   ORDER BY run_version DESC LIMIT 1;

  IF v_prev IS NOT NULL AND EXISTS (
      SELECT 1 FROM (SELECT * FROM public.fiscal_xml_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_xml_runs
       WHERE fiscal_invoice_id = p_invoice_id AND state NOT IN ('SIGNED','FAILED')) THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_IN_PROGRESS: existe execucao em andamento para este documento.';
  END IF;

  INSERT INTO public.fiscal_xml_runs (
    fiscal_invoice_id, reservation_id, idempotency_key, run_version, previous_run_id,
    schema_version, environment_code, access_key, payload, payload_sha256, created_by)
  VALUES (
    p_invoice_id, resv.id, p_idempotency_key, coalesce(v_version,0) + 1, v_prev,
    v_schema, emit.nfe_environment_code, resv.access_key, v_payload, v_hash, auth.uid())
  RETURNING * INTO v_run;

  INSERT INTO public.fiscal_audit_log (table_name, record_id, action, changed_by, new_values)
  VALUES ('fiscal_xml_runs', v_run.id, 'XML_PREPARED', auth.uid(),
          jsonb_build_object('invoiceId', p_invoice_id, 'runVersion', v_run.run_version,
                             'payloadSha256', v_hash, 'schemaVersion', v_schema));

  RETURN jsonb_build_object(
    'runId', v_run.id, 'state', v_run.state, 'runVersion', v_run.run_version,
    'schemaVersion', v_run.schema_version, 'accessKey', v_run.access_key,
    'payloadSha256', v_run.payload_sha256, 'payload', v_run.payload,
    'idempotentReplay', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_xml_status_v1(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_runs jsonb;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM platform_private.fiscal_require_released_org();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF NOT public.fn_fiscal_can_read_internal(auth.uid()) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para consultar execucoes de XML.';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'runId', r.id, 'runVersion', r.run_version, 'state', r.state,
           'engineVersion', r.engine_version, 'schemaVersion', r.schema_version,
           'accessKey', r.access_key, 'environmentCode', r.environment_code,
           'payloadSha256', r.payload_sha256,
           'unsignedSha256', r.unsigned_sha256, 'unsignedBytes', r.unsigned_bytes,
           'signedSha256', r.signed_sha256, 'signedBytes', r.signed_bytes,
           'hasUnsigned', r.unsigned_path IS NOT NULL,
           'hasSigned', r.signed_path IS NOT NULL,
           'validation', r.validation, 'signature', r.signature_metadata,
           'errorCode', r.error_code,
           'preparedAt', r.prepared_at, 'generatedAt', r.generated_at,
           'validatedAt', r.validated_at, 'signedAt', r.signed_at, 'failedAt', r.failed_at)
           ORDER BY r.run_version DESC), '[]'::jsonb)
    INTO v_runs
    FROM (SELECT * FROM public.fiscal_xml_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) r
   WHERE r.fiscal_invoice_id = p_invoice_id;

  RETURN jsonb_build_object('invoiceId', p_invoice_id, 'ceiling','SIGNED', 'runs', v_runs);
END;
$function$;
