-- Add descricao column
ALTER TABLE public.cliente_documentos ADD COLUMN IF NOT EXISTS descricao TEXT;

-- Replace open policy with admin/administrativo only
DROP POLICY IF EXISTS "Acesso total documentos para autenticados" ON public.cliente_documentos;

CREATE POLICY "Admin e Administrativo podem ver documentos"
ON public.cliente_documentos FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Admin e Administrativo podem inserir documentos"
ON public.cliente_documentos FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Admin e Administrativo podem atualizar documentos"
ON public.cliente_documentos FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

CREATE POLICY "Admin e Administrativo podem excluir documentos"
ON public.cliente_documentos FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role));

-- Storage bucket policies
DROP POLICY IF EXISTS "Leitura docs clientes" ON storage.objects;
DROP POLICY IF EXISTS "Upload docs clientes" ON storage.objects;
DROP POLICY IF EXISTS "Deleção docs clientes" ON storage.objects;
DROP POLICY IF EXISTS "Update docs clientes" ON storage.objects;

CREATE POLICY "Admin e Administrativo leem clientes-docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'clientes-docs'
  AND (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
);

CREATE POLICY "Admin e Administrativo fazem upload clientes-docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'clientes-docs'
  AND (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
);

CREATE POLICY "Admin e Administrativo atualizam clientes-docs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'clientes-docs'
  AND (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
);

CREATE POLICY "Admin e Administrativo deletam clientes-docs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'clientes-docs'
  AND (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role))
);