CREATE OR REPLACE FUNCTION platform_private.tenant_catalog_receipt(p_org uuid, p_key uuid, p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v platform_private.tenant_catalog_root_receipts%ROWTYPE;
BEGIN
  IF p_key IS NULL THEN RAISE EXCEPTION 'tenant_catalog_key_required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tcr',auth.uid(),p_org,p_key),0));
  SELECT * INTO v FROM platform_private.tenant_catalog_root_receipts WHERE actor_id=auth.uid() AND organization_id=p_org AND idempotency_key=[REDACTED]
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v.payload_hash <> p_hash THEN RAISE EXCEPTION 'tenant_catalog_idempotency_conflict' USING ERRCODE='PT409'; END IF;
  RETURN v.result || jsonb_build_object('replayed', true);
END $function$;
