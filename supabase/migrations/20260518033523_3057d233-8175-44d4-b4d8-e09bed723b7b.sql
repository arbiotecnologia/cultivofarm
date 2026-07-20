-- Remover a política permissiva
DROP POLICY IF EXISTS "Consultores podem ver versões de seus registros" ON public.registros_consultor_pdf_versions;

-- Criar política segura e restrita ao papel 'authenticated'
CREATE POLICY "Users can view relevant PDF versions"
ON public.registros_consultor_pdf_versions
FOR SELECT
TO authenticated
USING (
  -- Staff e Admins podem ver tudo
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
  OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  -- O próprio criador pode ver
  OR created_by = auth.uid()
  -- O cliente dono do registro pode ver
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = registro_consultor_id
    AND r.cliente_id = get_cliente_id_for_user(auth.uid())
  )
);
