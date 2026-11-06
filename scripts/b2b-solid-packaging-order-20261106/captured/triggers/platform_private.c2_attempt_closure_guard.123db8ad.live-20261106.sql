CREATE OR REPLACE FUNCTION platform_private.c2_attempt_closure_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_key text := btrim(NEW.idempotency_key);
BEGIN
  -- Barreira durável no caminho de ESCRITA: cobre corpos antigos de create ainda em voo
  -- durante o rollout (CREATE OR REPLACE não drena execuções já iniciadas). Mesmo lock
  -- b2b_idem (reentrante para quem já o detém) + recusa se a chave foi fechada.
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || NEW.partner_id::text || ':' || v_key, 0));
  IF EXISTS (SELECT 1 FROM platform_private.partner_order_idempotency_closures c
              WHERE c.partner_id = NEW.partner_id AND c.idempotency_key = v_key) THEN
    RAISE EXCEPTION 'idempotency_key_closed';
  END IF;
  RETURN NEW;
END;
$function$
