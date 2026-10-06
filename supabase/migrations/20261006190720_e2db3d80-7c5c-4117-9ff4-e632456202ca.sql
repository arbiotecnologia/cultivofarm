-- Consolidação pós-D52: catálogo global e preço B2B (forward-only, idempotente).
-- Rollback: GRANT EXECUTE das 3 funções a authenticated; recriar as 2 policies removidas; restaurar can_view_catalog_internal sem a cláusula de entitlement.

-- 1) Resolvedores de preço com partner_id arbitrário: apenas uso interno (chamados por RPCs SECURITY DEFINER validadas).
REVOKE ALL ON FUNCTION public.fn_resolve_b2b_cart(uuid, uuid, jsonb, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_b2b_cart_hash(uuid, uuid, jsonb, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_resolve_commercial_price(text, uuid, uuid, uuid, uuid, uuid, text, numeric, date, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_b2b_cart(uuid, uuid, jsonb, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_b2b_cart_hash(uuid, uuid, jsonb, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_resolve_commercial_price(text, uuid, uuid, uuid, uuid, uuid, text, numeric, date, numeric) TO service_role;

-- 2) Catálogo global: mutação somente por Platform Superadmin (policies d51_5_*_global_mutation permanecem).
DROP POLICY IF EXISTS "Staff manage global products" ON public.produtos;
DROP POLICY IF EXISTS "Admin and Agronomo can insert/update microrganismos" ON public.microrganismos;

-- 3) Leitura interna do catálogo técnico: perfil/org ativos + papel + entitlement catalogo_precos; bypass explícito de Platform Superadmin.
CREATE OR REPLACE FUNCTION public.can_view_catalog_internal(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _uid IS NOT NULL AND (
    public.is_platform_superadmin(_uid)
    OR (
      public.fn_authz_uid_scope_ok(_uid)
      AND (public.has_role(_uid,'administrador') OR public.has_role(_uid,'gestor')
        OR public.has_role(_uid,'consultor_tecnico') OR public.has_role(_uid,'tecnico_agronomo')
        OR public.has_role(_uid,'gestor_comercial') OR public.has_role(_uid,'operador_onfarm')
        OR public.has_role(_uid,'producao') OR public.has_role(_uid,'administrativo')
        OR public.has_role(_uid,'financeiro'))
      AND EXISTS (SELECT 1 FROM platform_private.entitlements_for_user(_uid) e WHERE e.feature_key = 'catalogo_precos')
    )
  );
$function$;
REVOKE ALL ON FUNCTION public.can_view_catalog_internal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_catalog_internal(uuid) TO authenticated, service_role;