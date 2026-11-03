"""11c. Cerca de tenant para consumidores DEFINER com ENTRADA DIRETA de ids do catálogo (auditoria 48 DEFINER).

Classe B da auditoria (docs: catalogo-exclusivo-tenant-20261101.md §5.1): o corpo LIVE ignora RLS e aceita
produto/microrganismo/perfil/parceiro por id sem comparar o dono — ex.: update_product_b2b_description grava
o perfil técnico de QUALQUER empresa. Em vez de reescrever corpos pinados, o original vira núcleo privado
(platform_private.<nome>__tenant_core, sem EXECUTE de cliente) e um invólucro com a MESMA assinatura/defaults/retorno
valida que todo id informado pertence ao tenant do ator ('mutate' p/ escritores, 'read_catalog' p/ leitores) e só
então chama o núcleo. Contexto servidor sem ator (gatilho/serviço como dono) segue permitido; anon/authenticated sem
auth.uid() negado. Classe 'platform' (writer global de Superadmin) é fechada por REVOKE.
"""

P = "(SELECT z.owner_organization_id FROM public.produtos z WHERE z.id = {a})"
M = "(SELECT z.owner_organization_id FROM public.microrganismos z WHERE z.id = {a})"
PTP = "(SELECT z.owner_organization_id FROM public.product_technical_profiles t JOIN public.produtos z ON z.id = t.produto_id WHERE t.id = {a})"
MTP = "(SELECT z.owner_organization_id FROM public.microorganism_technical_profiles t JOIN public.microrganismos z ON z.id = t.microrganismo_id WHERE t.id = {a})"
PART = "(SELECT x.commercial_owner_organization_id FROM public.partner_accounts x WHERE x.id = {a})"

FENCED = [
    ("platform_private.lab_assert_manufacturable(uuid,uuid)", "read_catalog", {"p_product_id": P, "p_microorganism_id": M}),
    ("platform_private.lab_item_is_manufacturable(uuid,uuid)", "read_catalog", {"p_product_id": P, "p_microorganism_id": M}),
    ("public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)", "read_catalog", {"p_product_id": P, "p_microrganismo_id": M}),
    ("public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date)", "read_catalog",
     {"p_partner_id": PART, "p_product_id": P, "p_microrganismo_id": M}),
    ("public.rpc_commercial_simulator(uuid,uuid,numeric,numeric)", "read_catalog", {"p_partner_id": PART, "p_product_id": P}),
    ("public.approve_product_profile_with_audit(uuid,jsonb,boolean)", "mutate", {"p_profile_id": PTP}),
    ("public.approve_microorganism_profile_with_audit(uuid,jsonb,boolean)", "mutate", {"p_profile_id": MTP}),
    ("public.update_product_b2b_description(uuid,text)", "mutate", {"p_profile_id": PTP}),
    ("public.update_microorganism_b2b_description(uuid,text)", "mutate", {"p_profile_id": MTP}),
    ("public.rpc_regulatory_dossier_ensure_draft(uuid)", "mutate", {"p_microorganism_id": M}),
]
CLOSED_PLATFORM = ["public.platform_set_catalog_label_active(uuid,timestamp with time zone,boolean,text,uuid)"]


