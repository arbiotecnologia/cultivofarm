-- Limpeza de políticas redundantes ou potencialmente conflitantes
DROP POLICY IF EXISTS "Authenticated can read talhao_safras" ON public.talhao_safras;
DROP POLICY IF EXISTS "ReadOnly global catalog" ON public.culturas;
DROP POLICY IF EXISTS "Authenticated users can read culturas" ON public.culturas;

-- Re-aplicar políticas limpas e diretas
CREATE POLICY "Portal: Ler culturas" ON public.culturas
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Portal: Ler safras dos talhões acessíveis" ON public.talhao_safras
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.talhoes t
    WHERE t.id = talhao_safras.talhao_id
    AND can_user_access_fazenda(t.fazenda_id)
  )
);

-- Garantir que a tabela user_clientes tenha políticas de leitura para o próprio usuário
DROP POLICY IF EXISTS "user_clientes self select" ON public.user_clientes;
CREATE POLICY "user_clientes self select" ON public.user_clientes
FOR SELECT TO authenticated
USING (user_id = auth.uid());
