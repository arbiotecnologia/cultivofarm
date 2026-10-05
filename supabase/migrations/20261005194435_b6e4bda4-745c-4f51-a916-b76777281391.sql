DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own non sensitive profile fields"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_profile_tenant_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.senha_provisoria IS DISTINCT FROM OLD.senha_provisoria
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    RAISE EXCEPTION 'profile_protected_fields' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() = OLD.user_id AND NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    RAISE EXCEPTION 'profile_protected_fields' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_tenant_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_profile_tenant_fields() TO service_role;

DROP TRIGGER IF EXISTS trg_guard_profile_tenant_fields ON public.profiles;
CREATE TRIGGER trg_guard_profile_tenant_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_tenant_fields();

DO $$
DECLARE
  v_policy_count integer;
  v_trigger_definition text;
  v_password_security_definer boolean;
  v_password_exec boolean;
BEGIN
  SELECT count(*) INTO v_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'profiles'
    AND policyname = 'Users can update own profile';
  IF v_policy_count <> 0 THEN
    RAISE EXCEPTION 'd51_4_legacy_self_update_policy_present';
  END IF;

  SELECT pg_catalog.pg_get_triggerdef(t.oid) INTO v_trigger_definition
  FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.profiles'::regclass
    AND t.tgname = 'trg_guard_profile_tenant_fields'
    AND NOT t.tgisinternal;
  IF v_trigger_definition IS NULL THEN
    RAISE EXCEPTION 'd51_4_profile_guard_missing';
  END IF;

  SELECT p.prosecdef,
         pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    INTO v_password_security_definer, v_password_exec
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'admin_can_update_user_password_server'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_actor_id uuid, p_target_id uuid';
  IF v_password_security_definer IS DISTINCT FROM false OR v_password_exec IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'd51_4_password_guard_contract_regressed';
  END IF;
END;
$$;