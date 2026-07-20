DROP POLICY IF EXISTS "Authenticated users can read visita PDFs"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload visita PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update visita PDFs" ON storage.objects;

CREATE POLICY "Staff can read visita PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'visitas-pdf' AND (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  )
);

CREATE POLICY "Staff can upload visita PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'visitas-pdf' AND (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  )
);

CREATE POLICY "Staff can update visita PDFs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'visitas-pdf' AND (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  )
);

CREATE POLICY "Admins can delete visita PDFs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'visitas-pdf' AND (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
  )
);