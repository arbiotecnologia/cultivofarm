-- Rollback H2 (apenas se autorizado): restaura as policies legadas de visit-pdfs.
-- ATENÇÃO: reabre leitura/gravação a qualquer usuário autenticado (achado H2-001).
BEGIN;

DROP POLICY IF EXISTS "visit_pdfs_staff_select" ON storage.objects;
DROP POLICY IF EXISTS "visit_pdfs_staff_insert" ON storage.objects;
DROP POLICY IF EXISTS "visit_pdfs_staff_update" ON storage.objects;
DROP POLICY IF EXISTS "visit_pdfs_admin_delete" ON storage.objects;

CREATE POLICY "authenticated_view_visit_pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'visit-pdfs');

CREATE POLICY "Usuários autenticados podem enviar PDFs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'visit-pdfs' AND auth.role() = 'authenticated');

CREATE POLICY "Usuários podem deletar seus próprios PDFs"
ON storage.objects FOR DELETE
USING (bucket_id = 'visit-pdfs' AND auth.uid()::text = owner::text);

COMMIT;
