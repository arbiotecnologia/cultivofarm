CREATE OR REPLACE FUNCTION platform_private.c2_partner_order_attempt_authz(p_uid uuid, p_partner uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$ BEGIN PERFORM platform_private.c2_order_actor_scope(p_uid, p_partner); END $function$
