-- STAGING_GUARD normalizado (portatil / forward-only):
-- recusa apenas ambiente comprovadamente de PRODUCAO. Em banco novo (marker ausente)
-- a migration segue adiante, tornando o replay reprodutivel fora deste projeto.
DO $guard$
DECLARE v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NOT NULL THEN
    EXECUTE 'SELECT project_ref FROM public._fiscal_staging_marker WHERE marker = ''STAGING'' LIMIT 1'
      INTO v_ref;
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref de PRODUCAO recusado';
  END IF;
END
$guard$;

DROP TABLE IF EXISTS public._motor_b2b_fase1_int_evidence;
DROP TABLE IF EXISTS public._motor_b2b_fase1_quote_evidence;

CREATE OR REPLACE FUNCTION public.fn_b2b_cart_hash(p_plan_id uuid, p_cart jsonb, p_final numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $fn$
  SELECT md5(
    COALESCE(p_plan_id::text,'-') || '|' ||
    to_char(ROUND(COALESCE(p_final,0),2),'FM9999999999990.00') || '|' ||
    COALESCE((
      SELECT string_agg(
        (l->>'item_id') || ':' ||
        to_char(ROUND(COALESCE((l->>'quantidade')::numeric,0),4),'FM9999999999990.0000') || ':' ||
        to_char(ROUND(COALESCE((l->>'final_unit_price')::numeric,0),4),'FM9999999999990.0000') || ':' ||
        to_char(ROUND(COALESCE((l->>'line_final_amount')::numeric,0),2),'FM9999999999990.00'),
        ';' ORDER BY (l->>'item_id'),
                     COALESCE((l->>'volume_ml'),''),
                     COALESCE((l->>'unidade_medida'),''))
      FROM jsonb_array_elements(COALESCE(p_cart->'lines','[]'::jsonb)) l
    ),'') || '|' ||
    COALESCE((p_cart->>'quote_required'),'false')
  )
$fn$;
REVOKE ALL ON FUNCTION public.fn_b2b_cart_hash(uuid,jsonb,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_b2b_cart_hash(uuid,jsonb,numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_b2b_cart_hash(uuid,jsonb,numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_resolve_commercial_prices(
  p_items jsonb, p_plan_id uuid, p_ref_date date DEFAULT CURRENT_DATE, p_buyer jsonb DEFAULT NULL::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_staff boolean; v_scope text; v_partner uuid; v_cnt int;
  v_item jsonb; v_res jsonb; v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='P0001'; END IF;

  v_is_staff := public.has_role(v_uid,'administrador')
             OR public.has_role(v_uid,'financeiro')
             OR public.has_role(v_uid,'gestor_comercial');

  IF v_is_staff THEN
    v_scope := COALESCE(p_buyer->>'buyer_scope','partner');
    IF v_scope <> 'partner' OR NULLIF(p_buyer->>'customer_id','') IS NOT NULL THEN
      RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
    END IF;
    v_partner := NULLIF(p_buyer->>'partner_id','')::uuid;
  ELSIF public.has_role(v_uid,'parceiro_b2b') THEN
    IF NULLIF(p_buyer->>'customer_id','') IS NOT NULL THEN
      RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
    END IF;
    SELECT count(*) INTO v_cnt FROM public.partner_users WHERE user_id = v_uid;
    IF v_cnt <> 1 THEN RAISE EXCEPTION 'partner_link_ambiguous' USING ERRCODE='P0001'; END IF;
    SELECT partner_id INTO v_partner FROM public.partner_users WHERE user_id = v_uid;
    v_scope := 'partner';
  ELSIF public.has_role(v_uid,'cliente_produtor') THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
  ELSE
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE='P0001';
  END IF;

  IF v_partner IS NULL THEN RAISE EXCEPTION 'buyer_required' USING ERRCODE='P0001'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb))
  LOOP
    v_res := public.fn_resolve_commercial_price(
      'partner', v_partner, NULL, p_plan_id,
      NULLIF(v_item->>'product_id','')::uuid,
      NULLIF(v_item->>'microrganismo_id','')::uuid,
      v_item->>'unit_type',
      NULLIF(v_item->>'volume_ml','')::numeric,
      COALESCE(p_ref_date, current_date));
    v_out := v_out || jsonb_build_array(v_res || jsonb_build_object('item_ref', v_item->>'item_ref'));
  END LOOP;

  RETURN jsonb_build_object('buyer_scope','partner','plan_id',p_plan_id,
                            'ref_date',COALESCE(p_ref_date,current_date),'items',v_out);
END $function$;
REVOKE ALL ON FUNCTION public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_commercial_price_rules_producer_inert()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.buyer_scope = 'customer' AND COALESCE(NEW.active,true) THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_commercial_price_rules_producer_inert ON public.commercial_price_rules;
CREATE TRIGGER trg_commercial_price_rules_producer_inert
  BEFORE INSERT OR UPDATE ON public.commercial_price_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_price_rules_producer_inert();

CREATE OR REPLACE FUNCTION public.rpc_b2b_partner_credit(p_partner_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid := auth.uid(); v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='P0001'; END IF;
  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'partner_required' USING ERRCODE='P0001'; END IF;
  v_ok := public.has_role(v_uid,'administrador')
       OR public.has_role(v_uid,'financeiro')
       OR public.has_role(v_uid,'gestor_comercial')
       OR ( public.has_role(v_uid,'parceiro_b2b')
            AND EXISTS (SELECT 1 FROM public.partner_users pu
                        WHERE pu.user_id = v_uid AND pu.partner_id = p_partner_id) );
  IF NOT v_ok THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='P0001'; END IF;
  RETURN public.fn_b2b_credit_exposure(p_partner_id, 0, NULL);
END $function$;
REVOKE ALL ON FUNCTION public.rpc_b2b_partner_credit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_b2b_partner_credit(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_partner_credit(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_b2b_order_priceable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_b2b_order_priceable(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_b2b_order_priceable(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date) TO authenticated, service_role;