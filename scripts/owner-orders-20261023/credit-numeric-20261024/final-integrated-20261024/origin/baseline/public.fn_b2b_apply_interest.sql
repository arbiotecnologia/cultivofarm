CREATE OR REPLACE FUNCTION public.fn_b2b_apply_interest(p_net numeric, p_interest_type text, p_monthly_pct numeric, p_months numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_interest_type = 'none' OR COALESCE(p_monthly_pct,0) = 0 OR COALESCE(p_months,0) = 0
      THEN ROUND(p_net,2)
    WHEN p_interest_type = 'simple'
      THEN ROUND(p_net * (1 + (p_monthly_pct/100.0) * p_months), 2)
    ELSE ROUND(p_net * POWER(1 + (p_monthly_pct/100.0), p_months), 2)
  END
$function$
