DROP POLICY IF EXISTS "d51_5_system_config_platform_mutation" ON public.configuracoes_sistema;
CREATE POLICY "d51_5_system_config_platform_update"
ON public.configuracoes_sistema
FOR UPDATE
TO authenticated
USING (public.is_platform_superadmin((SELECT auth.uid())))
WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())));

DROP POLICY IF EXISTS "d51_5_platform_branding_insert" ON storage.objects;
CREATE POLICY "d51_5_platform_branding_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = 'platform'
  AND public.is_platform_superadmin((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "d51_5_platform_branding_update" ON storage.objects;
CREATE POLICY "d51_5_platform_branding_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = 'platform'
  AND public.is_platform_superadmin((SELECT auth.uid()))
)
WITH CHECK (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = 'platform'
  AND public.is_platform_superadmin((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "d51_5_platform_branding_delete" ON storage.objects;
CREATE POLICY "d51_5_platform_branding_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'logos'
  AND (storage.foldername(name))[1] = 'platform'
  AND public.is_platform_superadmin((SELECT auth.uid()))
);