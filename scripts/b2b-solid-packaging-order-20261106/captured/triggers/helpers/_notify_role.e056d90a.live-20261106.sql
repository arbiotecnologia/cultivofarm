CREATE OR REPLACE FUNCTION public._notify_role(p_role app_role, p_tipo text, p_titulo text, p_mensagem text, p_link text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN RETURN; END $function$
