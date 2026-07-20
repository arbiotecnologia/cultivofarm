-- Adicionar política para permitir que consultores e técnicos criem solicitações (especialmente para retornos)
CREATE POLICY "Staff can create requests"
ON public.portal_solicitacoes
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'administrador') OR 
  has_role(auth.uid(), 'gestor') OR 
  has_role(auth.uid(), 'consultor_tecnico') OR 
  has_role(auth.uid(), 'tecnico_agronomo')
);

-- Garantir que consultores possam ver as solicitações que criaram
CREATE POLICY "Creators can view own requests"
ON public.portal_solicitacoes
FOR SELECT
TO authenticated
USING (created_by = auth.uid() OR user_id = auth.uid());
