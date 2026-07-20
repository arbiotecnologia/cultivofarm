-- Remover a política baseada no campo de texto 'cargo'
DROP POLICY IF EXISTS "Leitura auditoria para gestores" ON public.clientes_audit_log;

-- Criar a nova política utilizando a função has_role (autoritativa)
CREATE POLICY "Leitura auditoria para gestores"
ON public.clientes_audit_log
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'administrador'::app_role)
);
