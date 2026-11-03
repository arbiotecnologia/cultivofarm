"""11e. CRUD por empresa das raízes auxiliares e perfis técnicos — escrita SOMENTE por RPC (CAS + idempotência).

Raízes: microrganismos, culturas, catalogo_volumes; perfis técnicos (produto/microrganismo, por pai);
formulações como CONJUNTO por produto (substituição atômica com CAS do produto — substitui o delete+insert com
compensação do cliente). Regras:
- tenant SEMPRE derivado no servidor (catalog_tenant_actor('mutate')); reautorização após o lock da linha;
- campos por allowlist gerada das colunas REAIS capturadas; sistema/validação/dono nunca vêm do payload;
- referências a produtos/microrganismos/culturas no payload precisam pertencer à mesma empresa;
- CAS por updated_at (token do servidor estritamente crescente); recibo idempotente por (ator, empresa, chave);
- perfis técnicos nunca recebem status/validação pelo payload (aprovação segue approve_*_with_audit cercado);
- escrita direta de cliente (INSERT/UPDATE/DELETE) nessas tabelas é revogada.
"""

SYSTEM = {"id", "owner_organization_id", "created_at", "updated_at", "created_by", "updated_by"}
ROOTS = {
    "microrganismos": dict(kind="root", deny=set(), refs={"product_id": "produtos"}, safe={"b2b_enabled": "false"}),
    "culturas": dict(kind="root", deny={"desativada_em", "desativada_por"}, refs={}, safe={}),
    "catalogo_volumes": dict(kind="root", deny=set(), refs={"produto_id": "produtos", "microrganismo_id": "microrganismos"}, safe={}),
    "product_technical_profiles": dict(kind="profile", parent=("produto_id", "produtos"),
                                       deny={"status_validacao", "validado_por", "validado_em"}, refs={}, safe={}),
    "microorganism_technical_profiles": dict(kind="profile", parent=("microrganismo_id", "microrganismos"),
                                             deny={"status_validacao", "validado_por", "validado_em"}, refs={}, safe={}),
}
FORM_COLS = ["microrganismo_id", "component_insumo_id", "concentracao", "unidade", "volume_ml", "proporcao", "e_volume_fixo"]


def allowlists(columns):
    out = {}
    for t, cfg in ROOTS.items():
        cols = [c["column_name"] for c in columns if c["table_name"] == t]
        out[t] = [c for c in cols if c not in SYSTEM and c not in cfg["deny"]]
    return out


