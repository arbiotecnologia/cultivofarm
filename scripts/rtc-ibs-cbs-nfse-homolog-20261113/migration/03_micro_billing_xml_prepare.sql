-- IBS/CBS: microrganismo comercializável, faturamento novo de serviços e preparo NF-e real (homologação).
-- PRE pins: corpo live exato (md5) das duas funções substituídas; aborta se divergir.
DO $pre$ BEGIN
  IF md5(pg_get_functiondef('public.rpc_service_billing_create_draft_v1(uuid[],text)'::regprocedure)) <> 'adaa8f2eb7bbc2c7c6dba3474a298859' THEN RAISE EXCEPTION 'PRE_PIN_MISMATCH:create_draft'; END IF;
  IF md5(pg_get_functiondef('public.rpc_fiscal_xml_prepare_v1(uuid,text)'::regprocedure)) <> '90424a27eef4dcc8638a8aa204a259ce' THEN RAISE EXCEPTION 'PRE_PIN_MISMATCH:xml_prepare'; END IF;
END $pre$;

ALTER TABLE public.microorganism_fiscal_profiles ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Resolve no servidor o IBS/CBS do item NF-e (perfil do produto e/ou do microrganismo comercializável
-- ligado ao produto). Divergência entre perfis falha fechado; ausência -> NULL (payload inalterado).
CREATE OR REPLACE FUNCTION platform_private.fiscal_nfe_item_ibs_cbs_config_v1(p_type text, p_source uuid, p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' AS $f$
DECLARE v_prod jsonb; v_micro jsonb; v_n int;
BEGIN
  IF p_source IS NULL THEN RETURN NULL; END IF;
  IF upper(coalesce(p_type,'')) IN ('MICROORGANISM','MICROORGANISMO','MICRORGANISMO') THEN
    SELECT nullif(f.ibs_cbs_configuration,'{}'::jsonb) INTO v_micro
      FROM public.microorganism_fiscal_profiles f JOIN public.microrganismos m ON m.id = f.microorganism_id
     WHERE f.microorganism_id = p_source AND f.is_active AND (m.owner_organization_id IS NULL OR m.owner_organization_id = p_org);
    RETURN v_micro;
  END IF;
  SELECT nullif(pf.ibs_cbs_configuration,'{}'::jsonb) INTO v_prod
    FROM public.product_fiscal_profiles pf WHERE pf.product_id = p_source AND pf.is_active LIMIT 1;
  SELECT count(DISTINCT f.ibs_cbs_configuration), min(f.ibs_cbs_configuration::text)::jsonb INTO v_n, v_micro
    FROM public.microorganism_fiscal_profiles f JOIN public.microrganismos m ON m.id = f.microorganism_id
   WHERE m.product_id = p_source AND f.is_active AND f.ibs_cbs_configuration <> '{}'::jsonb
     AND (m.owner_organization_id IS NULL OR m.owner_organization_id = p_org);
  IF v_n > 1 OR (v_n = 1 AND v_prod IS NOT NULL AND v_prod <> v_micro) THEN
    RAISE EXCEPTION 'FISCAL_IBS_CBS_PROFILE_CONFLICT: perfis IBS/CBS divergentes para o item %', p_source USING ERRCODE = '22023';
  END IF;
  RETURN coalesce(v_prod, CASE WHEN v_n = 1 THEN v_micro END);
END $f$;
REVOKE ALL ON FUNCTION platform_private.fiscal_nfe_item_ibs_cbs_config_v1(text,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_microorganism_ibs_cbs_get(p_microorganism_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO '' AS $f$
DECLARE cfg jsonb; rev text; BEGIN
 IF NOT platform_private.global_product_fiscal_read_ready() THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT ibs_cbs_configuration, updated_at::text INTO cfg, rev FROM public.microorganism_fiscal_profiles WHERE microorganism_id = p_microorganism_id AND is_active IS TRUE;
 RETURN jsonb_build_object('configuration',COALESCE(cfg,'{}'::jsonb),'revision',COALESCE(rev,''),'exists',rev IS NOT NULL);
END $f$;
REVOKE ALL ON FUNCTION public.rpc_fiscal_microorganism_ibs_cbs_get(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_microorganism_ibs_cbs_get(uuid) TO authenticated;

-- Escrita: global -> superadmin da plataforma; próprio -> administrador/financeiro da organização dona
-- (mesma autoridade das políticas de escrita existentes). Gate travado antes da linha; CAS por updated_at.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_microorganism_ibs_cbs_save(p_microorganism_id uuid, payload jsonb, expected_revision text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $f$
DECLARE v_uid uuid := auth.uid(); v_owner uuid; v_id uuid; v_stamp timestamptz; v_new text;
BEGIN
 IF v_uid IS NULL OR NOT platform_private.platform_actor_access_ready(v_uid) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_GATE_UNAVAILABLE' USING ERRCODE='55000'; END IF;
 IF NOT platform_private.platform_actor_access_ready(v_uid) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM public._fiscal_rtc_assert_payload(payload,'item');
 SELECT f.id, f.updated_at, m.owner_organization_id INTO v_id, v_stamp, v_owner
   FROM public.microorganism_fiscal_profiles f JOIN public.microrganismos m ON m.id = f.microorganism_id
  WHERE f.microorganism_id = p_microorganism_id AND f.is_active IS TRUE FOR UPDATE OF f;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_ITEM_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 IF v_owner IS NULL THEN
   IF NOT public.is_platform_superadmin(v_uid) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSIF NOT (v_owner = public.h15_actor_organization() AND platform_private.fiscal_org_released(v_owner)
           AND (platform_private.has_role(v_uid,'administrador'::app_role) OR platform_private.has_role(v_uid,'financeiro'::app_role))) THEN
   RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF expected_revision IS NULL OR expected_revision IS DISTINCT FROM v_stamp::text THEN RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='PT409'; END IF;
 UPDATE public.microorganism_fiscal_profiles SET ibs_cbs_configuration = payload, updated_at = greatest(clock_timestamp(), v_stamp + interval '1 microsecond'), updated_by = v_uid
  WHERE id = v_id AND is_active IS TRUE AND updated_at = v_stamp RETURNING updated_at::text INTO v_new;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('configuration', payload, 'revision', v_new);
END $f$;
REVOKE ALL ON FUNCTION public.rpc_fiscal_microorganism_ibs_cbs_save(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_microorganism_ibs_cbs_save(uuid,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_service_billing_create_draft_v1(p_engagement_ids uuid[], p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_ids uuid[];
  v_hash text;
  v_req public.service_billing_requests;
  v_count int;
  v_customers int;
  v_customer uuid;
  v_items jsonb := '[]'::jsonb;
  v_env text;
  v_res jsonb;
  v_invoice uuid;
  v_dps jsonb;
  r record;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform public.h15_require_staff();
  perform platform_private.fiscal_require_released_org();
  if not (public.has_role(v_user,'administrador'::app_role) or public.has_role(v_user,'financeiro'::app_role)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  v_org := public.h15_actor_organization();
  if v_org is null then raise exception 'H15_ORGANIZATION_FORBIDDEN' using errcode = '42501'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 128 or p_idempotency_key !~ '^[A-Za-z0-9_.:-]+$' then
    raise exception 'idempotency_key_invalid' using errcode = '22023';
  end if;
  select array_agg(distinct x order by x) into v_ids from unnest(coalesce(p_engagement_ids,'{}'::uuid[])) x where x is not null;
  if v_ids is null or array_length(v_ids,1) < 1 or array_length(v_ids,1) > 200 then
    raise exception 'engagements_required' using errcode = '22023';
  end if;
  v_hash := md5(array_to_string(v_ids, ','));

  perform pg_advisory_xact_lock(hashtextextended(v_org::text || '|' || p_idempotency_key, 0));
  select * into v_req from public.service_billing_requests where organization_id = v_org and idempotency_key = p_idempotency_key;
  if found then
    if v_req.request_hash <> v_hash then raise exception 'idempotency_key_reused' using errcode = 'PT409'; end if;
    return jsonb_build_object('invoice_id', v_req.fiscal_invoice_id, 'replayed', true);
  end if;

  perform 1 from public.service_engagements where id = any(v_ids) and organization_id = v_org order by id for update;
  select count(*), count(distinct customer_id), min(customer_id::text)::uuid into v_count, v_customers, v_customer
    from public.service_engagements where id = any(v_ids) and organization_id = v_org;
  if v_count <> array_length(v_ids,1) then raise exception 'engagement_not_found' using errcode = 'P0002'; end if;
  if v_customers <> 1 then raise exception 'engagements_mixed_customers' using errcode = '22023'; end if;
  if exists (select 1 from public.service_engagements where id = any(v_ids) and status <> 'READY') then
    raise exception 'engagement_not_ready' using errcode = 'PT409';
  end if;

  for r in
    select e.*, s.name s_name, s.unit s_unit, s.is_active s_active, p.id p_id, p.lc116_item, p.cnae, p.municipal_taxation_code, p.national_taxation_code,
           p.incidence_municipality_ibge_code, p.iss_rate, p.iss_withheld_default, p.fiscal_description_template, p.ibs_cbs_configuration p_ibs
      from public.service_engagements e
      join public.catalog_services s on s.id = e.service_id and s.organization_id = e.organization_id
      left join public.service_fiscal_profiles p on p.service_id = e.service_id and p.organization_id = e.organization_id and p.is_active
     where e.id = any(v_ids) order by e.performed_on, e.id
  loop
    if r.p_id is null then raise exception 'service_fiscal_profile_missing:%', r.service_id using errcode = 'P0002'; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'item_kind','SERVICE',
      'description', coalesce(nullif(btrim(r.description),''), nullif(btrim(r.fiscal_description_template),''), r.s_name),
      'quantity', r.quantity, 'unit_value', r.unit_price, 'discount_value', 0,
      'commercial_unit', r.s_unit, 'source_item_type','SERVICE', 'source_item_id', r.service_id,
      'fiscal_profile_snapshot', jsonb_strip_nulls(jsonb_build_object('lc116_item', r.lc116_item, 'cnae', r.cnae,
          'municipal_tax_code', r.municipal_taxation_code, 'national_tax_code', r.national_taxation_code,
          'municipality_ibge_code', r.incidence_municipality_ibge_code,
          'ibs_cbs', nullif(r.p_ibs,'{}'::jsonb))),
      'tax_snapshot', jsonb_strip_nulls(jsonb_build_object('iss_rate', r.iss_rate, 'iss_withheld', r.iss_withheld_default)),
      'tax_input_snapshot', '{}'::jsonb));
  end loop;

  v_dps := platform_private.service_nfse_dps_snapshot_v1(v_org, (select array_agg(distinct service_id) from public.service_engagements where id = any(v_ids)));

  select case when upper(coalesce(fiscal_environment,'')) in ('HOMOLOGATION','HOMOLOGACAO') then 'HOMOLOGATION' else 'NOT_CONFIGURED' end
    into v_env from public.company_fiscal_settings where organization_id = v_org and is_active order by updated_at desc limit 1;

  v_res := public.rpc_fiscal_draft_save(null, jsonb_build_object(
      'invoice_type','NFSE','document_model','NFSE','environment', coalesce(v_env,'NOT_CONFIGURED'),
      'customer_id', v_customer, 'issue_date', current_date::text,
      'fiscal_profile_snapshot', case when v_dps is null then '{}'::jsonb else jsonb_build_object('nfse_dps', v_dps) end,
      'notes', 'Faturamento de serviços prestados (' || array_length(v_ids,1) || ' registro(s))'),
    v_items, null);
  v_invoice := (v_res->>'id')::uuid;
  if v_invoice is null then raise exception 'draft_not_created' using errcode = 'P0001'; end if;

  update public.service_engagements set status = 'BILLED', fiscal_invoice_id = v_invoice, billed_at = now()
   where id = any(v_ids) and organization_id = v_org and status = 'READY';
  get diagnostics v_count = row_count;
  if v_count <> array_length(v_ids,1) then raise exception 'engagement_state_changed' using errcode = 'PT409'; end if;

  insert into public.service_billing_requests(organization_id, idempotency_key, request_hash, engagement_ids, fiscal_invoice_id, created_by)
  values (v_org, p_idempotency_key, v_hash, v_ids, v_invoice, v_user);
  return jsonb_build_object('invoice_id', v_invoice, 'replayed', false, 'total_amount', v_res->'total_amount');
end $function$;

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
           || CASE WHEN x.cfg IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('ibsCbsConfig', x.cfg) END
           ORDER BY i.item_sequence)
    INTO v_items
    FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) i
    LEFT JOIN LATERAL (SELECT platform_private.fiscal_nfe_item_ibs_cbs_config_v1(i.source_item_type, i.source_item_id, inv.organization_id) cfg) x ON true
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
      'indPres','9', 'procEmi','0', 'verProc','ARBIO-F4.1')
      || CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) e WHERE e ? 'ibsCbsConfig') THEN jsonb_build_object('rtcIbsCbs', true) ELSE '{}'::jsonb END,
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
