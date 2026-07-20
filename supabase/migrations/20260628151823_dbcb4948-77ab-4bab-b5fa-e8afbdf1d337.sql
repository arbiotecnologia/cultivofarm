
CREATE POLICY "partner_docs_admin_gestor_all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'partner-docs' AND (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')))
  WITH CHECK (bucket_id = 'partner-docs' AND (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')));

CREATE POLICY "partner_docs_financeiro_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'partner-docs' AND public.has_role(auth.uid(),'financeiro'));
