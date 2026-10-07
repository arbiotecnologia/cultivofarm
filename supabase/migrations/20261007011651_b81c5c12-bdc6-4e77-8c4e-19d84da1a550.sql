-- Padrão do projeto: RPC pública SECURITY INVOKER; núcleo privilegiado fora do schema exposto.
ALTER FUNCTION public.platform_update_organization_profile(uuid,text,text,text,text,timestamptz,uuid) SET SCHEMA platform_private;
ALTER FUNCTION platform_private.platform_update_organization_profile(uuid,text,text,text,text,timestamptz,uuid) RENAME TO update_organization_profile_core;
REVOKE ALL ON FUNCTION platform_private.update_organization_profile_core(uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.update_organization_profile_core(uuid,text,text,text,text,timestamptz,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_update_organization_profile(
  _org uuid, _razao_social text, _nome_fantasia text, _email text,
  _motivo text, _expected_updated_at timestamptz, _idempotency_key uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  RETURN platform_private.update_organization_profile_core(_org,_razao_social,_nome_fantasia,_email,_motivo,_expected_updated_at,_idempotency_key);
END $$;
REVOKE ALL ON FUNCTION public.platform_update_organization_profile(uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_organization_profile(uuid,text,text,text,text,timestamptz,uuid) TO authenticated;