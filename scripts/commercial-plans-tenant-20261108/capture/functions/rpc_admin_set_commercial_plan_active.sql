CREATE OR REPLACE FUNCTION public.rpc_admin_set_commercial_plan_active(p_plan_id uuid, p_active boolean, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old public.commercial_payment_plans%ROWTYPE;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_old FROM public.commercial_payment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF p_active AND v_old.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'plan_superseded_cannot_activate'; END IF;

  UPDATE public.commercial_payment_plans
     SET active = p_active,
         is_default = CASE WHEN p_active THEN is_default ELSE false END,
         updated_by = auth.uid()
   WHERE id = p_plan_id;

  PERFORM public._cpp_audit(CASE WHEN p_active THEN 'commercial_plan_activated' ELSE 'commercial_plan_deactivated' END,
    p_plan_id, to_jsonb(v_old), jsonb_build_object('active', p_active), p_motivo);
END
$function$
