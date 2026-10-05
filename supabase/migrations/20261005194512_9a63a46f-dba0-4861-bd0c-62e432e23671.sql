DO $$
DECLARE
  v_admin_a uuid;
  v_admin_b uuid;
  v_org_a uuid;
  v_org_b uuid;
  v_count integer;
  v_result jsonb;
  v_updated_at timestamptz;
BEGIN
  SELECT p.user_id, p.organization_id
    INTO v_admin_a, v_org_a
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'administrador'::public.app_role
  WHERE p.ativo = true
    AND p.organization_id IS NOT NULL
    AND NOT public.is_platform_superadmin(p.user_id)
  ORDER BY p.organization_id, p.user_id
  LIMIT 1;

  SELECT p.user_id, p.organization_id
    INTO v_admin_b, v_org_b
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'administrador'::public.app_role
  WHERE p.ativo = true
    AND p.organization_id IS NOT NULL
    AND p.organization_id <> v_org_a
    AND NOT public.is_platform_superadmin(p.user_id)
  ORDER BY p.organization_id, p.user_id
  LIMIT 1;

  IF v_admin_a IS NULL OR v_admin_b IS NULL OR v_org_a = v_org_b THEN
    RAISE EXCEPTION 'd51_4_ab_precondition_missing';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;

  SELECT public.tenant_admin_list_users(NULL, NULL, NULL, 0, 100) INTO v_result;
  IF v_result->>'organization_id' <> v_org_a::text
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_result->'items') item WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = (item->>'user_id')::uuid AND p.organization_id = v_org_a)) THEN
    RAISE EXCEPTION 'd51_4_admin_a_list_leak';
  END IF;

  SELECT count(*) INTO v_count FROM public.profiles WHERE user_id = v_admin_b;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_4_admin_a_profile_b_visible'; END IF;
  SELECT count(*) INTO v_count FROM public.user_roles WHERE user_id = v_admin_b;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_4_admin_a_role_b_visible'; END IF;

  BEGIN
    PERFORM public.tenant_admin_set_user_active(v_admin_b, false);
    RAISE EXCEPTION 'd51_4_admin_a_status_b_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT updated_at INTO v_updated_at FROM public.profiles WHERE user_id = v_admin_a;
  BEGIN
    PERFORM public.admin_edit_user_profile_v1(v_admin_b, v_updated_at, jsonb_build_object('nome','Bloqueado'), ARRAY['administrador'::public.app_role], ARRAY[]::uuid[], NULL, NULL);
    RAISE EXCEPTION 'd51_4_admin_a_edit_b_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF public.admin_can_update_user_password_server(v_admin_a, v_admin_b) THEN
    RAISE EXCEPTION 'd51_4_admin_a_password_b_accepted';
  END IF;

  BEGIN
    INSERT INTO public.user_roles(user_id, role) VALUES (v_admin_b, 'superadmin'::public.app_role);
    RAISE EXCEPTION 'd51_4_admin_a_superadmin_b_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.profiles SET organization_id = v_org_b WHERE user_id = v_admin_a;
    RAISE EXCEPTION 'd51_4_admin_a_self_tenant_move_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_admin_b::text, true);
  SET LOCAL ROLE authenticated;

  SELECT public.tenant_admin_list_users(NULL, NULL, NULL, 0, 100) INTO v_result;
  IF v_result->>'organization_id' <> v_org_b::text
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_result->'items') item WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = (item->>'user_id')::uuid AND p.organization_id = v_org_b)) THEN
    RAISE EXCEPTION 'd51_4_admin_b_list_leak';
  END IF;

  SELECT count(*) INTO v_count FROM public.profiles WHERE user_id = v_admin_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_4_admin_b_profile_a_visible'; END IF;
  SELECT count(*) INTO v_count FROM public.user_roles WHERE user_id = v_admin_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_4_admin_b_role_a_visible'; END IF;

  RESET ROLE;
END;
$$;