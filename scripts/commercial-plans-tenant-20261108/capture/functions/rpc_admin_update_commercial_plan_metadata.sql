CREATE OR REPLACE FUNCTION public.rpc_admin_update_commercial_plan_metadata(p_plan_id uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_sort_order integer DEFAULT NULL::integer)
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
  IF p_sort_order IS NOT NULL AND p_sort_order < 0 THEN RAISE EXCEPTION 'sort_order_invalid'; END IF;
  IF p_name IS NOT NULL AND btrim(p_name) = '' THEN RAISE EXCEPTION 'plan_name_required'; END IF;

  UPDATE public.commercial_payment_plans
     SET name = coalesce(btrim(p_name), name),
         description = coalesce(p_description, description),
         sort_order = coalesce(p_sort_order, sort_order),
         updated_by = auth.uid()
   WHERE id = p_plan_id;

  PERFORM public._cpp_audit('commercial_plan_metadata_updated', p_plan_id, to_jsonb(v_old),
    jsonb_build_object('name', p_name, 'description', p_description, 'sort_order', p_sort_order), NULL);
END
$function$
