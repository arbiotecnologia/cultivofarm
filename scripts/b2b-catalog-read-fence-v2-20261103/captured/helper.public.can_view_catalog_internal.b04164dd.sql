CREATE OR REPLACE FUNCTION public.can_view_catalog_internal(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT _uid IS NOT NULL
     AND (auth.uid() IS NULL AND current_user IN ('service_role','postgres') OR _uid = auth.uid())
     AND (
       public.is_platform_superadmin(_uid)
       OR (
         EXISTS (SELECT 1 FROM public.profiles p JOIN public.organizations o ON o.id = p.organization_id
                  WHERE p.user_id = _uid AND p.ativo = true AND o.ativo = true AND o.status = 'ativa')
         AND (public.has_role(_uid,'administrador') OR public.has_role(_uid,'gestor')
           OR public.has_role(_uid,'consultor_tecnico') OR public.has_role(_uid,'tecnico_agronomo')
           OR public.has_role(_uid,'gestor_comercial') OR public.has_role(_uid,'operador_onfarm')
           OR public.has_role(_uid,'producao') OR public.has_role(_uid,'administrativo')
           OR public.has_role(_uid,'financeiro'))
         AND EXISTS (SELECT 1 FROM platform_private.entitlements_for_user(_uid) e WHERE e.feature_key = 'catalogo_precos')
       )
     );
$function$
