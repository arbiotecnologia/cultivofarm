-- Garantir que o bucket consultor-arquivos seja privado
UPDATE storage.buckets SET public = false WHERE id = 'consultor-arquivos';

-- Remover políticas legadas/duplicadas para evitar conflitos
DROP POLICY IF EXISTS "Allow authenticated users to view files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete files" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_consultor" ON storage.objects;
DROP POLICY IF EXISTS "auth_upload_consultor" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_view_consultor" ON storage.objects;

-- Criar novas políticas refinadas

-- SELECT: Permite visualizar se for dono, admin, gestor ou o cliente produtor vinculado à pasta
CREATE POLICY "Scoped select for consultor-arquivos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'consultor-arquivos' AND (
    (auth.uid() = owner) OR
    public.has_role(auth.uid(), 'administrador') OR
    public.has_role(auth.uid(), 'gestor') OR
    ((storage.foldername(name))[1] = (public.get_cliente_id_for_user(auth.uid()))::text)
  )
);

-- INSERT: Permite upload para consultores, admins, gestores ou se for o dono (para o próprio cliente)
CREATE POLICY "Scoped insert for consultor-arquivos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'consultor-arquivos' AND (
    public.has_role(auth.uid(), 'administrador') OR
    public.has_role(auth.uid(), 'gestor') OR
    public.has_role(auth.uid(), 'consultor_tecnico') OR
    ((storage.foldername(name))[1] = (public.get_cliente_id_for_user(auth.uid()))::text)
  )
);

-- UPDATE: Apenas o dono ou admins/gestores
CREATE POLICY "Scoped update for consultor-arquivos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'consultor-arquivos' AND (
    (auth.uid() = owner) OR
    public.has_role(auth.uid(), 'administrador') OR
    public.has_role(auth.uid(), 'gestor')
  )
);

-- DELETE: Apenas o dono ou admins/gestores
CREATE POLICY "Scoped delete for consultor-arquivos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'consultor-arquivos' AND (
    (auth.uid() = owner) OR
    public.has_role(auth.uid(), 'administrador') OR
    public.has_role(auth.uid(), 'gestor')
  )
);