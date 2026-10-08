ALTER FUNCTION public.storage1_delivery_allowed(text,text) SET SCHEMA platform_private;
ALTER FUNCTION public.storage1_application_allowed(text,text) SET SCHEMA platform_private;
ALTER FUNCTION public.storage1_consultor_allowed(text,text) SET SCHEMA platform_private;
CREATE FUNCTION public.storage1_delivery_allowed(p_name text,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.storage1_delivery_allowed(p_name,p_action); $$;
CREATE FUNCTION public.storage1_application_allowed(p_name text,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.storage1_application_allowed(p_name,p_action); $$;
CREATE FUNCTION public.storage1_consultor_allowed(p_name text,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.storage1_consultor_allowed(p_name,p_action); $$;
REVOKE ALL ON FUNCTION public.storage1_delivery_allowed(text,text),public.storage1_application_allowed(text,text),public.storage1_consultor_allowed(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.storage1_delivery_allowed(text,text),public.storage1_application_allowed(text,text),public.storage1_consultor_allowed(text,text) TO authenticated,service_role;
-- Policy dependencies follow moved OIDs to non-exposed cores. No data or policy widening.
