-- H8-B1 ROLLBACK — recria a policy permissiva de SELECT removida pela migration
-- 20261002000000_h8b1_redundant_select_policy_v1.sql, com definição idêntica à original
-- (registrada em private.h8a_policy_audit, fase H8-B1).
-- Uso somente no staging ikaauvsflpmamgxmkhoq. Não remove o histórico de auditoria.

DROP POLICY IF EXISTS "Staff can view all client documents" ON public.cliente_documentos;

CREATE POLICY "Staff can view all client documents"
    ON public.cliente_documentos
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (
        has_role((SELECT auth.uid() AS uid), 'administrador'::app_role)
        OR has_role((SELECT auth.uid() AS uid), 'gestor'::app_role)
        OR has_role((SELECT auth.uid() AS uid), 'administrativo'::app_role)
    );
