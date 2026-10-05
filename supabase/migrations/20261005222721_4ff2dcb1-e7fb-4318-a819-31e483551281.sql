CREATE OR REPLACE FUNCTION public.tg_recalc_risk_on_ar_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_partner uuid;
BEGIN
  SELECT ar.partner_id INTO v_partner
  FROM public.accounts_receivable ar
  WHERE ar.id = COALESCE(NEW.receivable_id, OLD.receivable_id)
    AND ar.origin_type = 'B2B_ORDER';
  IF v_partner IS NOT NULL THEN
    PERFORM public.recalc_partner_risk_score(v_partner);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.tg_recalc_risk_on_ar_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_recalc_risk_on_ar_change() TO service_role;