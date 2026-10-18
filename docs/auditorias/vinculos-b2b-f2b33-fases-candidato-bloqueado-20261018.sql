-- B3.3 DESIGN SOMENTE. NÃO INSTALAR. Não implementa RPC, guard ou receipt.
-- Não é migration deployável. Arquivo fora de supabase/migrations.
-- Sem placeholders executáveis de autenticação e sem mocks para contornar guards.
BEGIN;
DO $blocked$
BEGIN
 RAISE EXCEPTION 'F2B33_NO_GO_BACKUP_ACTOR_SOURCE_RECEIPT_CONCURRENCY_RLS'
 USING ERRCODE='42501';
END $blocked$;
-- A: aprovar contexto ator, CAS/idempotência, receipt protegido e ordem global de locks.
-- B: futura candidata coordenada source/guard PTC/sync/validator sem abrir PUC/RPC.
-- C: futura candidata readers/revogações, incluindo legado/Storage, sem ampliar ACL.
-- D: homologação real A/B e cutover somente com autorização explícita posterior.
-- Bodies/DDL somente serão preenchidos após gates; não remover o DO para "testar".
ROLLBACK;