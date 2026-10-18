-- F2-B3.3-B: candidata REVISÁVEL. Recusa sempre (inclusive postgres/service_role). NÃO remover o DO.
-- Subfase mínima proposta B1: SOMENTE receipt privado, sem uso em autorização, sem GRANT a cliente.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $gate$ BEGIN
 RAISE EXCEPTION USING ERRCODE='42501',
 MESSAGE='F2B33B_NO_GO_BACKUP_RESTORE_PREFLIGHT_JWT_RLS';
END $gate$;
-- Preflight obrigatório (fora deste arquivo): vinculos-b2b-f2b33a-preflight-readonly + B3.2;
-- PUC=0, PTC=0, has_function_privilege(authenticated, assign/unassign/get_..._for_assignment)=false.
CREATE TABLE IF NOT EXISTS platform_private.b2b_assignment_receipts(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key uuid NOT NULL UNIQUE,
  payload_md5 text NOT NULL CHECK (length(payload_md5)=32),
  actor_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('grant','revoke','cleanup')),
  context text NOT NULL CHECK (context IN ('commercial_owner','legacy_partner_tenant')),
  result_version integer NOT NULL CHECK (result_version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actor_id<>target_user_id OR action='cleanup')
);
REVOKE ALL ON platform_private.b2b_assignment_receipts FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE platform_private.b2b_assignment_receipts ENABLE ROW LEVEL SECURITY; -- sem policies: fechado
CREATE OR REPLACE FUNCTION platform_private.b2b_assignment_receipts_immutable()
 RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'b2b_receipt_immutable' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION platform_private.b2b_assignment_receipts_immutable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER a00_b2b_receipt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
 ON platform_private.b2b_assignment_receipts FOR EACH STATEMENT
 EXECUTE FUNCTION platform_private.b2b_assignment_receipts_immutable();
-- B2+ (NÃO incluídos): core DEFINER com mandato ator, lock advisory por chave, CAS por versão,
-- abort em PTC direct/unknown, validator com ramo cleanup, sync sem adoção por chave,
-- readers fail-closed coordenados. Assign/unassign permanecem fechados até gate final.
ROLLBACK;
-- Rollback da B1 (antes de qualquer receipt gravado; recusa se count>0):
-- DROP TRIGGER a00_b2b_receipt_immutable ON platform_private.b2b_assignment_receipts;
-- DROP TABLE platform_private.b2b_assignment_receipts RESTRICT;
-- DROP FUNCTION platform_private.b2b_assignment_receipts_immutable() RESTRICT;
