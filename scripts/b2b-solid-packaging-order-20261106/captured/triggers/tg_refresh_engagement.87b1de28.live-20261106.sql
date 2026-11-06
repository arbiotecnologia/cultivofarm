CREATE OR REPLACE FUNCTION public.tg_refresh_engagement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.refresh_partner_engagement(COALESCE(NEW.partner_id, OLD.partner_id));
  RETURN COALESCE(NEW, OLD);
END $function$
