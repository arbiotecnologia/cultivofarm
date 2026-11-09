CREATE OR REPLACE FUNCTION public.fn_cc_can_prepare(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_uid IS NOT NULL AND (
    public.has_role(p_uid,'administrador'::app_role) OR
    public.has_role(p_uid,'financeiro'::app_role) OR
    public.has_role(p_uid,'gestor_comercial'::app_role));
$function$
