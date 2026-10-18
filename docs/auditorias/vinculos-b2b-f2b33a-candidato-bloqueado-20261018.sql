-- B3.3-A: proposta revisável, NÃO é installer funcional.
-- Nenhum corpo operacional/GRANT é fornecido sem contratos/gates aprovados.
-- Execução SEMPRE recusa, inclusive por postgres/service_role. Não remover o DO.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $gate$ BEGIN
 RAISE EXCEPTION USING ERRCODE='42501',
 MESSAGE='F2B33A_NO_GO_BACKUP_RECEIPT_WRITERS_READERS_JWT_RLS';
END $gate$;
-- A0: exportar preflight READ ONLY, reconciliar manifesto ampliado B3.2 e callers.
-- A1: revisar overload MESMO NOME, sem defaults para partner/version/key;
--     assinatura histórica e ACL atuais permanecem fechadas/inalteradas.
-- B: futura candidata ATÔMICA guard PTC + source em trilha existente protegida
--    + validator ramo cleanup + sync sem adoção por chave + todos writers/revokers.
--    Nenhuma metadata neutra isolada; nenhum PUC endpoint/RLS aberto.
-- C: recorte leitores B2B incluindo overloads, portal, Storage e revogações;
--    sem alterar automaticamente as 29 policies ou ramos internos.
-- D: homologação fiel/JWT/RLS A/B, legado, concorrência e browser com fixtures autorizadas.
-- E: release exige autorização específica; preserva rota TecnicosProdutores.
ROLLBACK;