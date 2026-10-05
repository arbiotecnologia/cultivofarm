CREATE OR REPLACE FUNCTION public.d51_5_can_access_estoque_embalagem(_estoque_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.h15_actor_organization() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.estoque_embalagens ee
         JOIN public.clientes c ON c.id = ee.cliente_id
        WHERE ee.id = _estoque_id
          AND c.organization_id = public.h15_actor_organization()
     )
$$;
REVOKE ALL ON FUNCTION public.d51_5_can_access_estoque_embalagem(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.d51_5_can_access_estoque_embalagem(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS d51_5_estoque_embalagens_tenant_guard ON public.estoque_embalagens;
CREATE POLICY d51_5_estoque_embalagens_tenant_guard
ON public.estoque_embalagens
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  cliente_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clientes c
     WHERE c.id = estoque_embalagens.cliente_id
       AND c.organization_id = public.h15_actor_organization()
  )
)
WITH CHECK (
  cliente_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clientes c
     WHERE c.id = estoque_embalagens.cliente_id
       AND c.organization_id = public.h15_actor_organization()
  )
);
