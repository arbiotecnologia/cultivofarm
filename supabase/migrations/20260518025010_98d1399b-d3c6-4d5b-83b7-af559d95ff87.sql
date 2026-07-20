-- Tornar o bucket privado
UPDATE storage.buckets 
SET public = false 
WHERE id = 'consultor-arquivos';

-- Remover a política pública antiga
DROP POLICY IF EXISTS "public_view_consultor" ON storage.objects;

-- Criar nova política para usuários autenticados
CREATE POLICY "authenticated_view_consultor" 
ON storage.objects 
FOR SELECT 
TO authenticated 
USING (bucket_id = 'consultor-arquivos');