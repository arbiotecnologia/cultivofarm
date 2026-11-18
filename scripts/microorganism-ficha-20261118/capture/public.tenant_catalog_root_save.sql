CREATE OR REPLACE FUNCTION public.tenant_catalog_root_save(p_root text, p_id uuid, p_payload jsonb, p_expected_updated_at timestamp with time zone, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_org2 uuid; v_cfg platform_private.tenant_catalog_root_cfg%ROWTYPE;
  k text; v_hash text; v_rep jsonb; v_cols text[] := '{}'; v_row jsonb; v_prev jsonb; v_parent uuid; v_ref uuid; v_ts timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  v_org := platform_private.catalog_tenant_actor('mutate');
  SELECT * INTO v_cfg FROM platform_private.tenant_catalog_root_cfg WHERE root = p_root;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant_catalog_root_invalid' USING ERRCODE='22023'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'tenant_catalog_payload_invalid' USING ERRCODE='22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_payload) LOOP
    IF NOT k = ANY (v_cfg.allowed) THEN RAISE EXCEPTION 'tenant_catalog_field_forbidden:%', k USING ERRCODE='22023'; END IF;
    v_cols := v_cols || k;
  END LOOP;
  IF p_id IS NOT NULL AND p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'tenant_catalog_cas_required' USING ERRCODE='PT409'; END IF;
  v_hash := md5(concat_ws('|', p_root, coalesce(p_id::text,'new'), p_payload::text, coalesce(p_expected_updated_at::text,'')));
  v_rep := platform_private.tenant_catalog_receipt(v_org, p_idempotency_key, v_hash);
  IF v_rep IS NOT NULL THEN RETURN v_rep; END IF;
  -- referências no payload: mesma empresa (FOR SHARE no pai)
  FOR k IN SELECT jsonb_object_keys(v_cfg.refs) LOOP
    IF p_payload ? k AND jsonb_typeof(p_payload->k) <> 'null' THEN
      v_ref := platform_private.tenant_catalog_ref_owner(v_cfg.refs->>k, (p_payload->>k)::uuid);
      IF v_ref IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_catalog_ref_foreign:%', k USING ERRCODE='42501'; END IF;
    END IF;
  END LOOP;
  IF p_id IS NULL THEN
    IF v_cfg.kind = 'profile' AND NOT p_payload ? v_cfg.parent_col THEN RAISE EXCEPTION 'tenant_catalog_parent_required' USING ERRCODE='22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(v_cfg.safe_defaults) LOOP
      IF NOT p_payload ? k THEN p_payload := p_payload || jsonb_build_object(k, v_cfg.safe_defaults->k); v_cols := v_cols || k; END IF;
    END LOOP;
    IF v_cfg.kind = 'root' THEN p_payload := p_payload || jsonb_build_object('owner_organization_id', v_org); v_cols := v_cols || 'owner_organization_id'::text; END IF;
    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) r RETURNING to_jsonb(%I.*)',
      p_root, (SELECT string_agg(quote_ident(c), ',') FROM unnest(v_cols) c),
      (SELECT string_agg('r.' || quote_ident(c), ',') FROM unnest(v_cols) c), p_root, p_root) INTO v_row USING p_payload;
  ELSE
    IF v_cfg.kind = 'profile' AND p_payload ? v_cfg.parent_col THEN RAISE EXCEPTION 'tenant_catalog_parent_immutable' USING ERRCODE='22023'; END IF;
    EXECUTE format('SELECT to_jsonb(x.*) FROM public.%I x WHERE x.id = $1 FOR UPDATE', p_root) INTO v_prev USING p_id;
    IF v_prev IS NULL THEN RAISE EXCEPTION 'tenant_catalog_not_found' USING ERRCODE='P0002'; END IF;
    -- reautorização após a espera do lock (troca de empresa/revogação durante a espera nega)
    v_org2 := platform_private.catalog_tenant_actor('mutate');
    IF v_org2 IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_catalog_actor_changed' USING ERRCODE='42501'; END IF;
    v_parent := CASE WHEN v_cfg.kind = 'root' THEN (v_prev->>'owner_organization_id')::uuid
                     ELSE platform_private.tenant_catalog_ref_owner(v_cfg.parent_tbl, (v_prev->>v_cfg.parent_col)::uuid) END;
    IF v_parent IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_catalog_not_found' USING ERRCODE='P0002'; END IF;
    IF (v_prev->>'updated_at')::timestamptz IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'tenant_catalog_stale' USING ERRCODE='PT409'; END IF;
    v_ts := greatest(clock_timestamp(), (v_prev->>'updated_at')::timestamptz + interval '1 microsecond');
    EXECUTE format('UPDATE public.%I x SET %s updated_at = $3 FROM jsonb_populate_record(NULL::public.%I, $1) r WHERE x.id = $2 RETURNING to_jsonb(x.*)',
      p_root, coalesce((SELECT string_agg(quote_ident(c) || ' = r.' || quote_ident(c), ', ') || ',' FROM unnest(v_cols) c), ''), p_root)
      INTO v_row USING p_payload, p_id, v_ts;
  END IF;
  v_row := jsonb_build_object('ok', true, 'root', p_root, 'id', v_row->>'id', 'updated_at', v_row->>'updated_at',
                              'organization_id', v_org, 'replayed', false);
  INSERT INTO platform_private.tenant_catalog_root_receipts VALUES (v_uid, v_org, p_idempotency_key, v_hash, v_row);
  RETURN v_row;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'tenant_catalog_duplicate' USING ERRCODE='PT409';
END $function$;
