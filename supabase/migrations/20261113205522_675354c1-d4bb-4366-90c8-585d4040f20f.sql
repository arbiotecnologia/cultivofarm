-- IBS/CBS: microrganismo comercializável, faturamento novo de serviços e preparo NF-e real (homologação).
ALTER TABLE public.microorganism_fiscal_profiles ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;

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

-- Substituição pontual pinada: lê o corpo live exato (md5), aplica trechos e executa; aborta se divergir.
DO $patch$
DECLARE d text; n text; acl_c text; acl_p text;
BEGIN
  d := pg_get_functiondef('public.rpc_service_billing_create_draft_v1(uuid[],text)'::regprocedure);
  IF md5(d) <> 'adaa8f2eb7bbc2c7c6dba3474a298859' THEN RAISE EXCEPTION 'PRE_PIN_MISMATCH:create_draft %', md5(d); END IF;
  SELECT proacl::text INTO acl_c FROM pg_proc WHERE oid = 'public.rpc_service_billing_create_draft_v1(uuid[],text)'::regprocedure;
  n := replace(d, E'p.iss_rate, p.iss_withheld_default, p.fiscal_description_template\n', E'p.iss_rate, p.iss_withheld_default, p.fiscal_description_template, p.ibs_cbs_configuration p_ibs\n');
  n := replace(n, E'''municipality_ibge_code'', r.incidence_municipality_ibge_code)),', E'''municipality_ibge_code'', r.incidence_municipality_ibge_code,\n          ''ibs_cbs'', nullif(r.p_ibs,''{}''::jsonb))),');
  IF (length(n) - length(replace(n,'p_ibs',''))) / 5 <> 2 THEN RAISE EXCEPTION 'PATCH_ANCHOR_MISSING:create_draft'; END IF;
  EXECUTE n;
  IF (SELECT proacl::text FROM pg_proc WHERE oid = 'public.rpc_service_billing_create_draft_v1(uuid[],text)'::regprocedure) IS DISTINCT FROM acl_c THEN RAISE EXCEPTION 'ACL_CHANGED:create_draft'; END IF;

  d := pg_get_functiondef('public.rpc_fiscal_xml_prepare_v1(uuid,text)'::regprocedure);
  IF md5(d) <> '90424a27eef4dcc8638a8aa204a259ce' THEN RAISE EXCEPTION 'PRE_PIN_MISMATCH:xml_prepare %', md5(d); END IF;
  SELECT proacl::text INTO acl_p FROM pg_proc WHERE oid = 'public.rpc_fiscal_xml_prepare_v1(uuid,text)'::regprocedure;
  n := replace(d, E'''taxSnapshot'', i.tax_snapshot)\n           ORDER BY i.item_sequence)', E'''taxSnapshot'', i.tax_snapshot)\n           || CASE WHEN x.cfg IS NULL THEN ''{}''::jsonb ELSE jsonb_build_object(''ibsCbsConfig'', x.cfg) END\n           ORDER BY i.item_sequence)');
  n := replace(n, E'fiscal_invoice_id)) i\n   WHERE i.fiscal_invoice_id = p_invoice_id;', E'fiscal_invoice_id)) i\n    LEFT JOIN LATERAL (SELECT platform_private.fiscal_nfe_item_ibs_cbs_config_v1(i.source_item_type, i.source_item_id, inv.organization_id) cfg) x ON true\n   WHERE i.fiscal_invoice_id = p_invoice_id;');
  n := replace(n, E'''verProc'',''ARBIO-F4.1''),', E'''verProc'',''ARBIO-F4.1'')\n      || CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) e WHERE e ? ''ibsCbsConfig'') THEN jsonb_build_object(''rtcIbsCbs'', true) ELSE ''{}''::jsonb END,');
  IF (length(n) - length(replace(n,'ibsCbsConfig',''))) / 12 <> 2 OR position('LATERAL' in n) = 0 THEN RAISE EXCEPTION 'PATCH_ANCHOR_MISSING:xml_prepare'; END IF;
  EXECUTE n;
  IF (SELECT proacl::text FROM pg_proc WHERE oid = 'public.rpc_fiscal_xml_prepare_v1(uuid,text)'::regprocedure) IS DISTINCT FROM acl_p THEN RAISE EXCEPTION 'ACL_CHANGED:xml_prepare'; END IF;
END $patch$;