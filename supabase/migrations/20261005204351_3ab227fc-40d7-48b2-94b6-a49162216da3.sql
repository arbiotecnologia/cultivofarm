DO $audit$
DECLARE
  v_a uuid;
  v_b uuid;
  v_org_a uuid;
  v_org_b uuid;
  v_count bigint;
  v_old_sub text := current_setting('request.jwt.claim.sub', true);
  v_old_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  SELECT p.user_id, p.organization_id
    INTO v_a, v_org_a
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
   WHERE p.ativo IS TRUE
     AND p.organization_id IS NOT NULL
     AND ur.role = 'administrador'::public.app_role
     AND NOT public.is_platform_superadmin(p.user_id)
   ORDER BY p.organization_id, p.user_id
   LIMIT 1;

  SELECT p.user_id, p.organization_id
    INTO v_b, v_org_b
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id
   WHERE p.ativo IS TRUE
     AND p.organization_id IS NOT NULL
     AND p.organization_id IS DISTINCT FROM v_org_a
     AND ur.role = 'administrador'::public.app_role
     AND NOT public.is_platform_superadmin(p.user_id)
   ORDER BY p.organization_id, p.user_id
   LIMIT 1;

  IF v_a IS NULL OR v_b IS NULL OR v_org_a = v_org_b THEN
    RAISE EXCEPTION 'd51_5_ab_prerequisites_missing';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_a::text, true);
  SET LOCAL ROLE authenticated;

  IF public.h15_actor_organization() IS DISTINCT FROM v_org_a THEN
    RAISE EXCEPTION 'd51_5_actor_a_org_mismatch';
  END IF;

  SELECT count(*) INTO v_count FROM public.profiles WHERE organization_id = v_org_b;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_5_a_profiles_b_visible'; END IF;
  SELECT count(*) INTO v_count FROM public.accounts_payable WHERE organization_id = v_org_b;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_5_a_payables_b_visible'; END IF;
  SELECT count(*) INTO v_count FROM public.accounts_receivable WHERE organization_id = v_org_b;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_5_a_receivables_b_visible'; END IF;
  SELECT count(*) INTO v_count FROM public.fiscal_invoices WHERE organization_id = v_org_b;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_5_a_fiscal_b_visible'; END IF;
  SELECT count(*) INTO v_count FROM public.ordens_servico WHERE organization_id = v_org_b;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_5_a_production_b_visible'; END IF;

  BEGIN
    UPDATE public.configuracoes_sistema SET updated_at = updated_at WHERE id = (SELECT id FROM public.configuracoes_sistema LIMIT 1);
    IF FOUND THEN RAISE EXCEPTION 'd51_5_tenant_admin_global_config_accepted'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', v_b::text, true);
  SET LOCAL ROLE authenticated;

  IF public.h15_actor_organization() IS DISTINCT FROM v_org_b THEN
    RAISE EXCEPTION 'd51_5_actor_b_org_mismatch';
  END IF;
  SELECT count(*) INTO v_count FROM public.profiles WHERE organization_id = v_org_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_5_b_profiles_a_visible'; END IF;
  SELECT count(*) INTO v_count FROM public.accounts_payable WHERE organization_id = v_org_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_5_b_payables_a_visible'; END IF;
  SELECT count(*) INTO v_count FROM public.fiscal_invoices WHERE organization_id = v_org_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_5_b_fiscal_a_visible'; END IF;
  SELECT count(*) INTO v_count FROM public.ordens_servico WHERE organization_id = v_org_a;
  IF v_count <> 0 THEN RAISE EXCEPTION 'd51_5_b_production_a_visible'; END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_old_sub,''), true);
  PERFORM set_config('request.jwt.claim.role', coalesce(v_old_role,''), true);
END
$audit$;