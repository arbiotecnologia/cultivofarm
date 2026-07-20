-- Tornar o bucket privado
UPDATE storage.buckets 
SET public = false 
WHERE id = 'visit-pdfs';

-- Remover a política pública antiga
DROP POLICY IF EXISTS "PDFs de visita são públicos para leitura" ON storage.objects;

-- Criar nova política para usuários autenticados
CREATE POLICY "authenticated_view_visit_pdfs" 
ON storage.objects 
FOR SELECT 
TO authenticated 
USING (bucket_id = 'visit-pdfs');