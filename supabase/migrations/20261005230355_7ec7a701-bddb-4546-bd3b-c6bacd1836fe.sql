BEGIN;
CREATE OR REPLACE FUNCTION public._saas_user_has_feature(_uid uuid,_feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT _uid IS NOT NULL AND _uid=auth.uid() AND EXISTS(
    SELECT 1 FROM public.get_my_entitlements() e WHERE e.feature_key=_feature_key
  );
$$;
REVOKE ALL ON FUNCTION public._saas_user_has_feature(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._saas_user_has_feature(uuid,text) TO authenticated;
COMMIT;