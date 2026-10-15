-- Rollback restritivo: preserva internos/notificações, NÃO restaura a brecha Produtor.
-- Transação única. Mantém dados/grants; bloqueia mutações Produtor até revisão.
CREATE POLICY producer_request_rollback_insert ON public.portal_solicitacoes AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (NOT platform_private.has_role(auth.uid(),'cliente_produtor'::public.app_role));
CREATE POLICY producer_request_rollback_update ON public.portal_solicitacoes AS RESTRICTIVE FOR UPDATE TO authenticated
USING (NOT platform_private.has_role(auth.uid(),'cliente_produtor'::public.app_role))
WITH CHECK (NOT platform_private.has_role(auth.uid(),'cliente_produtor'::public.app_role));
DROP TRIGGER a00_producer_request_mutation_guard ON public.portal_solicitacoes;
REVOKE ALL ON FUNCTION public.producer_request_mutation_guard() FROM PUBLIC,anon,authenticated,service_role;