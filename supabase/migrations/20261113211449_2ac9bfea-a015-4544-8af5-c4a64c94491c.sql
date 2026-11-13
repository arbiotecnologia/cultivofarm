DO $pin$ BEGIN
  IF md5(pg_get_functiondef('public.rpc_fiscal_product_ibs_cbs_get(uuid)'::regprocedure)) <> '8836d752ceef08a76f76ef550dada0d8'
  OR md5(pg_get_functiondef('public.rpc_fiscal_product_ibs_cbs_save(uuid,jsonb,text)'::regprocedure)) <> '1cfd87c1c20db20547223dd081a22e76'
  THEN RAISE EXCEPTION 'PRE_PIN_MISMATCH'; END IF;
END $pin$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_product_ibs_cbs_get(p_product_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_owner uuid; v_found boolean; cfg jsonb; rev text;
BEGIN
 IF v_uid IS NULL OR p_product_id IS NULL THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT true, z.owner_organization_id INTO v_found, v_owner FROM public.produtos z WHERE z.id = p_product_id;
 IF v_found IS NOT TRUE THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF v_owner IS NULL THEN
   IF NOT platform_private.global_product_fiscal_read_ready() THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSIF NOT (platform_private.platform_actor_access_ready(v_uid) AND platform_private.tenant_fiscal_reader_org() IS NOT DISTINCT FROM v_owner) THEN
   RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT ibs_cbs_configuration, updated_at::text INTO cfg, rev FROM public.product_fiscal_profiles WHERE product_id = p_product_id AND is_active IS TRUE;
 RETURN jsonb_build_object('configuration',COALESCE(cfg,'{}'::jsonb),'revision',COALESCE(rev,''),'exists',rev IS NOT NULL);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_product_ibs_cbs_save(p_product_id uuid, payload jsonb, expected_revision text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_owner uuid; v_found boolean; v_org uuid; v_id uuid; v_stamp timestamptz; v_new text;
BEGIN
 IF v_uid IS NULL OR p_product_id IS NULL THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT true, z.owner_organization_id INTO v_found, v_owner FROM public.produtos z WHERE z.id = p_product_id;
 IF v_found IS NOT TRUE THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF v_owner IS NULL THEN
   RETURN platform_private.global_product_fiscal_ibs_save(p_product_id, payload, expected_revision);
 END IF;
 IF NOT platform_private.platform_actor_access_ready(v_uid) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_GATE_UNAVAILABLE' USING ERRCODE='55000'; END IF;
 v_org := platform_private.tenant_fiscal_mutate_org();
 SELECT z.owner_organization_id INTO v_owner FROM public.produtos z WHERE z.id = p_product_id FOR UPDATE;
 IF v_org IS NULL OR v_owner IS DISTINCT FROM v_org
    OR NOT platform_private.platform_actor_access_ready(v_uid)
    OR NOT (platform_private.has_role(v_uid,'administrador'::public.app_role) OR platform_private.has_role(v_uid,'gestor'::public.app_role))
    OR platform_private.tenant_fiscal_mutate_org() IS DISTINCT FROM v_org THEN
   RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM public._fiscal_rtc_assert_payload(payload,'item');
 SELECT f.id, f.updated_at INTO v_id, v_stamp FROM public.product_fiscal_profiles f
  WHERE f.product_id = p_product_id AND f.is_active IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_ITEM_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 IF expected_revision IS NULL OR expected_revision IS DISTINCT FROM v_stamp::text THEN RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='PT409'; END IF;
 UPDATE public.product_fiscal_profiles SET ibs_cbs_configuration = payload,
        updated_at = greatest(clock_timestamp(), v_stamp + interval '1 microsecond'), updated_by = v_uid
  WHERE id = v_id AND product_id = p_product_id AND is_active IS TRUE AND updated_at = v_stamp
  RETURNING updated_at::text INTO v_new;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('configuration', payload, 'revision', v_new);
END $function$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_product_ibs_cbs_get(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_fiscal_product_ibs_cbs_save(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_product_ibs_cbs_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_product_ibs_cbs_save(uuid,jsonb,text) TO authenticated;