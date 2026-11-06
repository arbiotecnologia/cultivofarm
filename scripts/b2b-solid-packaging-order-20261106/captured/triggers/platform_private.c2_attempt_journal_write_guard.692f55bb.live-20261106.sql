CREATE OR REPLACE FUNCTION platform_private.c2_attempt_journal_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
AS $function$
BEGIN
 -- Also fences old function bodies in flight and arbitrary old/downgraded clients.
 IF TG_OP='UPDATE' AND (NEW.partner_id,NEW.idempotency_key,NEW.created_by)
  IS DISTINCT FROM (OLD.partner_id,OLD.idempotency_key,OLD.created_by) THEN
  RAISE EXCEPTION 'C2DJ_IDENTITY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 -- Fail BEFORE any scope lock; this trigger NEVER acquires scope (old body may hold idem).
 IF NOT EXISTS(SELECT 1 FROM platform_private.partner_order_attempt_journal j
  WHERE j.actor_id=auth.uid() AND j.partner_id=NEW.partner_id AND j.idempotency_key=btrim(NEW.idempotency_key)) THEN
  RAISE EXCEPTION 'C2DJ_REGISTERED_ATTEMPT_REQUIRED' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:'||NEW.partner_id::text||':'||btrim(NEW.idempotency_key),0));
 PERFORM platform_private.c2_partner_order_attempt_authz(auth.uid(),NEW.partner_id);
 IF NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'C2DJ_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.partner_order_attempt_journal j JOIN public.profiles p
  ON p.user_id=j.actor_id AND p.organization_id=j.organization_id AND p.ativo
  WHERE j.actor_id=auth.uid() AND j.partner_id=NEW.partner_id AND j.idempotency_key=btrim(NEW.idempotency_key)) THEN
  RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $function$
