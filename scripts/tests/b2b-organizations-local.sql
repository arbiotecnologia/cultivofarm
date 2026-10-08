-- Real pg_policies predicates captured from canonical Supabase 2026-10-08.
GRANT SELECT ON public.organizations TO authenticated;
-- Dependency grants in disposable DDL, not a change to canonical privileges.
GRANT SELECT ON public.profiles,public.partner_users TO authenticated;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE POLICY "Superadmin le empresas" ON public.organizations FOR SELECT TO authenticated
USING(public.is_platform_superadmin(auth.uid()));
CREATE POLICY organizations_select_scoped ON public.organizations FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.organization_id=organizations.id)
 OR (partner_account_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.partner_users pu
 WHERE pu.user_id=auth.uid() AND pu.partner_id=organizations.partner_account_id)));
ALTER TABLE public.organizations ADD COLUMN onboarding_dados jsonb DEFAULT '{"private":"fixture"}';
ALTER TABLE public.organizations ADD COLUMN responsavel_user_id uuid;
UPDATE public.profiles SET organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DELETE FROM public.partner_users;
INSERT INTO public.partner_users VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','gestor');
DELETE FROM public.user_roles;
INSERT INTO public.user_roles VALUES('44444444-4444-4444-8444-444444444444','parceiro_b2b');
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true('organizations baseline exposes onboarding',(SELECT onboarding_dados->>'private'='fixture' FROM public.organizations));
RESET ROLE;