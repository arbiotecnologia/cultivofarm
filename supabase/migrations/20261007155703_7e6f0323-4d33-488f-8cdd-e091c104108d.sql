DO $$
DECLARE f text; name text;
BEGIN
 FOR name IN SELECT unnest(ARRAY['platform_claim_admin_access','platform_complete_org_admin_email_change']) LOOP
  SELECT pg_get_functiondef(p.oid) INTO f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=name;
  IF f IS NULL THEN RAISE EXCEPTION 'required_function_missing'; END IF;
  IF name='platform_claim_admin_access' THEN
   f:=replace(f,'UPDATE public.profiles SET senha_provisoria=true,updated_at=now()', 'UPDATE public.profiles SET senha_provisoria=true');
   f:=replace(f,'access_requested_at=clock_timestamp(),lease_token=t', 'access_requested_at=clock_timestamp(),access_valid_after=CASE WHEN p_kind=''temporary_password'' THEN clock_timestamp() ELSE access_valid_after END,lease_token=t');
  ELSE
   f:=replace(f,'UPDATE public.profiles SET email=c.new_email,updated_at=now()', 'UPDATE public.profiles SET email=c.new_email');
  END IF;
  EXECUTE f;
 END LOOP;
 SELECT pg_get_functiondef('platform_private.conclude_provisional_password_server(uuid)'::regprocedure) INTO f;
 f:=replace(f,'UPDATE public.profiles SET senha_provisoria=false,updated_at=now()', 'UPDATE public.profiles SET senha_provisoria=false');
 EXECUTE f;
END $$;
CREATE OR REPLACE FUNCTION platform_private.platform_actor_access_ready(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE)
 AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_user AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL AND auth.uid()=p_user AND to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint,0))<=i.access_valid_after)));
$$;
REVOKE ALL ON FUNCTION platform_private.platform_actor_access_ready(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.platform_actor_access_ready(uuid) TO authenticated,service_role;
DO $$ BEGIN
 IF to_regprocedure('platform_private.has_role(uuid,public.app_role)') IS NULL THEN ALTER FUNCTION public.has_role(uuid,public.app_role) SET SCHEMA platform_private; END IF;
 IF to_regprocedure('platform_private.h15_actor_organization()') IS NULL THEN ALTER FUNCTION public.h15_actor_organization() SET SCHEMA platform_private; END IF;
END $$;
CREATE OR REPLACE FUNCTION platform_private.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id));
$$;
CREATE OR REPLACE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id);
$$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $$ SELECT platform_private.has_role(_user_id,_role); $$;
CREATE OR REPLACE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $$ SELECT platform_private.h15_actor_organization(); $$;
REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role), public.h15_actor_organization(), platform_private.has_role(uuid,public.app_role), platform_private.h15_actor_organization() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role), public.h15_actor_organization(), platform_private.has_role(uuid,public.app_role), platform_private.h15_actor_organization() TO authenticated,service_role;
DROP FUNCTION IF EXISTS public.platform_actor_access_ready(uuid);
