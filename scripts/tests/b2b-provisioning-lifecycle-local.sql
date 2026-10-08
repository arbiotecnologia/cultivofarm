-- Isolated Auth stub ONLY. Actual candidate functions loaded by harness below.
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb DEFAULT '{}');
CREATE TABLE public.user_clientes(user_id uuid,cliente_id uuid);
CREATE TABLE platform_private.provisional_password_state(user_id uuid PRIMARY KEY,desde timestamptz DEFAULT now(),expires_at timestamptz,pwd_digest text);
CREATE FUNCTION platform_private.require_service_role() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('role')<>'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF; END $$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT platform_private.has_role($1,$2) $$;
-- Canonical preflight body copied from pg_get_functiondef; helper dependencies
-- and Auth remain the documented local stubs in the shared harness.
CREATE FUNCTION public.b2b_provisioning_preflight(p_partner uuid,p_role text,p_papel text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); org uuid;
BEGIN
 org:=public.h15_actor_organization();
 IF u IS NULL OR org IS NULL OR NOT platform_private.platform_actor_access_ready(u)
 OR NOT public.has_role(u,'administrador'::public.app_role) THEN RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 IF p_role NOT IN ('parceiro_b2b','parceiro_b2b_tecnico') OR p_role IS NULL
 OR p_papel IS DISTINCT FROM (CASE WHEN p_role='parceiro_b2b_tecnico' THEN 'tecnico' ELSE 'gestor' END)
 OR NOT EXISTS(SELECT 1 FROM public.partner_accounts p WHERE p.id=p_partner AND p.commercial_owner_organization_id=org AND p.ativo IS TRUE AND p.deleted_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=org AND o.ativo IS TRUE AND o.status='ativa')
 OR NOT EXISTS(SELECT 1 FROM platform_private.entitlements_for_user(u) e WHERE e.feature_key='catalogo_precos') THEN RAISE EXCEPTION 'b2b_provisioning_forbidden' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('organization_id',org,'partner_id',p_partner,'role',p_role,'papel',p_papel,'enabled',false);
END $$;