BEGIN;
DROP POLICY IF EXISTS saas_plan_version_features_platform_insert ON public.saas_plan_version_features;
CREATE POLICY saas_plan_version_features_platform_insert ON public.saas_plan_version_features
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_superadmin((SELECT auth.uid()))
    AND EXISTS(
      SELECT 1 FROM public.saas_plan_versions v
      WHERE v.id=saas_plan_version_features.plan_version_id
        AND v.created_by=(SELECT auth.uid())
        AND v.correlation_id IS NOT NULL
    )
  );
COMMIT;