ALTER FUNCTION public.notification_p1_visible(uuid,text,uuid,uuid) SET SCHEMA platform_private;
REVOKE ALL ON FUNCTION platform_private.notification_p1_visible(uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.notification_p1_visible(uuid,text,uuid,uuid) TO authenticated,service_role;
CREATE FUNCTION public.notification_p1_visible(uid uuid,st text,sid uuid,cid uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.notification_p1_visible(uid,st,sid,cid); $$;
REVOKE ALL ON FUNCTION public.notification_p1_visible(uuid,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notification_p1_visible(uuid,text,uuid,uuid) TO authenticated,service_role;