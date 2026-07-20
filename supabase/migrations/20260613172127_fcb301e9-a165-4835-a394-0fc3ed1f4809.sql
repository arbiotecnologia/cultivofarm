
CREATE POLICY "Internal read produto-etiquetas"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'produto-etiquetas' AND (
      public.has_role(auth.uid(),'administrador'::app_role)
      OR public.has_role(auth.uid(),'gestor'::app_role)
      OR public.has_role(auth.uid(),'producao'::app_role)
      OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
      OR public.has_role(auth.uid(),'administrativo'::app_role)
    )
  );

CREATE POLICY "Internal write produto-etiquetas"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'produto-etiquetas' AND (
      public.has_role(auth.uid(),'administrador'::app_role)
      OR public.has_role(auth.uid(),'gestor'::app_role)
      OR public.has_role(auth.uid(),'producao'::app_role)
      OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
    )
  );

CREATE POLICY "Internal update produto-etiquetas"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'produto-etiquetas' AND (
      public.has_role(auth.uid(),'administrador'::app_role)
      OR public.has_role(auth.uid(),'gestor'::app_role)
      OR public.has_role(auth.uid(),'producao'::app_role)
    )
  );
