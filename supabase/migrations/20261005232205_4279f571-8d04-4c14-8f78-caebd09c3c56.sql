BEGIN;
GRANT INSERT ON public.saas_plan_versions TO authenticated;
GRANT INSERT ON public.saas_plan_version_features TO authenticated;
CREATE POLICY saas_plan_versions_platform_insert ON public.saas_plan_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())) AND created_by=(SELECT auth.uid()));
CREATE POLICY saas_plan_version_features_platform_insert ON public.saas_plan_version_features
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())) AND EXISTS(SELECT 1 FROM public.saas_plan_versions v WHERE v.id=saas_plan_version_features.plan_version_id AND v.created_by=(SELECT auth.uid())));
ALTER FUNCTION public.platform_publish_plan_version(text,numeric,text,text,jsonb,timestamptz,text,uuid) SECURITY INVOKER;
COMMIT;