CREATE OR REPLACE FUNCTION public.rpc_admin_set_default_commercial_plan(p_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old public.commercial_payment_plans%ROWTYPE; v_prev public.commercial_payment_plans%ROWTYPE;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cpp_default_plan'));
  SELECT * INTO v_old FROM public.commercial_payment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF NOT public.fn_b2b_plan_selectable(p_plan_id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;

  SELECT * INTO v_prev FROM public.commercial_payment_plans
   WHERE is_default AND id <> p_plan_id FOR UPDATE;

  UPDATE public.commercial_payment_plans SET is_default = false, updated_by = auth.uid()
   WHERE is_default AND id <> p_plan_id;
  UPDATE public.commercial_payment_plans SET is_default = true, updated_by = auth.uid()
   WHERE id = p_plan_id;

  IF v_prev.id IS NOT NULL THEN
    PERFORM public._cpp_audit(
      'commercial_plan_unset_default',
      v_prev.id,
      jsonb_build_object('is_default', true, 'code', v_prev.code, 'name', v_prev.name),
      jsonb_build_object('is_default', false, 'replaced_by_plan_id', p_plan_id),
      'substituido_por_novo_plano_padrao');
  END IF;

  PERFORM public._cpp_audit(
    'commercial_plan_set_default',
    p_plan_id,
    jsonb_build_object('is_default', v_old.is_default, 'code', v_old.code, 'name', v_old.name),
    jsonb_build_object('is_default', true, 'previous_default_plan_id', v_prev.id),
    NULL);
END
$function$
