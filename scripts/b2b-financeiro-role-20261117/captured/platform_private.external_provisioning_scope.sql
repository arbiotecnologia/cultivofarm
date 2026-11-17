CREATE OR REPLACE FUNCTION platform_private.external_provisioning_scope(p_actor uuid, p_roles app_role[], p_partner uuid, p_clients uuid[], p_primary uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE org uuid; snapshot jsonb; partner_snapshot jsonb; p_role public.app_role;
BEGIN
 SELECT organization_id INTO org FROM public.profiles WHERE user_id=p_actor FOR UPDATE;
 IF p_actor IS NULL OR org IS NULL OR platform_private.platform_actor_access_ready(p_actor) IS NOT TRUE
 OR public.has_role(p_actor,'administrador') IS NOT TRUE OR public.is_platform_superadmin(p_actor) IS TRUE
 THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=org AND ativo IS TRUE AND status='ativa' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF p_roles IS NULL OR cardinality(p_roles) NOT BETWEEN 1 AND 3 OR array_position(p_roles,NULL) IS NOT NULL OR cardinality(p_roles)<>(SELECT count(DISTINCT r) FROM unnest(p_roles) r) OR EXISTS(SELECT 1 FROM unnest(p_roles) r WHERE r NOT IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor')) THEN RAISE EXCEPTION 'c2_invalid_roles' USING ERRCODE='22023'; END IF;
 IF p_partner IS NOT NULL THEN
 IF NOT ('parceiro_b2b'=ANY(p_roles) OR 'parceiro_b2b_tecnico'=ANY(p_roles)) THEN RAISE EXCEPTION 'c2_partner_role_required'; END IF;
 IF p_partner IS NULL OR (NOT ('cliente_produtor'=ANY(p_roles)) AND (cardinality(p_clients) IS DISTINCT FROM 0 OR p_primary IS NOT NULL))
 OR NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(p_actor) WHERE feature_key='catalogo_precos') THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.partner_accounts WHERE id=p_partner FOR SHARE;
 SELECT jsonb_build_object('id',id,'updated_at',updated_at) INTO partner_snapshot FROM public.partner_accounts
 WHERE id=p_partner AND commercial_owner_organization_id=org AND ativo IS TRUE AND deleted_at IS NULL;
 IF partner_snapshot IS NULL THEN RAISE EXCEPTION 'external_provisioning_forbidden'; END IF;
 END IF;
 IF 'cliente_produtor'=ANY(p_roles) THEN
 IF cardinality(p_clients) NOT BETWEEN 1 AND 100
 OR p_clients IS NULL OR array_position(p_clients,NULL) IS NOT NULL
 OR cardinality(p_clients)<>(SELECT count(DISTINCT id) FROM unnest(p_clients) id)
 OR p_primary IS NULL OR NOT (p_primary=ANY(p_clients)) THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 -- Explicit portal creation, never derive portal authority from technical user_clientes.
 PERFORM 1 FROM public.clientes WHERE id=ANY(p_clients) ORDER BY id FOR SHARE;
 IF (SELECT count(*) FROM public.clientes WHERE id=ANY(p_clients) AND organization_id=org AND status_cliente='ativo')<>cardinality(p_clients) THEN
 RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) ORDER BY id) INTO snapshot FROM public.clientes WHERE id=ANY(p_clients);
 END IF;
 IF 'cliente_produtor'=ANY(p_roles) THEN PERFORM 1 FROM public.fazendas WHERE cliente_id=ANY(p_clients) ORDER BY id FOR SHARE; END IF;
 IF platform_private.platform_actor_access_ready(p_actor) IS NOT TRUE OR public.has_role(p_actor,'administrador') IS NOT TRUE THEN RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF 'cliente_produtor'=ANY(p_roles) AND EXISTS(SELECT 1 FROM unnest(p_clients) cid WHERE NOT EXISTS(SELECT 1 FROM public.fazendas f WHERE f.cliente_id=cid AND f.organization_id=org AND f.ativo)) THEN RAISE EXCEPTION 'c2_producer_farm_required'; END IF;
 IF p_partner IS NULL AND p_roles IS DISTINCT FROM ARRAY['cliente_produtor']::public.app_role[] THEN RAISE EXCEPTION 'c2_partner_required'; END IF;
 snapshot:=jsonb_build_object('partner',partner_snapshot,'clients',snapshot,'roles',to_jsonb(p_roles));
 IF snapshot IS NULL THEN RAISE EXCEPTION 'external_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('organization_id',org,'snapshot',snapshot);
END $function$
