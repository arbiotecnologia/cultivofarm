CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_partner_projection()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c jsonb; result jsonb; permitted boolean:=false; catalog boolean:=false; sheets boolean:=false; finance boolean:=false; u uuid:=auth.uid();
BEGIN
 c:=platform_private.b2b_commercial_context();
 IF c IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('id',p.id,'codigo',p.codigo,'razao_social',p.razao_social,
   'nome_fantasia',p.nome_fantasia,'ativo',p.ativo,'papel',c->>'papel','mode',c->>'mode')
 INTO result FROM public.partner_accounts p
 WHERE p.id=(c->>'partner_id')::uuid AND p.ativo IS TRUE AND p.deleted_at IS NULL
 AND p.commercial_owner_organization_id=(c->>'commercial_owner_organization_id')::uuid;
 IF result IS NULL THEN RETURN NULL; END IF;
 -- A commercial client alone is NOT a partner capability. Reuse current B2B
 -- chain, including singleton role/link validator; add freshness/owner proof.
 permitted:=COALESCE(platform_private.b2b_phase1_partner_visible((result->>'id')::uuid,true),false)
  AND EXISTS(SELECT 1 FROM public.partner_users pu
    JOIN public.partner_accounts pa ON pa.id=pu.partner_id
    JOIN public.profiles p ON p.user_id=pu.user_id
    JOIN public.organizations o ON o.id=pa.commercial_owner_organization_id
    WHERE pu.user_id=u AND pu.partner_id=(result->>'id')::uuid
      AND pu.revoked_at IS NULL AND pu.valid_from<=now()
      AND pa.ativo AND pa.deleted_at IS NULL AND o.ativo AND o.status='ativa'
      AND p.ativo AND p.organization_id=pu.tenant_id AND pu.tenant_id=o.id
      AND public.is_valid_b2b_partner_user(u,pa.id));
 IF permitted THEN
  catalog:=public.has_role(u,'parceiro_b2b') AND EXISTS(
    SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='catalogo_precos');
  sheets:=EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='fichas_tecnicas');
 END IF;
 BEGIN
 finance:=platform_private.b2b_own_obligations_owner((result->>'id')::uuid) IS NOT NULL;
 EXCEPTION WHEN insufficient_privilege THEN finance:=false; END;
 RETURN result||jsonb_build_object('finance_capabilities',jsonb_build_object(
 'contract','C2_OWN_OBLIGATIONS_V1','obligations_read',finance))||jsonb_build_object('contract',c->>'contract','actor_id',c->'actor_id','tenant_id',c->'tenant_id','external_roles',c->'external_roles','manager',c->'manager','technician',c->'technician','producer_links_valid',c->'producer_links_valid')||jsonb_build_object('capabilities',jsonb_build_object('contract','C2_CAT_V1',
   'catalog_read',catalog,'sheets_read',sheets))||jsonb_build_object('order_capabilities',jsonb_build_object(
   'contract','C2_OWNER_ORDER_V1','order_create', permitted AND catalog
     AND platform_private.c2_owner_order_create_allowed(u,(result->>'id')::uuid))); -- c2_ord_projection
END $function$
