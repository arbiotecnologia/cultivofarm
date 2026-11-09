CREATE OR REPLACE FUNCTION public.get_user_partner_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT min(partner_id::text)::uuid FROM public.partner_users WHERE user_id = auth.uid() $function$
