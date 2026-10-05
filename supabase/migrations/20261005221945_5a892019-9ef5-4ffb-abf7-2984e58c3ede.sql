DROP POLICY IF EXISTS "d516_consultor_select" ON storage.objects;
DROP POLICY IF EXISTS "d516_consultor_insert" ON storage.objects;
DROP POLICY IF EXISTS "d516_consultor_update" ON storage.objects;
DROP POLICY IF EXISTS "d516_consultor_delete" ON storage.objects;

CREATE POLICY "d516_consultor_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'consultor-arquivos'
  AND EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND p.ativo = true
       AND p.organization_id IS NOT NULL
       AND split_part(objects.name, '/', 1) = p.organization_id::text
       AND EXISTS (
         SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
            AND ur.role = ANY (ARRAY['administrador'::public.app_role,'gestor'::public.app_role,'consultor_tecnico'::public.app_role,'tecnico_agronomo'::public.app_role,'aplicador'::public.app_role,'cliente_produtor'::public.app_role])
       )
  )
);

CREATE POLICY "d516_consultor_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'consultor-arquivos'
  AND EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND p.ativo = true
       AND p.organization_id IS NOT NULL
       AND split_part(objects.name, '/', 1) = p.organization_id::text
       AND EXISTS (
         SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
            AND ur.role = ANY (ARRAY['administrador'::public.app_role,'gestor'::public.app_role,'consultor_tecnico'::public.app_role,'tecnico_agronomo'::public.app_role,'aplicador'::public.app_role,'cliente_produtor'::public.app_role])
       )
  )
);

CREATE POLICY "d516_consultor_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'consultor-arquivos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid() AND p.ativo = true AND p.organization_id IS NOT NULL
       AND split_part(objects.name, '/', 1) = p.organization_id::text
       AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = ANY (ARRAY['administrador'::public.app_role,'gestor'::public.app_role,'consultor_tecnico'::public.app_role,'tecnico_agronomo'::public.app_role,'aplicador'::public.app_role,'cliente_produtor'::public.app_role]))
  )
)
WITH CHECK (
  bucket_id = 'consultor-arquivos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid() AND p.ativo = true AND p.organization_id IS NOT NULL
       AND split_part(objects.name, '/', 1) = p.organization_id::text
       AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = ANY (ARRAY['administrador'::public.app_role,'gestor'::public.app_role,'consultor_tecnico'::public.app_role,'tecnico_agronomo'::public.app_role,'aplicador'::public.app_role,'cliente_produtor'::public.app_role]))
  )
);

CREATE POLICY "d516_consultor_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'consultor-arquivos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid() AND p.ativo = true AND p.organization_id IS NOT NULL
       AND split_part(objects.name, '/', 1) = p.organization_id::text
       AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = ANY (ARRAY['administrador'::public.app_role,'gestor'::public.app_role,'consultor_tecnico'::public.app_role,'tecnico_agronomo'::public.app_role,'aplicador'::public.app_role,'cliente_produtor'::public.app_role]))
  )
);

REVOKE ALL ON FUNCTION public.consultor_storage_path_allowed(text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.consultor_storage_path_allowed(text);