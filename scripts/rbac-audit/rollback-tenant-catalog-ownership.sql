-- ROLLBACK OPERACIONAL SEGURO do ownership — NÃO APLICAR sem revisão.
-- Este arquivo é deliberadamente NÃO ESTRUTURAL: fecha o gate e revoga toda superfície mutável.
-- Preserva colunas, policies, RLS, triggers/guards, leitores, índices, ledger e dados. Assim, privados já
-- existentes continuam isolados e referências cross-tenant continuam bloqueadas após o rollback.
-- Qualquer remoção estrutural deve viver em outro arquivo e abortar ANTES do primeiro DROP quando houver
-- privados ou dependências. Nenhuma remoção estrutural é necessária/autorizada nesta fase.
BEGIN;
UPDATE platform_private.catalog_ownership_gate SET enabled=false, readers_certified_at=NULL WHERE singleton;
REVOKE EXECUTE ON FUNCTION public.tenant_catalog_owned_mutate(text,text,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION platform_private.catalog_owned_mutate_core(text,text,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tenant_catalog_owned_presentation_mutate(text,uuid,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION platform_private.catalog_owned_presentation_mutate_core(text,uuid,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
-- Leitores permanecem disponíveis e sob as mesmas policies/escopo, para não quebrar histórico e permitir
-- que cada empresa continue lendo seus próprios itens já existentes. Não há DROP/ALTER/DELETE neste rollback.
COMMIT;