def crud_sql(w, ledger, lit, columns):
    allow = allowlists(columns)
    cfg_rows = []
    for t, cfg in ROOTS.items():
        parent_col, parent_tbl = cfg.get("parent", (None, None))
        refs = dict(cfg["refs"]); 
        if parent_col: refs[parent_col] = parent_tbl
        cfg_rows.append("(" + ",".join([lit(t), lit(cfg["kind"]), "ARRAY[" + ",".join(lit(c) for c in allow[t]) + "]::text[]",
                                         lit(parent_col or ""), lit(parent_tbl or ""),
                                         "'" + str({k: v for k, v in refs.items()}).replace("'", '"') + "'::jsonb",
                                         "'" + str(cfg["safe"]).replace("'", '"') + "'::jsonb"]) + ")")
    w(f"""CREATE TABLE platform_private.tenant_catalog_root_cfg(
  root text PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('root','profile')), allowed text[] NOT NULL,
  parent_col text NOT NULL, parent_tbl text NOT NULL, refs jsonb NOT NULL, safe_defaults jsonb NOT NULL);
INSERT INTO platform_private.tenant_catalog_root_cfg VALUES {",".join(cfg_rows)};
REVOKE ALL ON platform_private.tenant_catalog_root_cfg FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE platform_private.tenant_catalog_root_receipts(
  actor_id uuid NOT NULL, organization_id uuid NOT NULL, idempotency_key uuid NOT NULL, payload_hash text NOT NULL,
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (actor_id, organization_id, idempotency_key));
REVOKE ALL ON platform_private.tenant_catalog_root_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION platform_private.tenant_catalog_ref_owner(p_tbl text, p_id uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v uuid;
BEGIN
  IF p_tbl NOT IN ('produtos','microrganismos','culturas') THEN RAISE EXCEPTION 'tenant_catalog_ref_table' USING ERRCODE='22023'; END IF;
  EXECUTE format('SELECT owner_organization_id FROM public.%I WHERE id = $1 FOR SHARE', p_tbl) INTO v USING p_id;
  RETURN v;
END $f$;
REVOKE ALL ON FUNCTION platform_private.tenant_catalog_ref_owner(text,uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION platform_private.tenant_catalog_receipt(p_org uuid, p_key uuid, p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v platform_private.tenant_catalog_root_receipts%ROWTYPE;
BEGIN
  IF p_key IS NULL THEN RAISE EXCEPTION 'tenant_catalog_key_required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tcr',auth.uid(),p_org,p_key),0));
  SELECT * INTO v FROM platform_private.tenant_catalog_root_receipts WHERE actor_id=auth.uid() AND organization_id=p_org AND idempotency_key=p_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v.payload_hash <> p_hash THEN RAISE EXCEPTION 'tenant_catalog_idempotency_conflict' USING ERRCODE='PT409'; END IF;
  RETURN v.result || jsonb_build_object('replayed', true);
END $f$;
REVOKE ALL ON FUNCTION platform_private.tenant_catalog_receipt(uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.tenant_catalog_root_save(p_root text, p_id uuid, p_payload jsonb, p_expected_updated_at timestamptz, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_org2 uuid; v_cfg platform_private.tenant_catalog_root_cfg%ROWTYPE;
  k text; v_hash text; v_rep jsonb; v_cols text[] := '{{}}'; v_row jsonb; v_prev jsonb; v_parent uuid; v_ref uuid; v_ts timestamptz;
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
END $f$;

CREATE FUNCTION public.tenant_catalog_root_delete(p_root text, p_id uuid, p_expected_updated_at timestamptz, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_hash text; v_rep jsonb; v_prev jsonb; v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  v_org := platform_private.catalog_tenant_actor('mutate');
  IF p_root NOT IN ('microrganismos','culturas','catalogo_volumes') THEN RAISE EXCEPTION 'tenant_catalog_root_invalid' USING ERRCODE='22023'; END IF;
  IF p_id IS NULL OR p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'tenant_catalog_cas_required' USING ERRCODE='PT409'; END IF;
  v_hash := md5(concat_ws('|', 'delete', p_root, p_id::text, p_expected_updated_at::text));
  v_rep := platform_private.tenant_catalog_receipt(v_org, p_idempotency_key, v_hash);
  IF v_rep IS NOT NULL THEN RETURN v_rep; END IF;
  EXECUTE format('SELECT to_jsonb(x.*) FROM public.%I x WHERE x.id = $1 FOR UPDATE', p_root) INTO v_prev USING p_id;
  IF v_prev IS NULL OR (v_prev->>'owner_organization_id')::uuid IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_catalog_not_found' USING ERRCODE='P0002'; END IF;
  IF platform_private.catalog_tenant_actor('mutate') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_catalog_actor_changed' USING ERRCODE='42501'; END IF;
  IF (v_prev->>'updated_at')::timestamptz IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'tenant_catalog_stale' USING ERRCODE='PT409'; END IF;
  BEGIN
    EXECUTE format('DELETE FROM public.%I WHERE id = $1', p_root) USING p_id;
  EXCEPTION WHEN foreign_key_violation THEN RAISE EXCEPTION 'tenant_catalog_in_use' USING ERRCODE='PT409';
  END;
  v_row := jsonb_build_object('ok', true, 'root', p_root, 'id', p_id, 'deleted', true, 'organization_id', v_org, 'replayed', false);
  INSERT INTO platform_private.tenant_catalog_root_receipts VALUES (v_uid, v_org, p_idempotency_key, v_hash, v_row);
  RETURN v_row;
END $f$;

CREATE FUNCTION public.tenant_catalog_formulacoes_replace(p_produto_id uuid, p_items jsonb, p_expected_produto_updated_at timestamptz, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_hash text; v_rep jsonb; v_prev public.produtos%ROWTYPE; it jsonb; k text; v_n int := 0; v_ts timestamptz; v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  v_org := platform_private.catalog_tenant_actor('mutate');
  IF p_produto_id IS NULL OR p_expected_produto_updated_at IS NULL THEN RAISE EXCEPTION 'tenant_catalog_cas_required' USING ERRCODE='PT409'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 50 THEN RAISE EXCEPTION 'tenant_catalog_payload_invalid' USING ERRCODE='22023'; END IF;
  v_hash := md5(concat_ws('|', 'formulacoes', p_produto_id::text, p_items::text, p_expected_produto_updated_at::text));
  v_rep := platform_private.tenant_catalog_receipt(v_org, p_idempotency_key, v_hash);
  IF v_rep IS NOT NULL THEN RETURN v_rep; END IF;
  SELECT * INTO v_prev FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND OR v_prev.owner_organization_id IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_catalog_not_found' USING ERRCODE='P0002'; END IF;
  IF platform_private.catalog_tenant_actor('mutate') IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_catalog_actor_changed' USING ERRCODE='42501'; END IF;
  IF v_prev.updated_at IS DISTINCT FROM p_expected_produto_updated_at THEN RAISE EXCEPTION 'tenant_catalog_stale' USING ERRCODE='PT409'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(it) <> 'object' THEN RAISE EXCEPTION 'tenant_catalog_payload_invalid' USING ERRCODE='22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(it) LOOP
      IF NOT k = ANY (ARRAY[{",".join(lit(c) for c in FORM_COLS)}]) THEN RAISE EXCEPTION 'tenant_catalog_field_forbidden:%', k USING ERRCODE='22023'; END IF;
    END LOOP;
    IF it ? 'microrganismo_id' AND jsonb_typeof(it->'microrganismo_id') <> 'null'
       AND platform_private.tenant_catalog_ref_owner('microrganismos', (it->>'microrganismo_id')::uuid) IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'tenant_catalog_ref_foreign:microrganismo_id' USING ERRCODE='42501'; END IF;
    IF it ? 'component_insumo_id' AND jsonb_typeof(it->'component_insumo_id') <> 'null'
       AND platform_private.tenant_catalog_ref_owner('produtos', (it->>'component_insumo_id')::uuid) IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'tenant_catalog_ref_foreign:component_insumo_id' USING ERRCODE='42501'; END IF;
  END LOOP;
  DELETE FROM public.formulacoes WHERE produto_id = p_produto_id;
  INSERT INTO public.formulacoes(produto_id, owner_organization_id, {", ".join(FORM_COLS)})
    SELECT p_produto_id, v_org, {", ".join("r." + c for c in FORM_COLS)}
      FROM jsonb_array_elements(p_items) e, jsonb_populate_record(NULL::public.formulacoes, e.value) r;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_ts := greatest(clock_timestamp(), v_prev.updated_at + interval '1 microsecond');
  UPDATE public.produtos SET updated_at = v_ts WHERE id = p_produto_id;
  v_row := jsonb_build_object('ok', true, 'produto_id', p_produto_id, 'items', v_n, 'updated_at', v_ts, 'organization_id', v_org, 'replayed', false);
  INSERT INTO platform_private.tenant_catalog_root_receipts VALUES (v_uid, v_org, p_idempotency_key, v_hash, v_row);
  RETURN v_row;
END $f$;
REVOKE ALL ON FUNCTION public.tenant_catalog_root_save(text,uuid,jsonb,timestamptz,uuid), public.tenant_catalog_root_delete(text,uuid,timestamptz,uuid),
  public.tenant_catalog_formulacoes_replace(uuid,jsonb,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_root_save(text,uuid,jsonb,timestamptz,uuid), public.tenant_catalog_root_delete(text,uuid,timestamptz,uuid),
  public.tenant_catalog_formulacoes_replace(uuid,jsonb,timestamptz,uuid) TO authenticated;
-- escrita direta de cliente fechada (leitura por RLS preservada)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.microrganismos, public.culturas, public.catalogo_volumes, public.formulacoes,
  public.product_technical_profiles, public.microorganism_technical_profiles FROM PUBLIC, anon, authenticated;
INSERT INTO {ledger}(step, detail) VALUES ('tenant_catalog_crud', jsonb_build_object('roots', {lit(",".join(ROOTS))}, 'formulacoes', 'replace_set'));""")
