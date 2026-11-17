CREATE OR REPLACE FUNCTION public.fn_authz_uid_scope_ok(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NULL
      OR (_uid IS NOT NULL AND _uid = auth.uid())
      OR public.has_role(auth.uid(), 'administrador'::app_role);
$function$