def fence_sql(w, ledger, lit):
    w("""CREATE FUNCTION platform_private.tenant_catalog_fence(p_mode text, p_orgs uuid[]) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_actor uuid;
BEGIN
  IF p_mode NOT IN ('mutate','read_catalog') THEN RAISE EXCEPTION 'tenant_catalog_fence_mode' USING ERRCODE='22023'; END IF;
  IF auth.uid() IS NULL THEN
    IF session_user::text IN ('anon','authenticated') OR current_setting('role', true) IN ('anon','authenticated') THEN
      RAISE EXCEPTION 'tenant_catalog_fence_denied' USING ERRCODE='42501'; END IF;
    RETURN;   -- contexto servidor sem ator (gatilho/serviço); clientes sempre têm auth.uid()
  END IF;
  BEGIN
    v_actor := platform_private.catalog_tenant_actor(p_mode);
  EXCEPTION WHEN raise_exception OR insufficient_privilege OR invalid_parameter_value THEN
    RAISE EXCEPTION 'tenant_catalog_fence_denied' USING ERRCODE='42501';
  END;
  IF v_actor IS NULL OR EXISTS (SELECT 1 FROM unnest(p_orgs) o WHERE o IS DISTINCT FROM v_actor) THEN
    RAISE EXCEPTION 'tenant_catalog_fence_denied' USING ERRCODE='42501'; END IF;
END $f$;
REVOKE ALL ON FUNCTION platform_private.tenant_catalog_fence(text,uuid[]) FROM PUBLIC, anon, authenticated, service_role;""")
    rows = []
    for sig, mode, amap in FENCED:
        checks = ", ".join(
            f"CASE WHEN {a} IS NULL THEN NULL ELSE coalesce({expr.format(a=a)}, '00000000-0000-0000-0000-000000000000'::uuid) END"
            for a, expr in amap.items())
        rows.append(f"({lit(sig)}, {lit(mode)}, {lit(checks)})")
    w(f"""DO $fw$ DECLARE r record; v_oid oid; v_schema text; v_name text; v_args text; v_res text; v_call text; v_body text; v_core text;
BEGIN
  FOR r IN SELECT * FROM (VALUES {', '.join(rows)}) t(sig, mode, checks) LOOP
    v_oid := to_regprocedure(r.sig);
    IF v_oid IS NULL THEN RAISE EXCEPTION 'tenant_catalog_fence_target_missing:%', r.sig; END IF;
    SELECT n.nspname, p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
           (SELECT string_agg(quote_ident(a), ', ' ORDER BY i) FROM unnest(p.proargnames) WITH ORDINALITY u(a, i))
      INTO v_schema, v_name, v_args, v_res, v_call
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.oid = v_oid;
    IF v_res LIKE 'SETOF%' OR v_res LIKE 'TABLE%' THEN RAISE EXCEPTION 'tenant_catalog_fence_unsupported_result:%', r.sig; END IF;
    v_core := v_name || '__tenant_core';
    EXECUTE format('ALTER FUNCTION %s RENAME TO %I', v_oid::regprocedure, v_core);
    IF v_schema <> 'platform_private' THEN EXECUTE format('ALTER FUNCTION %I.%I(%s) SET SCHEMA platform_private', v_schema, v_core, pg_get_function_identity_arguments(v_oid)); END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION platform_private.%I(%s) FROM PUBLIC, anon, authenticated, service_role', v_core, pg_get_function_identity_arguments(v_oid));
    v_body := 'BEGIN PERFORM platform_private.tenant_catalog_fence(' || quote_literal(r.mode) || ', array_remove(ARRAY[' || r.checks || ']::uuid[], NULL)); '
      || CASE WHEN v_res = 'void' THEN 'PERFORM platform_private.' || quote_ident(v_core) || '(' || coalesce(v_call,'') || '); RETURN; '
              ELSE 'RETURN platform_private.' || quote_ident(v_core) || '(' || coalesce(v_call,'') || '); ' END || 'END';
    EXECUTE format('CREATE FUNCTION %I.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path = %L AS %L',
                   v_schema, v_name, v_args, v_res, '', v_body);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon', v_schema, v_name, pg_get_function_identity_arguments(v_oid));
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role', v_schema, v_name, pg_get_function_identity_arguments(v_oid));
    INSERT INTO {ledger}(step, detail) VALUES ('definer_tenant_fenced', jsonb_build_object('function', r.sig, 'mode', r.mode, 'core', 'platform_private.' || v_core));
  END LOOP;
END $fw$;""")
    for sig in CLOSED_PLATFORM:
        w(f"""REVOKE ALL ON FUNCTION {sig} FROM PUBLIC, anon, authenticated;
INSERT INTO {ledger}(step, detail) VALUES ('platform_writer_closed', jsonb_build_object('function', {lit(sig)}));""")
