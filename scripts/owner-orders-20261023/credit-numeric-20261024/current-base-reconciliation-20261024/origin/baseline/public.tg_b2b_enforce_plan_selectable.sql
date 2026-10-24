CREATE OR REPLACE FUNCTION public.tg_b2b_enforce_plan_selectable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_plan_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.payment_plan_id IS NOT DISTINCT FROM OLD.payment_plan_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.fn_b2b_plan_selectable(NEW.payment_plan_id) THEN
    RAISE EXCEPTION 'plan_not_selectable';
  END IF;
  RETURN NEW;
END
$function$
