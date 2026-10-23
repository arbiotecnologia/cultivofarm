CREATE OR REPLACE FUNCTION public.fn_b2b_plan_selectable(_plan_id uuid, _ref timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.commercial_payment_plans p
    WHERE p.id = _plan_id
      AND p.active = true
      AND p.superseded_by_id IS NULL
      AND p.valid_from <= _ref
      AND (p.valid_until IS NULL OR p.valid_until > _ref)
  );
$function$
