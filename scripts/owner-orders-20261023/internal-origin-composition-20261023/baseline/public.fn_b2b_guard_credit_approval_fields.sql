CREATE OR REPLACE FUNCTION public.fn_b2b_guard_credit_approval_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.credit_approved_at IS DISTINCT FROM OLD.credit_approved_at)
     OR (NEW.credit_approved_by IS DISTINCT FROM OLD.credit_approved_by) THEN
    IF COALESCE(current_setting('arbio.b2b_credit_approval', true), 'off') <> 'on' THEN
      RAISE EXCEPTION 'credit_approval_fields_immutable: use approve_b2b_credit';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
