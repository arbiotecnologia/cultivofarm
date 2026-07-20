-- Garantir permissões básicas para o perfil autenticado
GRANT SELECT ON public.fazendas TO authenticated;
GRANT SELECT ON public.talhoes TO authenticated;
GRANT SELECT ON public.talhao_safras TO authenticated;
GRANT SELECT ON public.culturas TO authenticated;

-- Ajustar políticas de RLS para garantir que a função can_user_access_cliente funcione corretamente
DROP POLICY IF EXISTS "Talhoes read access" ON public.talhoes;
CREATE POLICY "Talhoes read access" ON public.talhoes
FOR SELECT TO authenticated
USING (
  can_user_access_fazenda(fazenda_id)
);

-- Garantir que a política de safras também esteja correta
DROP POLICY IF EXISTS "Authenticated users can read talhao_safras" ON public.talhao_safras;
CREATE POLICY "Authenticated users can read talhao_safras" ON public.talhao_safras
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.talhoes t
    WHERE t.id = talhao_safras.talhao_id
    AND can_user_access_fazenda(t.fazenda_id)
  )
);
