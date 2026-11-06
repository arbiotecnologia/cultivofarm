CREATE OR REPLACE FUNCTION platform_private.delivery_order_transition_guard_20261030()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND EXISTS(SELECT 1 FROM platform_private.delivery_context_20261030 WHERE txid=pg_catalog.txid_current()) THEN
  RAISE EXCEPTION 'DELIVERY_B2B_TRANSITION_CLOSED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $function$
