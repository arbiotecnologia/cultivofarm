CREATE OR REPLACE FUNCTION public.rpc_resolve_commercial_prices(p_items jsonb, p_plan_id uuid, p_ref_date date DEFAULT CURRENT_DATE, p_buyer jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_partner uuid; s record;
  v_item jsonb; v_res jsonb; v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF COALESCE(p_buyer->>'buyer_scope','partner') <> 'partner' OR NULLIF(p_buyer->>'customer_id','') IS NOT NULL THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
  END IF;
  IF public.has_role(v_uid,'parceiro_b2b'::app_role) AND NOT public.is_platform_superadmin(v_uid) THEN
    -- parceiro: o partner_id do cliente é ignorado; usa o vínculo do servidor.
    SELECT * INTO s FROM platform_private.b2b_actor_scope(v_uid);
    v_partner := s.user_partner;
  ELSE
    v_partner := NULLIF(p_buyer->>'partner_id','')::uuid;
    IF v_partner IS NULL AND NOT public.is_platform_superadmin(v_uid) THEN
      SELECT * INTO s FROM platform_private.b2b_actor_scope(v_uid);
      v_partner := s.org_partner;
    END IF;
  END IF;
  IF v_partner IS NULL THEN RAISE EXCEPTION 'buyer_required' USING ERRCODE='42501'; END IF;
  PERFORM platform_private.assert_b2b_partner_scope(v_uid, v_partner);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) LOOP
    v_res := public.fn_resolve_commercial_price('partner', v_partner, NULL, p_plan_id,
      NULLIF(v_item->>'product_id','')::uuid, NULLIF(v_item->>'microrganismo_id','')::uuid,
      v_item->>'unit_type', NULLIF(v_item->>'volume_ml','')::numeric,
      COALESCE(p_ref_date, current_date), NULLIF(v_item->>'quantity','')::numeric);
    v_out := v_out || jsonb_build_array(v_res || jsonb_build_object('item_ref', v_item->>'item_ref'));
  END LOOP;
  RETURN jsonb_build_object('buyer_scope','partner','plan_id',p_plan_id,
                            'ref_date',COALESCE(p_ref_date,current_date),'items',v_out);
END $function$
