CREATE OR REPLACE FUNCTION public.is_operational_staff(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(_uid IS NOT NULL AND (
       public.has_role(_uid, 'administrador'::app_role)
    OR public.has_role(_uid, 'gestor'::app_role)
    OR public.has_role(_uid, 'administrativo'::app_role)
    OR public.has_role(_uid, 'consultor_tecnico'::app_role)
    OR public.has_role(_uid, 'tecnico_agronomo'::app_role)
    OR public.has_role(_uid, 'aplicador'::app_role)
    OR public.has_role(_uid, 'producao'::app_role)
    OR public.has_role(_uid, 'operador_onfarm'::app_role)
  ), false);
$function$

--ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

