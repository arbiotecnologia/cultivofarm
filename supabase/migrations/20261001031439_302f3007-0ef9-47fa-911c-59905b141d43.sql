BEGIN;
CREATE POLICY provisional_password_state_deny ON platform_private.provisional_password_state FOR ALL USING (false) WITH CHECK (false);

ALTER FUNCTION public.platform_conclude_provisional_password() SET SCHEMA platform_private;
ALTER FUNCTION platform_private.platform_conclude_provisional_password() RENAME TO conclude_provisional_password;
REVOKE ALL ON FUNCTION platform_private.conclude_provisional_password() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA platform_private TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.conclude_provisional_password() TO authenticated, service_role;

CREATE FUNCTION public.platform_conclude_provisional_password()
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path TO '' AS $$
  SELECT platform_private.conclude_provisional_password();
$$;
REVOKE ALL ON FUNCTION public.platform_conclude_provisional_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_conclude_provisional_password() TO authenticated, service_role;
COMMIT;