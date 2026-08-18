-- ============================================================================
-- H2 — Hardening do bucket legado `visit-pdfs`
-- Achado H2-001 (P1): políticas permitiam leitura/gravação por QUALQUER
-- usuário autenticado (inclusive cliente_produtor e parceiro_b2b), sem
-- vínculo com cliente/visita. Bucket legado, sem objetos e sem uso no código
-- (o fluxo atual usa `visitas-pdf`, já endurecido).
--
-- Correção: privar o bucket e restringir as políticas ao mesmo conjunto de
-- papéis internos aplicado a `visitas-pdf`. Nenhum dado é removido.
-- Idempotente. Somente staging (ikaauvsflpmamgxmkhoq).
-- ============================================================================

BEGIN;

UPDATE storage.buckets SET public = false WHERE id = 'visit-pdfs';

DROP POLICY IF EXISTS "authenticated_view_visit_pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem enviar PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Usuários podem deletar seus próprios PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Public read visit pdfs" ON storage.objects;

CREATE POLICY "visit_pdfs_staff_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'visit-pdfs' AND (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  )
);

CREATE POLICY "visit_pdfs_staff_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'visit-pdfs' AND (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  )
);

CREATE POLICY "visit_pdfs_staff_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'visit-pdfs' AND (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
  )
);

CREATE POLICY "visit_pdfs_admin_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'visit-pdfs' AND (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
  )
);

COMMIT;
