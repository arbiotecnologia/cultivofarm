-- REGISTRO HISTÓRICO — NÃO REAPLICAR.
-- Aplicado externamente pelo Codex no canônico swzpzcwiasxmjutrmvkm:
--   20261014184906 global_catalog_rejection_write_containment
-- Conteúdo conforme statement informado pelo usuário/Codex (não lido do histórico remoto por esta ferramenta).
REVOKE EXECUTE ON FUNCTION public.rejeitar_ficha_versao(uuid, text) FROM PUBLIC, anon, authenticated;
-- Rollback seguro: NÃO restaurar EXECUTE de cliente.
