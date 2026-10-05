CREATE OR REPLACE FUNCTION public.is_same_tenant_user(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_target_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.profiles target
       WHERE target.user_id = p_target_user_id
         AND target.organization_id = platform_private.current_user_organization_id()
     );
$$;
REVOKE ALL ON FUNCTION public.is_same_tenant_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_same_tenant_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_tenant_admin_for_user(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'administrador'::public.app_role)
     AND NOT public.is_platform_superadmin(auth.uid())
     AND NOT public.is_platform_superadmin(p_target_user_id)
     AND public.is_same_tenant_user(p_target_user_id);
$$;
REVOKE ALL ON FUNCTION public.is_tenant_admin_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin_for_user(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Internal staff can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Organization members can view colleagues" ON public.profiles;
CREATE POLICY "Tenant members can view same organization profiles"
ON public.profiles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_same_tenant_user(user_id));
CREATE POLICY "Tenant admins can update same organization profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_tenant_admin_for_user(user_id))
WITH CHECK (public.is_tenant_admin_for_user(user_id));

CREATE OR REPLACE FUNCTION public.guard_profile_tenant_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'profile_organization_immutable' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() = OLD.user_id AND NOT public.has_role(auth.uid(), 'administrador'::public.app_role) THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.ativo IS DISTINCT FROM OLD.ativo
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.senha_provisoria IS DISTINCT FROM OLD.senha_provisoria
       OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
      RAISE EXCEPTION 'profile_protected_fields' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_profile_tenant_fields() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_profile_tenant_fields ON public.profiles;
CREATE TRIGGER trg_guard_profile_tenant_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_tenant_fields();

DROP POLICY IF EXISTS "Admins can read roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert non platform roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update non platform roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete non platform roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Tenant admins can read same organization roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.is_tenant_admin_for_user(user_id));
CREATE POLICY "Tenant admins can insert same organization roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (role <> 'superadmin'::public.app_role AND public.is_tenant_admin_for_user(user_id));
CREATE POLICY "Tenant admins can update same organization roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (role <> 'superadmin'::public.app_role AND public.is_tenant_admin_for_user(user_id))
WITH CHECK (role <> 'superadmin'::public.app_role AND public.is_tenant_admin_for_user(user_id));
CREATE POLICY "Tenant admins can delete same organization roles"
ON public.user_roles FOR DELETE TO authenticated
USING (role <> 'superadmin'::public.app_role AND public.is_tenant_admin_for_user(user_id));

DROP POLICY IF EXISTS "user_clientes admin manage" ON public.user_clientes;
DROP POLICY IF EXISTS "user_clientes staff select" ON public.user_clientes;
CREATE POLICY "Tenant admins can read same organization user links"
ON public.user_clientes FOR SELECT TO authenticated
USING (public.is_tenant_admin_for_user(user_id));

DROP POLICY IF EXISTS "partner_users_admin_select" ON public.partner_users;
DROP POLICY IF EXISTS "partner_users_admin_insert" ON public.partner_users;
DROP POLICY IF EXISTS "partner_users_admin_update" ON public.partner_users;
DROP POLICY IF EXISTS "partner_users_admin_delete" ON public.partner_users;
CREATE POLICY "Tenant admins can read same organization partner links"
ON public.partner_users FOR SELECT TO authenticated
USING (public.is_tenant_admin_for_user(user_id));

