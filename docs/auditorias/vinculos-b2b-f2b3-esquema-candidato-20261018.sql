-- F2-B3: PROPOSTA REVISÁVEL. NÃO INSTALAR. Destino futuro sujeito a autorização:
-- swzpzcwiasxmjutrmvkm; nunca usar o binding de homolog implicitamente.
-- Recomendação: PUC canônica; PTC somente compatibilidade transitória com origem explícita.
-- Não altera policies, ACL, funções, triggers existentes ou dados. Não fecha revogação.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $gate$
BEGIN
  RAISE EXCEPTION 'F2B3_NO_GO_ACTOR_READERS_AND_CUTOVER_UNPROVEN' USING ERRCODE='42501';
END $gate$;

-- BEGIN LOCAL SCHEMA
-- Recorte para revisão/sintaxe em PostgreSQL descartável; NÃO remover gate hospedado.
DO $preflight$
BEGIN
  IF to_regclass('public.partner_user_clients') IS NULL
     OR to_regclass('public.partner_technician_clients') IS NULL THEN
    RAISE EXCEPTION 'F2B3_MISSING_TABLE';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='partner_technician_clients'
    AND column_name IN ('grant_origin','source_puc_id')) THEN
    RAISE EXCEPTION 'F2B3_SCHEMA_ALREADY_PRESENT_OR_DRIFT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.partner_user_clients'::regclass
    AND conname='partner_user_clients_unique'
    AND pg_get_constraintdef(oid)='UNIQUE (partner_id, user_id, cliente_id)')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.partner_technician_clients'::regclass
    AND conname='partner_technician_clients_unique'
    AND pg_get_constraintdef(oid)='UNIQUE (partner_id, technician_user_id, cliente_id)') THEN
    RAISE EXCEPTION 'F2B3_KEY_DRIFT';
  END IF;
END $preflight$;

-- Identidade composta impede referência PTC→PUC de outro parceiro/alvo/cliente.
-- Redundância deliberada com PK(id) para suportar FK composta, não outro modelo de grant.
ALTER TABLE public.partner_user_clients
  ADD CONSTRAINT f2b3_puc_source_identity_unique UNIQUE (id,partner_id,user_id,cliente_id);
ALTER TABLE public.partner_technician_clients
  ADD COLUMN grant_origin text NULL,
  ADD COLUMN source_puc_id uuid NULL;
ALTER TABLE public.partner_technician_clients
  ADD CONSTRAINT f2b3_ptc_origin_coherence CHECK (
    (grant_origin IS NULL AND source_puc_id IS NULL)
    OR (grant_origin IS NOT NULL AND grant_origin='direct' AND source_puc_id IS NULL)
    OR (grant_origin IS NOT NULL AND grant_origin='puc' AND source_puc_id IS NOT NULL)
  ),
  ADD CONSTRAINT f2b3_ptc_source_identity_fk
    FOREIGN KEY (source_puc_id,partner_id,technician_user_id,cliente_id)
    REFERENCES public.partner_user_clients(id,partner_id,user_id,cliente_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE INDEX f2b3_ptc_source_puc_idx ON public.partner_technician_clients(source_puc_id)
  WHERE source_puc_id IS NOT NULL;
COMMENT ON COLUMN public.partner_technician_clients.grant_origin IS
  'Transition metadata only: NULL unknown legacy; direct reviewed independent grant; puc verified projection. Never infer authorization from this field alone.';
COMMENT ON COLUMN public.partner_technician_clients.source_puc_id IS
  'Verified PUC source with identical partner/user/client. Restrict physical deletion; use audited deactivation. No implicit backfill.';
-- END LOCAL SCHEMA

-- Gate futuro adicional: inventário/ACL/policy/body digests e locks das duas tabelas
-- precisam corresponder ao baseline revisado. Este arquivo bloqueado NÃO é release.
-- CHECK estático de coerência, sem now(); não existe validação temporal por CHECK.
-- Nenhuma classificação/backfill automático, nenhuma abertura de PUC/PTC.
COMMIT;