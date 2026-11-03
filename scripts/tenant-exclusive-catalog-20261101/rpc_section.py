"""Seção RPC/ACL do produto e fechamento do catálogo global (reaproveitada da v1, sem alteração semântica)."""
# v2.1: modo do ator LIVE corrigido ('read' inexistente no corpo capturado -> 'read_catalog').


def lit(s): return "'" + s.replace("'", "''") + "'"


def rpc_sql(w, EDITABLE, GLOBAL_FUNCS):
    # 10. RPCs
    fields = ", ".join(lit(k) for k in EDITABLE)
    assigns = ",\n      ".join(
        f"{k} = CASE WHEN p_payload ? '{k}' THEN v_in.{k} ELSE {k} END" for k, v in EDITABLE.items())
    cols = ", ".join(EDITABLE)
    # valores TIPADOS pela linha real (enum tipo_produto etc.); omitidos usam default seguro explícito
    #   b2b_enabled omitido = false (o default LIVE da coluna é true: criação nunca libera B2B implicitamente)
    SAFE_DEFAULT = {"b2b_enabled": "false", "e_insumo": "false", "estoque_minimo": "0"}
    vals = ", ".join(f"CASE WHEN p_payload ? '{k}' THEN v_in.{k} ELSE {SAFE_DEFAULT.get(k, 'NULL')} END" for k in EDITABLE)
    w(f"""CREATE TABLE public.tenant_product_receipts(
  actor_id uuid NOT NULL, organization_id uuid NOT NULL, idempotency_key uuid NOT NULL, payload_hash text NOT NULL,
  product_id uuid NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, organization_id, idempotency_key));
CREATE TABLE public.tenant_product_audit(
  id bigserial PRIMARY KEY, organization_id uuid NOT NULL, product_id uuid NOT NULL, actor_id uuid NOT NULL,
  action text NOT NULL, before_state jsonb, after_state jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.tenant_product_receipts, public.tenant_product_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tenant_product_receipts, public.tenant_product_audit TO service_role;
GRANT SELECT ON public.tenant_product_audit TO authenticated;
ALTER TABLE public.tenant_product_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_product_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_product_audit_select ON public.tenant_product_audit FOR SELECT TO authenticated
  USING (organization_id = platform_private.tenant_catalog_read_org());
CREATE FUNCTION platform_private.tenant_product_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $f$
BEGIN RAISE EXCEPTION 'tenant_product_audit_immutable' USING ERRCODE = '42501'; END $f$;
CREATE TRIGGER a00_tenant_product_audit_immutable BEFORE UPDATE OR DELETE ON public.tenant_product_audit
  FOR EACH ROW EXECUTE FUNCTION platform_private.tenant_product_audit_immutable();

CREATE FUNCTION platform_private.tenant_product_validate(p_payload jsonb, p_create boolean) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $f$
DECLARE k text; v_num numeric;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'tenant_product_payload_invalid' USING ERRCODE='22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_payload) LOOP
    IF NOT k = ANY (ARRAY[{fields}]) THEN RAISE EXCEPTION 'tenant_product_field_forbidden:%', k USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_create AND NOT p_payload ? 'nome' THEN RAISE EXCEPTION 'tenant_product_nome_required' USING ERRCODE='22023'; END IF;
  IF p_create AND (NOT p_payload ? 'tipo' OR jsonb_typeof(p_payload->'tipo') <> 'string') THEN RAISE EXCEPTION 'tenant_product_tipo_required' USING ERRCODE='22023'; END IF;
  IF p_payload ? 'tipo' AND jsonb_typeof(p_payload->'tipo') <> 'string' THEN RAISE EXCEPTION 'tenant_product_tipo_invalid' USING ERRCODE='22023'; END IF;
  IF p_payload ? 'b2b_enabled' AND jsonb_typeof(p_payload->'b2b_enabled') <> 'boolean' THEN RAISE EXCEPTION 'tenant_product_boolean_invalid:b2b_enabled' USING ERRCODE='22023'; END IF;
  IF p_payload ? 'nome' AND (jsonb_typeof(p_payload->'nome') <> 'string' OR char_length(btrim(p_payload->>'nome')) NOT BETWEEN 2 AND 200) THEN
    RAISE EXCEPTION 'tenant_product_nome_invalid' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['dose_ml_ha','estoque_minimo','valor_dose_brl','valor_ha_brl','valor_litro_brl'] LOOP
    IF p_payload ? k AND jsonb_typeof(p_payload->k) <> 'null' THEN
      IF jsonb_typeof(p_payload->k) <> 'number' THEN RAISE EXCEPTION 'tenant_product_number_invalid:%', k USING ERRCODE='22023'; END IF;
      v_num := (p_payload->>k)::numeric;
      IF v_num < 0 OR v_num > 1e12 THEN RAISE EXCEPTION 'tenant_product_number_out_of_range:%', k USING ERRCODE='22023'; END IF;
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['e_insumo','b2b_enabled'] LOOP
    IF p_payload ? k AND jsonb_typeof(p_payload->k) NOT IN ('boolean','null') THEN RAISE EXCEPTION 'tenant_product_boolean_invalid:%', k USING ERRCODE='22023'; END IF;
  END LOOP;
END $f$;

CREATE FUNCTION public.tenant_product_save(p_product_id uuid, p_payload jsonb, p_expected_updated_at timestamptz, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_org2 uuid; v_hash text; v_rc public.tenant_product_receipts%ROWTYPE;
  v_prev public.produtos%ROWTYPE; v_new public.produtos%ROWTYPE; v_in public.produtos%ROWTYPE; v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  v_org := platform_private.catalog_tenant_actor('mutate');          -- tenant derivado do servidor
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'tenant_product_key_required' USING ERRCODE='22023'; END IF;
  PERFORM platform_private.tenant_product_validate(p_payload, p_product_id IS NULL);
  v_in := jsonb_populate_record(NULL::public.produtos, p_payload);   -- enum inválido => 22P02
  v_hash := md5(concat_ws('|', coalesce(p_product_id::text,'new'), p_payload::text, coalesce(p_expected_updated_at::text,'')));
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tpk',v_uid,v_org,p_idempotency_key),0));
  SELECT * INTO v_rc FROM public.tenant_product_receipts WHERE actor_id=v_uid AND organization_id=v_org AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_rc.payload_hash <> v_hash THEN RAISE EXCEPTION 'tenant_product_idempotency_conflict' USING ERRCODE='22023'; END IF;
    RETURN v_rc.result || jsonb_build_object('replayed', true);
  END IF;
  IF p_product_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tpn',v_org,lower(btrim(p_payload->>'nome'))),0));
    v_org2 := platform_private.catalog_tenant_actor('mutate');         -- reautoriza após espera
    IF v_org2 IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_product_scope_changed' USING ERRCODE='42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.produtos WHERE owner_organization_id=v_org AND lower(btrim(nome))=lower(btrim(p_payload->>'nome'))) THEN
      RAISE EXCEPTION 'tenant_product_duplicate_name' USING ERRCODE='PT409'; END IF;
    INSERT INTO public.produtos(id, owner_organization_id, ativo, {cols})
      VALUES (gen_random_uuid(), v_org, true, {vals}) RETURNING * INTO v_new;
    INSERT INTO public.tenant_product_audit(organization_id, product_id, actor_id, action, before_state, after_state)
      VALUES (v_org, v_new.id, v_uid, 'create', NULL, to_jsonb(v_new));
  ELSE
    IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'tenant_product_cas_required' USING ERRCODE='PT409'; END IF;
    SELECT * INTO v_prev FROM public.produtos WHERE id=p_product_id AND owner_organization_id=v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'tenant_product_not_found' USING ERRCODE='P0002'; END IF;
    v_org2 := platform_private.catalog_tenant_actor('mutate');           -- reautoriza após lock
    IF v_org2 IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_product_scope_changed' USING ERRCODE='42501'; END IF;
    IF v_prev.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'tenant_product_version_conflict' USING ERRCODE='PT409'; END IF;
    IF p_payload ? 'nome' AND EXISTS (SELECT 1 FROM public.produtos WHERE owner_organization_id=v_org AND id<>p_product_id
         AND lower(btrim(nome))=lower(btrim(p_payload->>'nome'))) THEN
      RAISE EXCEPTION 'tenant_product_duplicate_name' USING ERRCODE='PT409'; END IF;
    UPDATE public.produtos SET
      {assigns},
      updated_at = clock_timestamp()
     WHERE id=p_product_id AND owner_organization_id=v_org AND updated_at = p_expected_updated_at
     RETURNING * INTO v_new;
    IF NOT FOUND THEN RAISE EXCEPTION 'tenant_product_version_conflict' USING ERRCODE='PT409'; END IF;
    INSERT INTO public.tenant_product_audit(organization_id, product_id, actor_id, action, before_state, after_state)
      VALUES (v_org, v_new.id, v_uid, 'update', to_jsonb(v_prev), to_jsonb(v_new));
  END IF;
  v_res := jsonb_build_object('product_id', v_new.id, 'organization_id', v_org, 'updated_at', v_new.updated_at, 'replayed', false);
  INSERT INTO public.tenant_product_receipts VALUES (v_uid, v_org, p_idempotency_key, v_hash, v_new.id, v_res, now());
  RETURN v_res;
END $f$;

CREATE FUNCTION public.tenant_product_set_archived(p_product_id uuid, p_archived boolean, p_expected_updated_at timestamptz, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_org2 uuid; v_hash text; v_rc public.tenant_product_receipts%ROWTYPE;
  v_prev public.produtos%ROWTYPE; v_new public.produtos%ROWTYPE; v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  v_org := platform_private.catalog_tenant_actor('mutate');
  IF p_product_id IS NULL OR p_archived IS NULL OR p_idempotency_key IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'tenant_product_payload_invalid' USING ERRCODE='22023'; END IF;
  v_hash := md5(concat_ws('|','archive',p_product_id,p_archived,p_expected_updated_at));
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tpk',v_uid,v_org,p_idempotency_key),0));
  SELECT * INTO v_rc FROM public.tenant_product_receipts WHERE actor_id=v_uid AND organization_id=v_org AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_rc.payload_hash <> v_hash THEN RAISE EXCEPTION 'tenant_product_idempotency_conflict' USING ERRCODE='22023'; END IF;
    RETURN v_rc.result || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO v_prev FROM public.produtos WHERE id=p_product_id AND owner_organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant_product_not_found' USING ERRCODE='P0002'; END IF;
  v_org2 := platform_private.catalog_tenant_actor('mutate');
  IF v_org2 IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_product_scope_changed' USING ERRCODE='42501'; END IF;
  IF v_prev.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'tenant_product_version_conflict' USING ERRCODE='PT409'; END IF;
  IF (v_prev.ativo IS NOT TRUE) = p_archived THEN RAISE EXCEPTION 'tenant_product_no_change' USING ERRCODE='22023'; END IF;
  UPDATE public.produtos SET ativo = NOT p_archived, updated_at = clock_timestamp()
   WHERE id=p_product_id AND owner_organization_id=v_org AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant_product_version_conflict' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.tenant_product_audit(organization_id, product_id, actor_id, action, before_state, after_state)
    VALUES (v_org, v_new.id, v_uid, CASE WHEN p_archived THEN 'archive' ELSE 'unarchive' END, to_jsonb(v_prev), to_jsonb(v_new));
  v_res := jsonb_build_object('product_id', v_new.id, 'ativo', v_new.ativo, 'updated_at', v_new.updated_at, 'replayed', false);
  INSERT INTO public.tenant_product_receipts VALUES (v_uid, v_org, p_idempotency_key, v_hash, v_new.id, v_res, now());
  RETURN v_res;
END $f$;

CREATE FUNCTION public.tenant_product_list(p_include_archived boolean DEFAULT false)
RETURNS SETOF public.produtos LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  v_org := platform_private.catalog_tenant_actor('read_catalog');
  RETURN QUERY SELECT * FROM public.produtos WHERE owner_organization_id = v_org AND (p_include_archived OR ativo IS TRUE) ORDER BY nome;
END $f$;
DO $acl$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['public.tenant_product_save(uuid,jsonb,timestamptz,uuid)','public.tenant_product_set_archived(uuid,boolean,timestamptz,uuid)',
                           'public.tenant_product_list(boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['platform_private.tenant_product_validate(jsonb,boolean)','platform_private.catalog_owner_immutable()',
                           'platform_private.tenant_product_audit_immutable()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END $acl$;""")
    # 11. catálogo global fechado no servidor
    names = ", ".join(lit(n) for n in GLOBAL_FUNCS)
    w(f"""DO $g$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname IN ('public','platform_private') AND p.proname IN ({names}) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', r.sig);
    INSERT INTO platform_private.tenant_catalog_migration_ledger(step, detail) VALUES ('global_function_closed', jsonb_build_object('sig', r.sig::text));
  END LOOP;
END $g$;""")
    # 11b. v2.6 — reescrita das 2 escritoras REWRITE_TENANT_WRITER (corpos LIVE pinados pelo PRE; drift aborta antes)
    #   * associação micro→produto (DECISÃO HUMANA 02/11): preserva a permissão EXISTENTE do Financeiro SOMENTE nesta
    #     operação e na própria empresa. Autorização específica catalog_fiscal_association_actor(): mesma identidade/
    #     tenant/feature canônicos de catalog_tenant_actor (modo read_management: JWT, Superadmin negado, empresa ativa,
    #     feature catalogo_precos) + papel administrador/gestor/financeiro. Financeiro NÃO ganha 'mutate' (CRUD geral).
    #     Micro e produto do MESMO tenant, locks e reautorização após as esperas.
    #   * sincronização de preço: mantém a lógica LIVE; aborta se algum volume ligado ao alvo pertencer a outro tenant.
    w("""CREATE FUNCTION platform_private.catalog_fiscal_association_actor() RETURNS uuid
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  v_org := platform_private.catalog_tenant_actor('read_management');         -- JWT/SA/empresa ativa/feature canônicos
  IF NOT (platform_private.has_role(v_uid,'administrador'::public.app_role)
          OR platform_private.has_role(v_uid,'gestor'::public.app_role)
          OR platform_private.has_role(v_uid,'financeiro'::public.app_role)) THEN
    RAISE EXCEPTION 'catalog_fiscal_association_role_denied' USING ERRCODE='42501';
  END IF;
  RETURN v_org;
END $f$;
REVOKE ALL ON FUNCTION platform_private.catalog_fiscal_association_actor() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_associate_microorganism_fiscal_product(p_microorganism_id uuid, p_product_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, product_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_org uuid; v_org2 uuid; v_m uuid; v_p uuid;
BEGIN
  v_org := platform_private.catalog_fiscal_association_actor();             -- autorização específica desta operação
  IF p_microorganism_id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT m.owner_organization_id INTO v_m FROM public.microrganismos m WHERE m.id = p_microorganism_id FOR UPDATE;
  IF NOT FOUND OR v_m IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_product_id IS NOT NULL THEN
    SELECT p.owner_organization_id INTO v_p FROM public.produtos p WHERE p.id = p_product_id FOR SHARE;
    IF NOT FOUND OR v_p IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  v_org2 := platform_private.catalog_fiscal_association_actor();            -- reautoriza após as esperas (READ COMMITTED)
  IF v_org2 IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'catalog_actor_changed' USING ERRCODE = '40001'; END IF;
  RETURN QUERY UPDATE public.microrganismos m SET product_id = p_product_id
                WHERE m.id = p_microorganism_id AND m.owner_organization_id = v_org RETURNING m.id, m.product_id;
END $f$;
REVOKE ALL ON FUNCTION public.rpc_associate_microorganism_fiscal_product(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_associate_microorganism_fiscal_product(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_catalogo_sync_mestre_preco(p_produto_id uuid, p_microrganismo_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_litro numeric;
  v_tiers integer;
  v_owner uuid;
BEGIN
  IF num_nonnulls(p_produto_id, p_microrganismo_id) <> 1 THEN RETURN; END IF;
  IF p_produto_id IS NOT NULL THEN
    SELECT p.owner_organization_id INTO v_owner FROM public.produtos p WHERE p.id = p_produto_id;
  ELSE
    SELECT m.owner_organization_id INTO v_owner FROM public.microrganismos m WHERE m.id = p_microrganismo_id;
  END IF;
  IF v_owner IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.catalogo_volumes v
              WHERE (v.produto_id = p_produto_id OR v.microrganismo_id = p_microrganismo_id)
                AND v.owner_organization_id IS DISTINCT FROM v_owner) THEN
    RAISE EXCEPTION 'tenant_chain_divergence:catalogo_volumes' USING ERRCODE = '23514';
  END IF;

  SELECT litro, tiers INTO v_litro, v_tiers
  FROM public.fn_catalogo_litro_canonico(p_produto_id, p_microrganismo_id);

  IF COALESCE(v_tiers,0) = 0 THEN
    RETURN; -- sem apresentacao ativa: preserva fallback legado
  END IF;

  PERFORM set_config('arbio.catalogo_sync', 'on', true);

  IF p_produto_id IS NOT NULL THEN
    IF v_tiers = 1 AND COALESCE(v_litro,0) > 0 THEN
      UPDATE public.produtos p
         SET valor_litro_brl = v_litro,
             valor_dose_brl  = round(v_litro / 10.0, 2),
             valor_ha_brl    = CASE WHEN COALESCE(p.dose_ml_ha,0) > 0
                                    THEN round(v_litro * (p.dose_ml_ha / 1000.0), 2) END
       WHERE p.id = p_produto_id AND p.owner_organization_id = v_owner
         AND (p.valor_litro_brl IS DISTINCT FROM v_litro
              OR p.valor_dose_brl IS DISTINCT FROM round(v_litro / 10.0, 2));
    ELSE
      UPDATE public.produtos p
         SET valor_litro_brl = NULL, valor_dose_brl = NULL, valor_ha_brl = NULL
       WHERE p.id = p_produto_id AND p.owner_organization_id = v_owner
         AND (p.valor_litro_brl IS NOT NULL OR p.valor_dose_brl IS NOT NULL OR p.valor_ha_brl IS NOT NULL);
    END IF;
  ELSE
    IF v_tiers = 1 AND COALESCE(v_litro,0) > 0 THEN
      UPDATE public.microrganismos m
         SET valor_litro_brl = v_litro,
             valor_dose_brl  = round(v_litro / 10.0, 2)
       WHERE m.id = p_microrganismo_id AND m.owner_organization_id = v_owner
         AND (m.valor_litro_brl IS DISTINCT FROM v_litro
              OR m.valor_dose_brl IS DISTINCT FROM round(v_litro / 10.0, 2));
    ELSE
      UPDATE public.microrganismos m
         SET valor_litro_brl = NULL, valor_dose_brl = NULL
       WHERE m.id = p_microrganismo_id AND m.owner_organization_id = v_owner
         AND (m.valor_litro_brl IS NOT NULL OR m.valor_dose_brl IS NOT NULL);
    END IF;
  END IF;

  PERFORM set_config('arbio.catalogo_sync', 'off', true);
END
$function$;""")