CREATE OR REPLACE FUNCTION public.tenant_admin_list_users(
  p_search text DEFAULT NULL,
  p_role public.app_role DEFAULT NULL,
  p_active boolean DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_total integer;
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_role(auth.uid(), 'administrador'::public.app_role)
     OR public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'tenant_users_forbidden' USING ERRCODE = '42501';
  END IF;
  v_org := platform_private.current_user_organization_id();
  IF p_offset < 0 OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'tenant_users_invalid_pagination' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.profiles p
  WHERE p.organization_id = v_org
    AND (p_active IS NULL OR p.ativo = p_active)
    AND (NULLIF(btrim(p_search), '') IS NULL OR p.nome ILIKE '%' || btrim(p_search) || '%' OR p.email ILIKE '%' || btrim(p_search) || '%')
    AND (p_role IS NULL OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = p_role))
    AND NOT public.is_platform_superadmin(p.user_id);

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC, user_id), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT p.user_id, p.nome, p.email, p.telefone, p.cpf_cnpj, p.ativo, p.created_at, p.updated_at,
           p.cargo, p.crea, p.especialidade,
           COALESCE((SELECT jsonb_agg(ur.role ORDER BY ur.role::text) FROM public.user_roles ur WHERE ur.user_id = p.user_id), '[]'::jsonb) AS roles,
           EXISTS (SELECT 1 FROM public.user_clientes uc WHERE uc.user_id = p.user_id) AS has_client_links,
           EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id = p.user_id) AS has_partner_link
    FROM public.profiles p
    WHERE p.organization_id = v_org
      AND (p_active IS NULL OR p.ativo = p_active)
      AND (NULLIF(btrim(p_search), '') IS NULL OR p.nome ILIKE '%' || btrim(p_search) || '%' OR p.email ILIKE '%' || btrim(p_search) || '%')
      AND (p_role IS NULL OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = p_role))
      AND NOT public.is_platform_superadmin(p.user_id)
    ORDER BY p.created_at DESC, p.user_id
    OFFSET p_offset LIMIT p_limit
  ) row_data;

  RETURN jsonb_build_object('items', v_items, 'total', v_total, 'organization_id', v_org);
