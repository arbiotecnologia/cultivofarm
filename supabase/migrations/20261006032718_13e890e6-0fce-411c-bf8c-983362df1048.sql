DROP TRIGGER IF EXISTS saas_plan_version_features_no_mutation ON public.saas_plan_version_features;
CREATE TRIGGER saas_plan_version_features_no_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.saas_plan_version_features
FOR EACH ROW EXECUTE FUNCTION public.saas_plan_version_feature_guard();