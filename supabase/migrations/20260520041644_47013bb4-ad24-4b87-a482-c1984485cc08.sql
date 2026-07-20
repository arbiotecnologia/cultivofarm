-- Remover política antiga
DROP POLICY IF EXISTS "Usuários podem ver histórico de OS que acessam" ON public.ordens_servico_onfarm_status_history;

-- Criar nova política restritiva por perfil
CREATE POLICY "Apenas Admin e Gestor acessam histórico de auditoria"
ON public.ordens_servico_onfarm_status_history
FOR SELECT
TO authenticated
USING (
    (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor'))
    AND EXISTS (
        SELECT 1 FROM public.ordens_servico_onfarm os
        WHERE os.id = os_onfarm_id
        AND public.can_user_access_cliente(os.cliente_id)
    )
);