END;
$$;
REVOKE ALL ON FUNCTION public.tenant_admin_list_users(text,public.app_role,boolean,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_admin_list_users(text,public.app_role,boolean,integer,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_admin_set_user_active(p_user_id uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_count integer; v_admin_count integer;
BEGIN
  IF NOT public.is_tenant_admin_for_user(p_user_id) THEN
    RAISE EXCEPTION 'user_status_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() AND p_active = false THEN
    RAISE EXCEPTION 'user_status_self_deactivation' USING ERRCODE = '42501';
  END IF;
  IF p_active = false AND public.has_role(p_user_id, 'administrador'::public.app_role) THEN
    SELECT count(*) INTO v_admin_count
    FROM public.profiles p JOIN public.user_roles ur ON ur.user_id=p.user_id
    WHERE p.organization_id=platform_private.current_user_organization_id()
      AND p.ativo=true AND ur.role='administrador'::public.app_role;
    IF v_admin_count <= 1 THEN RAISE EXCEPTION 'user_last_active_admin' USING ERRCODE='PT409'; END IF;
  END IF;
  UPDATE public.profiles SET ativo=p_active WHERE user_id=p_user_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'user_status_not_found' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('success',true,'user_id',p_user_id,'active',p_active);
END;
$$;
REVOKE ALL ON FUNCTION public.tenant_admin_set_user_active(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_admin_set_user_active(uuid,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_can_update_user_password_server(p_actor_id uuid, p_target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
 SELECT p_actor_id IS NOT NULL
   AND p_target_id IS NOT NULL
   AND p_actor_id = auth.uid()
   AND NOT public.is_platform_superadmin(p_actor_id)
   AND NOT public.is_platform_superadmin(p_target_id)
   AND public.has_role(p_actor_id,'administrador'::public.app_role)
   AND EXISTS (
     SELECT 1 FROM public.profiles a JOIN public.profiles t ON t.user_id=p_target_id
     WHERE a.user_id=p_actor_id AND a.ativo=true AND a.organization_id IS NOT NULL
       AND a.organization_id=t.organization_id
   );
$$;
REVOKE ALL ON FUNCTION public.admin_can_update_user_password_server(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_can_update_user_password_server(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_edit_user_profile_v1(p_user_id uuid, p_expected_updated_at timestamptz, p_profile jsonb, p_roles public.app_role[], p_cliente_ids uuid[], p_principal_cliente_id uuid, p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE caller uuid:=auth.uid(); stamp timestamptz; current_roles public.app_role[]; n integer;
BEGIN
 IF caller IS NULL OR NOT public.is_tenant_admin_for_user(p_user_id) THEN RAISE EXCEPTION 'user_edit_forbidden' USING ERRCODE='42501'; END IF;
 IF p_user_id IS NULL OR p_expected_updated_at IS NULL OR p_profile IS NULL OR jsonb_typeof(p_profile)<>'object' THEN RAISE EXCEPTION 'user_edit_invalid_input' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_profile) k WHERE k NOT IN ('nome','telefone','cargo','cpf_cnpj','crea','especialidade')) THEN RAISE EXCEPTION 'user_edit_invalid_fields' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_profile->'nome') IS DISTINCT FROM 'string' OR char_length(btrim(coalesce(p_profile->>'nome',''))) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'user_edit_invalid_name' USING ERRCODE='22023'; END IF;
 IF nullif(p_profile->>'telefone','') IS NOT NULL AND (p_profile->>'telefone') !~ '^[0-9]{10,11}$' THEN RAISE EXCEPTION 'user_edit_invalid_phone' USING ERRCODE='22023'; END IF;
 IF p_roles IS NULL OR cardinality(p_roles) NOT BETWEEN 1 AND 13 OR array_position(p_roles,NULL) IS NOT NULL OR cardinality(p_roles)<>(SELECT count(DISTINCT r) FROM unnest(p_roles) r) THEN RAISE EXCEPTION 'user_edit_invalid_roles' USING ERRCODE='22023'; END IF;
 IF 'superadmin'::public.app_role=ANY(p_roles) OR public.is_platform_superadmin(p_user_id) THEN RAISE EXCEPTION 'user_edit_superadmin_forbidden' USING ERRCODE='42501'; END IF;
 IF cardinality(coalesce(p_cliente_ids,'{}'::uuid[]))<>0 OR p_principal_cliente_id IS NOT NULL OR p_partner_id IS NOT NULL THEN RAISE EXCEPTION 'user_edit_unscoped_links_forbidden' USING ERRCODE='42501'; END IF;
 SELECT array_agg(role ORDER BY role::text) INTO current_roles FROM public.user_roles WHERE user_id=p_user_id;
 IF EXISTS (SELECT 1 FROM unnest(coalesce(current_roles,'{}'::public.app_role[])) r WHERE r IN ('cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico'))
    OR EXISTS (SELECT 1 FROM unnest(p_roles) r WHERE r IN ('cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico')) THEN
   RAISE EXCEPTION 'user_edit_linked_role_unavailable' USING ERRCODE='42501';
 END IF;
 IF caller=p_user_id AND NOT ('administrador'=ANY(p_roles)) THEN RAISE EXCEPTION 'user_edit_self_admin_removal' USING ERRCODE='42501'; END IF;
 SELECT updated_at INTO stamp FROM public.profiles WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_edit_not_found' USING ERRCODE='P0002'; END IF;
 IF stamp IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'user_edit_conflict' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.user_roles(user_id,role) SELECT p_user_id,r FROM unnest(p_roles) r WHERE NOT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_user_id AND ur.role=r);
 DELETE FROM public.user_roles WHERE user_id=p_user_id AND NOT(role=ANY(p_roles)) AND role<>'superadmin'::public.app_role;
 UPDATE public.profiles SET nome=btrim(p_profile->>'nome'), telefone=nullif(p_profile->>'telefone',''), cargo=nullif(p_profile->>'cargo',''), cpf_cnpj=nullif(p_profile->>'cpf_cnpj',''), crea=nullif(p_profile->>'crea',''), especialidade=nullif(p_profile->>'especialidade','') WHERE user_id=p_user_id RETURNING updated_at INTO stamp;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'user_edit_not_found' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('success',true,'user_id',p_user_id,'updated_at',stamp);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_edit_user_profile_v1(uuid,timestamptz,jsonb,public.app_role[],uuid[],uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_edit_user_profile_v1(uuid,timestamptz,jsonb,public.app_role[],uuid[],uuid,uuid) TO authenticated,service_role;

COMMENT ON FUNCTION public.tenant_admin_list_users(text,public.app_role,boolean,integer,integer) IS 'Lista somente usuários do tenant derivado de auth.uid(), com paginação server-side.';
COMMENT ON FUNCTION public.tenant_admin_set_user_active(uuid,boolean) IS 'Altera status somente de usuário do mesmo tenant, sem aceitar organization_id do cliente.';