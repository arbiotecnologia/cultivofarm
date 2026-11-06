CREATE OR REPLACE FUNCTION public.b2b_phase1_partner_visible(p_partner uuid, p_technical boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.b2b_phase1_partner_visible(p_partner,p_technical); $function$
