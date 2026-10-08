DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF; END $$;
DO $$ DECLARE def text; name text; BEGIN
SELECT pg_get_functiondef('platform_private.b2b_internal_order_snapshot_guard()'::regprocedure) INTO def;
IF md5(def)<>'8294269d170fc826c9ee384e14c82177' THEN RAISE EXCEPTION 'GUARD_BASELINE_CHANGED'; END IF;
def:=replace(def,'IF NEW.status IN (''aprovado''', 'IF NEW.ready_for_production IS TRUE THEN RAISE EXCEPTION ''B2B_INTERNAL_DOWNSTREAM_UNVERIFIED'' USING ERRCODE=''42501''; END IF; IF NEW.status IN (''aprovado''');
def:=replace(def,'IF public.fn_b2b_status_is_operational(NEW.status) THEN', 'IF NEW.ready_for_production IS TRUE THEN RAISE EXCEPTION ''B2B_INTERNAL_DOWNSTREAM_UNVERIFIED'' USING ERRCODE=''42501''; END IF; IF public.fn_b2b_status_is_operational(NEW.status) THEN');
EXECUTE def;
FOREACH name IN ARRAY ARRAY['generate_production_orders_from_partner','generate_b2b_receivable_secure'] LOOP
SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=name;
IF (name='generate_production_orders_from_partner' AND md5(def)<>'68ca411c80fb9a191fdd55f65e171fc8') OR (name='generate_b2b_receivable_secure' AND md5(def)<>'93d768e8330a2cb40892be22f603cebd') THEN RAISE EXCEPTION 'DOWNSTREAM_BASELINE_CHANGED'; END IF;
def:=overlay(def placing E'BEGIN\n IF auth.uid() IS NULL THEN RAISE EXCEPTION ''auth_required'' USING ERRCODE=''42501''; END IF;\n IF EXISTS(SELECT 1 FROM public.partner_orders WHERE id=p_partner_order_id AND internal_origin_snapshot IS NOT NULL) THEN RAISE EXCEPTION ''B2B_INTERNAL_DOWNSTREAM_UNVERIFIED'' USING ERRCODE=''42501''; END IF;\n' from position(E'BEGIN\n' IN def) for 6);
EXECUTE def;
END LOOP;
SELECT pg_get_functiondef('public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)'::regprocedure) INTO def;
IF md5(def)<>'7308c7141d420a71423c058642f20d95' THEN RAISE EXCEPTION 'QUOTE_BASELINE_CHANGED'; END IF;
def:=replace(def,'IF v_order.payment_plan_id IS NULL THEN', 'IF EXISTS(SELECT 1 FROM public.partner_order_payment_terms WHERE partner_order_id=p_order_id) THEN RAISE EXCEPTION ''B2B_INTERNAL_QUOTE_REVISION_UNAVAILABLE'' USING ERRCODE=''42501''; END IF; IF v_order.payment_plan_id IS NULL THEN');
EXECUTE def;
END $$;