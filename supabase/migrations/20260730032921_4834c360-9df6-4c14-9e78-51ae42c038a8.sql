ALTER TABLE public.partner_order_idempotency
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

DO $mig$
DECLARE d text; nd text;
  anchor_a CONSTANT text := '  v_idem text; v_prev_idem record; v_result jsonb;';
  anchor_b CONSTANT text := '  IF FOUND THEN
    IF v_prev_idem.cart_hash IS DISTINCT FROM p_expected_cart_hash THEN
      RAISE EXCEPTION ''idempotency_conflict'';
    END IF;
    RETURN v_prev_idem.result_snapshot;
  END IF;';
  anchor_c CONSTANT text := '  INSERT INTO public.partner_order_idempotency(
    partner_id, idempotency_key, cart_hash, order_id, result_snapshot, created_by)
  VALUES (p_partner_id, v_idem, p_expected_cart_hash, v_order_id, v_result, v_uid);';
  anchor_d CONSTANT text := '  IF length(v_idem) > 120 THEN RAISE EXCEPTION ''invalid_idempotency_key''; END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_partner_order_secure';
  IF d IS NULL THEN RAISE EXCEPTION 'function_not_found'; END IF;
  IF position('v_req_fp' IN d) > 0 THEN RETURN; END IF;

  IF position(anchor_a IN d) = 0 OR position(anchor_b IN d) = 0
     OR position(anchor_c IN d) = 0 OR position(anchor_d IN d) = 0 THEN
    RAISE EXCEPTION 'patch_anchor_not_found';
  END IF;

  nd := replace(d, anchor_a, anchor_a || E'\n  v_req_fp text;');

  nd := replace(nd, anchor_d, anchor_d || E'\n' ||
'  v_req_fp := encode(sha256(convert_to(''reqfp_v1|'' || p_partner_id::text || ''|'' ||
    COALESCE(p_payment_plan_id::text,''-'') || ''|'' ||
    COALESCE(p_first_due_date::text,''-'') || ''|'' ||
    COALESCE(p_installment_count::text,''-'') || ''|'' ||
    COALESCE(p_requested_delivery_date::text,''-'') || ''|'' ||
    COALESCE((SELECT string_agg(l::text, '';'' ORDER BY l::text)
                FROM jsonb_array_elements(COALESCE(p_items,''[]''::jsonb)) l),'''')
  ,''UTF8'')),''hex'');');

  nd := replace(nd, anchor_b,
'  IF FOUND THEN
    IF v_prev_idem.cart_hash IS DISTINCT FROM p_expected_cart_hash THEN
      RAISE EXCEPTION ''idempotency_conflict'';
    END IF;
    IF v_prev_idem.request_fingerprint IS NOT NULL
       AND v_prev_idem.request_fingerprint IS DISTINCT FROM v_req_fp THEN
      RAISE EXCEPTION ''idempotency_conflict'';
    END IF;
    RETURN v_prev_idem.result_snapshot;
  END IF;');

  nd := replace(nd, anchor_c,
'  INSERT INTO public.partner_order_idempotency(
    partner_id, idempotency_key, cart_hash, order_id, result_snapshot, created_by, request_fingerprint)
  VALUES (p_partner_id, v_idem, p_expected_cart_hash, v_order_id, v_result, v_uid, v_req_fp);');

  EXECUTE nd;
END
$mig$;