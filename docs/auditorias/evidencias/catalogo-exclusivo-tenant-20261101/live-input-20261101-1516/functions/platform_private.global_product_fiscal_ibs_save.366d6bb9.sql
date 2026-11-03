CREATE OR REPLACE FUNCTION platform_private.global_product_fiscal_ibs_save(p_product_id uuid, payload jsonb, expected_revision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE current_row public.product_fiscal_profiles; result public.product_fiscal_profiles; BEGIN
 IF NOT platform_private.global_product_fiscal_write_ready() THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Lock the same existing gate BEFORE the row; role revokers use this gate too.
 PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_GATE_UNAVAILABLE'; END IF;
 IF NOT platform_private.global_product_fiscal_write_ready() THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM public._fiscal_rtc_assert_payload(payload,'item');
 SELECT * INTO current_row FROM public.product_fiscal_profiles WHERE product_id=p_product_id AND is_active IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_ITEM_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF expected_revision IS NULL OR expected_revision<>current_row.updated_at::text THEN RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='40001'; END IF;
 UPDATE public.product_fiscal_profiles SET ibs_cbs_configuration=payload WHERE id=current_row.id AND product_id=p_product_id AND is_active IS TRUE AND updated_at=current_row.updated_at RETURNING * INTO result;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('configuration',result.ibs_cbs_configuration,'revision',result.updated_at::text);
END $function$
