DROP POLICY IF EXISTS "auth_insert_recomendacoes" ON public.registros_consultor_recomendacoes;
DROP POLICY IF EXISTS "auth_update_recomendacoes" ON public.registros_consultor_recomendacoes;
DROP POLICY IF EXISTS "auth_delete_recomendacoes" ON public.registros_consultor_recomendacoes;

CREATE POLICY "Staff and owner manage recomendacoes"
ON public.registros_consultor_recomendacoes
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
  OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = registro_consultor_id
      AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
  OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = registro_consultor_id
      AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid())
  )
);