-- Nenhuma implantação realizada: nenhum rollback de banco é necessário neste turno.
-- NÃO reinstalar sync vulnerável após consumo de source autoritativa.
BEGIN;
DO $gate$ BEGIN
 RAISE EXCEPTION USING ERRCODE='42501',
 MESSAGE='F2B33A_ROLLBACK_NO_GO_MANIFEST_CONSUMPTION_RECOVERY';
END $gate$;
-- Antes de consumo: somente inversa EXATA aprovada, bodies/ACL/rowshape/dependências
-- e ausência de receipts/projeções/eventos comprovados; nunca DROP CASCADE.
-- Após consumo: fechar futuros writers via mecanismo revisado, preservar direct grants,
-- receipts, auditoria e snapshots; forward-fix/compensação, não DROP origem/histórico.
-- Restore integral exige ensaio e reconciliação das gravações posteriores ao backup.
ROLLBACK;