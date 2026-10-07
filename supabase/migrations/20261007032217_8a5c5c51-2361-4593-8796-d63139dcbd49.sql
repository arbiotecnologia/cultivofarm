ALTER FUNCTION public.platform_create_organization(text,text,text,text,text,boolean,jsonb) SET SCHEMA platform_private;
ALTER FUNCTION platform_private.platform_create_organization(text,text,text,text,text,boolean,jsonb) RENAME TO create_organization_core;
REVOKE ALL ON FUNCTION platform_private.create_organization_core(text,text,text,text,text,boolean,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.create_organization_core(text,text,text,text,text,boolean,jsonb) TO authenticated, service_role;

CREATE FUNCTION public.platform_create_organization(_nome text, _nome_fantasia text, _cnpj text, _email text, _plan_key text, _rascunho boolean DEFAULT false, _dados jsonb DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  RETURN platform_private.create_organization_core(_nome,_nome_fantasia,_cnpj,_email,_plan_key,_rascunho,_dados);
END $function$;
REVOKE ALL ON FUNCTION public.platform_create_organization(text,text,text,text,text,boolean,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_organization(text,text,text,text,text,boolean,jsonb) TO authenticated, service_role;