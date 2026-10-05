DO $$
BEGIN
  IF current_database() IS NULL THEN
    RAISE EXCEPTION 'Banco canônico não identificado';
  END IF;
END
$$;

DROP POLICY IF EXISTS d51_5_microorganism_global_mutation ON public.microrganismos;
CREATE POLICY d51_5_microorganism_global_mutation
ON public.microrganismos
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.is_platform_superadmin(auth.uid()))
WITH CHECK (public.is_platform_superadmin(auth.uid()));

DROP POLICY IF EXISTS d51_5_system_config_global_mutation ON public.configuracoes_sistema;
CREATE POLICY d51_5_system_config_global_mutation
ON public.configuracoes_sistema
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.is_platform_superadmin(auth.uid()))
WITH CHECK (public.is_platform_superadmin(auth.uid()));

DROP POLICY IF EXISTS d51_5_financial_settings_global_mutation ON public.financial_settings;
CREATE POLICY d51_5_financial_settings_global_mutation
ON public.financial_settings
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.is_platform_superadmin(auth.uid()))
WITH CHECK (public.is_platform_superadmin(auth.uid()));