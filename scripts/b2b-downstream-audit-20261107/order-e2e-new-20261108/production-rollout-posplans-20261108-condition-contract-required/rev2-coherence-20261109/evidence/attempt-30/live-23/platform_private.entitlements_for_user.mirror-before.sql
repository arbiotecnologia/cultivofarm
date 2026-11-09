CREATE OR REPLACE FUNCTION platform_private.entitlements_for_user(u uuid)
 RETURNS TABLE(feature_key text)
 LANGUAGE sql
 STABLE
AS $function$ SELECT e.feature_key FROM platform_private.seam_entitlements e WHERE e.user_id = u $function$
