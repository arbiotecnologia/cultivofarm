CREATE OR REPLACE FUNCTION public.consultor_storage_path_allowed(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND p.ativo = true
       AND p.organization_id IS NOT NULL
       AND split_part(p_name, '/', 1) = p.organization_id::text
       AND EXISTS (
         SELECT 1
           FROM public.user_roles ur
          WHERE ur.user_id = p.user_id
            AND ur.role = ANY (ARRAY[
              'administrador'::public.app_role,
              'gestor'::public.app_role,
              'consultor_tecnico'::public.app_role,
              'tecnico_agronomo'::public.app_role,
              'aplicador'::public.app_role,
              'cliente_produtor'::public.app_role
            ])
       )
  );
$$;

REVOKE ALL ON FUNCTION public.consultor_storage_path_allowed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultor_storage_path_allowed(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "public_view_consultor" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_view_consultor" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to view files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete files" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_consultor" ON storage.objects;
DROP POLICY IF EXISTS "auth_upload_consultor" ON storage.objects;
DROP POLICY IF EXISTS "Scoped select for consultor-arquivos" ON storage.objects;
DROP POLICY IF EXISTS "Scoped insert for consultor-arquivos" ON storage.objects;
DROP POLICY IF EXISTS "Scoped update for consultor-arquivos" ON storage.objects;
DROP POLICY IF EXISTS "Scoped delete for consultor-arquivos" ON storage.objects;
DROP POLICY IF EXISTS "Acesso controlado às evidências técnicas" ON storage.objects;
DROP POLICY IF EXISTS "Consultores podem subir evidências de suas visitas" ON storage.objects;
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
  AND public.consultor_storage_path_allowed(name)
);

CREATE POLICY "d516_consultor_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'consultor-arquivos'
  AND public.consultor_storage_path_allowed(name)
);

CREATE POLICY "d516_consultor_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'consultor-arquivos'
  AND public.consultor_storage_path_allowed(name)
)
WITH CHECK (
  bucket_id = 'consultor-arquivos'
  AND public.consultor_storage_path_allowed(name)
);

CREATE POLICY "d516_consultor_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'consultor-arquivos'
  AND public.consultor_storage_path_allowed(name)
);