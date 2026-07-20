
-- Permitir produtor atualizar status do próprio registro após aprovação
CREATE POLICY "Produtor decide sobre recomendacao aprovada"
ON public.registros_consultor
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'cliente_produtor'::app_role)
  AND can_user_access_cliente(cliente_id)
  AND status = 'aprovado'::status_registro_consultor
)
WITH CHECK (
  has_role(auth.uid(), 'cliente_produtor'::app_role)
  AND can_user_access_cliente(cliente_id)
  AND status IN (
    'convertido_os'::status_registro_consultor,
    'finalizado'::status_registro_consultor,
    'reprovado'::status_registro_consultor
  )
);

-- Permitir produtor atualizar suas próprias solicitações no portal
CREATE POLICY "Portal users can update own requests"
ON public.portal_solicitacoes
FOR UPDATE
TO authenticated
USING (cliente_id = ANY (get_cliente_ids_for_user(auth.uid())))
WITH CHECK (cliente_id = ANY (get_cliente_ids_for_user(auth.uid())));
