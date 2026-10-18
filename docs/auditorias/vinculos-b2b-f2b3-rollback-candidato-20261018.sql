-- NÃO EXECUTAR. Rollback de METADADOS antes do cutover, não de grants/acessos.
-- Somente após auditor externo comprovar destino, baseline e ausência de consumidores novos.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $gate$ BEGIN
  RAISE EXCEPTION 'F2B3_ROLLBACK_REQUIRES_INDEPENDENT_REVIEW' USING ERRCODE='42501';
END $gate$;
-- BEGIN LOCAL ROLLBACK
DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM public.partner_technician_clients
    WHERE grant_origin IS NOT NULL OR source_puc_id IS NOT NULL) THEN
    RAISE EXCEPTION 'F2B3_ROLLBACK_WOULD_LOSE_PROVENANCE';
  END IF;
END $check$;
ALTER TABLE public.partner_technician_clients DROP CONSTRAINT f2b3_ptc_source_identity_fk;
ALTER TABLE public.partner_technician_clients DROP CONSTRAINT f2b3_ptc_origin_coherence;
DROP INDEX public.f2b3_ptc_source_puc_idx;
ALTER TABLE public.partner_technician_clients DROP COLUMN source_puc_id, DROP COLUMN grant_origin;
ALTER TABLE public.partner_user_clients DROP CONSTRAINT f2b3_puc_source_identity_unique;
-- END LOCAL ROLLBACK
-- Sem CASCADE. Dependência não inventariada provoca falha e rollback da transação.
-- Com metadados preenchidos: export protegido, retenção da origem, compensação auditada;
-- não apagar origem para forçar este rollback nem restaurar autorização vulnerável.
COMMIT;