-- Fix policies for public.cliente_documentos
DROP POLICY IF EXISTS "Authenticated users can insert cliente_documentos" ON public.cliente_documentos;
DROP POLICY IF EXISTS "Authenticated users can update cliente_documentos" ON public.cliente_documentos;

CREATE POLICY "Users can insert their own client documents"
ON public.cliente_documentos
FOR INSERT
TO authenticated
WITH CHECK (
  cliente_id = get_cliente_id_for_user(auth.uid())
);

CREATE POLICY "Users can update their own client documents"
ON public.cliente_documentos
FOR UPDATE
TO authenticated
USING (
  cliente_id = get_cliente_id_for_user(auth.uid())
);

CREATE POLICY "Users can delete their own client documents"
ON public.cliente_documentos
FOR DELETE
TO authenticated
USING (
  cliente_id = get_cliente_id_for_user(auth.uid())
);

-- Fix policies for storage.objects (clientes-docs bucket)
DROP POLICY IF EXISTS "Authenticated read clientes-docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update clientes-docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload clientes-docs" ON storage.objects;

-- Staff access to all files in clientes-docs
CREATE POLICY "Staff can access all clientes-docs"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'clientes-docs' AND (
    has_role(auth.uid(), 'administrador'::app_role) OR 
    has_role(auth.uid(), 'gestor'::app_role) OR 
    has_role(auth.uid(), 'administrativo'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'clientes-docs' AND (
    has_role(auth.uid(), 'administrador'::app_role) OR 
    has_role(auth.uid(), 'gestor'::app_role) OR 
    has_role(auth.uid(), 'administrativo'::app_role)
  )
);

-- Producer access to their own folder
CREATE POLICY "Producers can read their own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'clientes-docs' AND 
  (storage.foldername(name))[1] = get_cliente_id_for_user(auth.uid())::text
);

CREATE POLICY "Producers can upload their own documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'clientes-docs' AND 
  (storage.foldername(name))[1] = get_cliente_id_for_user(auth.uid())::text
);

CREATE POLICY "Producers can update their own documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'clientes-docs' AND 
  (storage.foldername(name))[1] = get_cliente_id_for_user(auth.uid())::text
);

CREATE POLICY "Producers can delete their own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'clientes-docs' AND 
  (storage.foldername(name))[1] = get_cliente_id_for_user(auth.uid())::text
);
