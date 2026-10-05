BEGIN;
REVOKE INSERT ON public.saas_plan_versions FROM authenticated;
REVOKE INSERT ON public.saas_plan_version_features FROM authenticated;
DROP POLICY IF EXISTS saas_plan_versions_platform_insert ON public.saas_plan_versions;
DROP POLICY IF EXISTS saas_plan_version_features_platform_insert ON public.saas_plan_version_features;
COMMIT;