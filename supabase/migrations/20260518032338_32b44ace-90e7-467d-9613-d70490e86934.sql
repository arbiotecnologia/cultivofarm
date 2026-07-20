CREATE POLICY "Consultants can view their assigned requests"
ON public.portal_solicitacoes
FOR SELECT
TO authenticated
USING (
  consultor_atribuido = auth.uid()
  AND (
    has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
    OR has_role(auth.uid(), 'aplicador'::app_role)
  )
);