-- Reviewed additive portal projection. Does not open catalog, finance or provisioning.
CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_partner_projection()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $f$
DECLARE c jsonb; result jsonb;
BEGIN
 c:=platform_private.b2b_commercial_context();
 IF c IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('id',p.id,'codigo',p.codigo,'razao_social',p.razao_social,
   'nome_fantasia',p.nome_fantasia,'ativo',p.ativo,'papel',c->>'papel','mode',c->>'mode')
 INTO result FROM public.partner_accounts p
 WHERE p.id=(c->>'partner_id')::uuid AND p.ativo IS TRUE AND p.deleted_at IS NULL
 AND p.commercial_owner_organization_id=(c->>'commercial_owner_organization_id')::uuid;
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION platform_private.b2b_commercial_partner_projection() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.b2b_commercial_partner_projection() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_my_commercial_partner_projection()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT platform_private.b2b_commercial_partner_projection();
$f$;
REVOKE ALL ON FUNCTION public.get_my_commercial_partner_projection() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_commercial_partner_projection() TO authenticated,service_role;

-- Authoritative preflight in the EXISTING create-user flow. It deliberately
-- cannot enable Auth until same-tenant general channels have been contained.
CREATE OR REPLACE FUNCTION platform_private.b2b_provisioning_preflight(p_partner uuid,p_role text,p_papel text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $f$
DECLARE u uuid:=auth.uid(); org uuid;
BEGIN
 org:=public.h15_actor_organization();
 IF u IS NULL OR org IS NULL OR NOT platform_private.platform_actor_access_ready(u)
 OR NOT public.has_role(u,'administrador'::public.app_role) THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501';
 END IF;
 IF p_role NOT IN ('parceiro_b2b','parceiro_b2b_tecnico') OR p_role IS NULL
 OR p_papel IS DISTINCT FROM CASE WHEN p_role='parceiro_b2b_tecnico' THEN 'tecnico' ELSE 'gestor' END
 OR NOT EXISTS(SELECT 1 FROM public.partner_accounts p WHERE p.id=p_partner
   AND p.commercial_owner_organization_id=org AND p.ativo IS TRUE AND p.deleted_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=org AND o.ativo IS TRUE AND o.status='ativa')
 OR NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='catalogo_precos') THEN
  RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('organization_id',org,'partner_id',p_partner,'role',p_role,'papel',p_papel,
 'enabled',false,'reason','b2b_same_tenant_channels_unverified');
END $f$;
REVOKE ALL ON FUNCTION platform_private.b2b_provisioning_preflight(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.b2b_provisioning_preflight(uuid,text,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.b2b_provisioning_preflight(p_partner uuid,p_role text,p_papel text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT platform_private.b2b_provisioning_preflight(p_partner,p_role,p_papel);
$f$;
REVOKE ALL ON FUNCTION public.b2b_provisioning_preflight(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.b2b_provisioning_preflight(uuid,text,text) TO authenticated,service_role;