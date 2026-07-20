-- Bucket privado para armazenar PDFs de visita
INSERT INTO storage.buckets (id, name, public)
VALUES ('visitas-pdf', 'visitas-pdf', false)
ON CONFLICT (id) DO NOTHING;

-- Permitir uploads e leitura por usuários autenticados
CREATE POLICY "Authenticated users can upload visita PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'visitas-pdf');

CREATE POLICY "Authenticated users can read visita PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'visitas-pdf');

CREATE POLICY "Authenticated users can update visita PDFs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'visitas-pdf');