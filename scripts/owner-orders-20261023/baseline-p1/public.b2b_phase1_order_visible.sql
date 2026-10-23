CREATE OR REPLACE FUNCTION public.b2b_phase1_order_visible(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.b2b_phase1_order_visible(p_order); $function$

