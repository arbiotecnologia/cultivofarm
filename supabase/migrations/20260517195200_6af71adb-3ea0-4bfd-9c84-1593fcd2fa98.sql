
-- Ampliar acesso a cliente_documentos para usuários autenticados,
-- alinhando com a política da tabela clientes. Exclusão segue restrita a admin.
DROP POLICY IF EXISTS "Admin e Administrativo podem ver documentos" ON public.cliente_documentos;
DROP POLICY IF EXISTS "Admin e Administrativo podem inserir documentos" ON public.cliente_documentos;
DROP POLICY IF EXISTS "Admin e Administrativo podem atualizar documentos" ON public.cliente_documentos;
DROP POLICY IF EXISTS "Admin e Administrativo podem excluir documentos" ON public.cliente_documentos;

CREATE POLICY "Authenticated users can read cliente_documentos"
  ON public.cliente_documentos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert cliente_documentos"
  ON public.cliente_documentos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update cliente_documentos"
  ON public.cliente_documentos FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete cliente_documentos"
  ON public.cliente_documentos FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

-- Storage: mesmo alinhamento para o bucket clientes-docs
DROP POLICY IF EXISTS "Admin e Administrativo leem clientes-docs" ON storage.objects;
DROP POLICY IF EXISTS "Admin e Administrativo fazem upload clientes-docs" ON storage.objects;
DROP POLICY IF EXISTS "Admin e Administrativo atualizam clientes-docs" ON storage.objects;
DROP POLICY IF EXISTS "Admin e Administrativo deletam clientes-docs" ON storage.objects;

CREATE POLICY "Authenticated read clientes-docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'clientes-docs');

CREATE POLICY "Authenticated upload clientes-docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'clientes-docs');

CREATE POLICY "Authenticated update clientes-docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'clientes-docs');

CREATE POLICY "Admins delete clientes-docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'clientes-docs' AND (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)));
