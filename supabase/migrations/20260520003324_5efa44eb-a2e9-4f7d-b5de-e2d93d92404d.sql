-- Remover a política anterior
DROP POLICY IF EXISTS "Scoped select for consultor-arquivos" ON storage.objects;

-- Criar nova política que permite acesso a toda a equipe vinculada ao cliente
CREATE POLICY "Scoped select for consultor-arquivos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'consultor-arquivos' AND (
    (auth.uid() = owner) OR
    public.has_role(auth.uid(), 'administrador') OR
    public.has_role(auth.uid(), 'gestor') OR
    EXISTS (
      SELECT 1 
      FROM public.user_clientes uc 
      WHERE uc.user_id = auth.uid() 
      AND uc.cliente_id::text = (storage.foldername(name))[1]
    )
  )
);