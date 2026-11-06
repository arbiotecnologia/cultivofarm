CREATE OR REPLACE FUNCTION platform_private.solid_pack_receipt(p_key text, p_org uuid, p_action text, p_fp text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r platform_private.solid_pack_admin_receipts;
BEGIN
  IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9_-]{16,80}$' THEN RAISE EXCEPTION 'PACK_IDEMPOTENCY_KEY_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('solid_pack_receipt:'||p_key,0));
  IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM p_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM platform_private.solid_pack_admin_receipts WHERE idempotency_key = p_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF r.actor_id IS DISTINCT FROM auth.uid() OR r.organization_id IS DISTINCT FROM p_org OR r.action IS DISTINCT FROM p_action OR r.request_fp IS DISTINCT FROM p_fp THEN
    RAISE EXCEPTION 'PACK_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409'; END IF;
  
  IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM p_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  RETURN r.result || jsonb_build_object('replayed', true);
END $function$
