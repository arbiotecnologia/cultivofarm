-- B2 NÃO EXECUTÁVEL / NÃO PROMOVIDO / SEM DDL ATIVO.
-- Destino exclusivo futuro: swzpzcwiasxmjutrmvkm; autorização e ref obrigatórios.
BEGIN;
-- Alternativa somente para revisão, NÃO remover comentário:
-- ALTER TABLE public.produtos ALTER COLUMN tipo DROP NOT NULL;
-- Gates: leitores/escritores nullable, gerador/unique código, ABI RPC/RETURNS TABLE,
-- tipos canônicos, sync pricing e guard condicional legado integralmente revisados.
-- ProdutosTab hoje usa solo e composição líquida: NÃO habilitar cadastro NULL.
-- Legado sem classificação continuaria exigindo tipo; sem reescrever/renumerar legado.
-- Inserts não homologados teriam ativo=false/b2b_enabled=false explícitos.
-- Fonte/versionamento/exclusão e ator ativo comprovados antes de qualquer promoção.
-- Reversão de NOT NULL só após provar zero NULL, sem tipo fictício/backfill;
-- preferir containment substitutiva preservando registros/histórico.
ROLLBACK;
