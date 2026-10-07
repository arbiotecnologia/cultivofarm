REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.organization_profile_audit FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.organization_profile_audit TO authenticated;