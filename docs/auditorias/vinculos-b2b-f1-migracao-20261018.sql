-- ============================================================================
-- FASE F1 — FUNDAÇÃO ADITIVA DE partner_users (REVISÁVEL — NÃO APLICADA)
-- Ref canônico: swzpzcwiasxmjutrmvkm (PRODUÇÃO) — NÃO EXECUTAR sem aprovação.
-- Homolog: vrlcdwmlytukrjezrrnf (NÃO espelha schema/dados de produção;
-- paridade NÃO atestada — 279 vs 286 tabelas, 0 vínculos vs 2).
--
-- Escopo F1 (somente aditivo e reversível):
--   * Novas colunas em public.partner_users: valid_from, revoked_at,
--     revoked_by, revoke_reason, tenant_id (NULLABLE nesta fase), version.
--   * Trigger BEFORE INSERT/UPDATE que DERIVA tenant_id do parceiro e
--     rejeita qualquer valor divergente (tenant nunca vem do cliente).
--   * Checks de coerência temporal e de revogação.
--   * Backfill validado de tenant_id (linha a linha; divergência = abort).
--
-- Fora de escopo F1 (fases posteriores, NÃO incluído aqui):
--   * Remover UNIQUE(user_id) — portão unidirecional da fase Cutover.
--   * Unicidade parcial de vínculo ativo, helpers fail-closed, migração
--     das 29 policies, RPCs de revogação/criação, seletor de parceiro na UI.
--   * Tabela de histórico append-only: ADIADA para a fase Guards — criar
--     tabela sem consumidor e sem política fechada validada seria risco sem
--     benefício; revogação ainda não existe como operação nesta fase.
--
-- Pré-condições VERIFICADAS em produção (2026-10-18, read-only):
--   * partner_users: id, partner_id, user_id, created_at, papel; 2 vínculos,
--     2 usuários distintos, 0 excedentes por usuário.
--   * partner_accounts.commercial_owner_organization_id é NULLABLE e
--     1 dos 2 vínculos aponta para parceiro SEM tenant → tenant_id NÃO pode
--     ser NOT NULL nesta fase (backfill obrigatório falharia). Registrado
--     como PENDÊNCIA P1: regularizar o parceiro sem tenant antes do Cutover.
--   * Triggers existentes (cf_user_guards_v1.acquire_gate BEFORE STATEMENT,
--     block_truncate, touch_related_profiles AFTER ROW) não referenciam
--     colunas de partner_users → compatíveis com colunas aditivas.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Colunas aditivas (todas com default ou NULLABLE → sem reescrita pesada)
-- ----------------------------------------------------------------------------
ALTER TABLE public.partner_users
  ADD COLUMN IF NOT EXISTS valid_from    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS revoked_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS revoked_by    uuid        NULL,
  ADD COLUMN IF NOT EXISTS revoke_reason text        NULL,
  ADD COLUMN IF NOT EXISTS tenant_id     uuid        NULL,
  ADD COLUMN IF NOT EXISTS version       integer     NOT NULL DEFAULT 1;

-- revoked_by referencia o autor da revogação (auth.users); sem FK rígida para
-- não acoplar a auth.users nesta fase — validação fica na RPC da fase Guards.

-- ----------------------------------------------------------------------------
-- 2. Checks de coerência (imutáveis → CHECK é seguro; sem now() em CHECK)
-- ----------------------------------------------------------------------------
ALTER TABLE public.partner_users
  ADD CONSTRAINT partner_users_revocation_coherence_chk
    CHECK (
      (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
      OR
      (revoked_at IS NOT NULL AND revoked_by IS NOT NULL
       AND revoke_reason IS NOT NULL AND btrim(revoke_reason) <> '')
    ),
  ADD CONSTRAINT partner_users_validity_window_chk
    CHECK (revoked_at IS NULL OR revoked_at >= valid_from),
  ADD CONSTRAINT partner_users_version_positive_chk
    CHECK (version >= 1);

-- ----------------------------------------------------------------------------
-- 3. Derivação de tenant_id no servidor (trigger BEFORE INSERT/UPDATE)
--    - tenant_id = partner_accounts.commercial_owner_organization_id
--    - valor informado divergente do parceiro → rejeita (fail-closed)
--    - parceiro sem tenant → tenant_id fica NULL (aceito nesta fase; ver
--      PENDÊNCIA P1 no cabeçalho)
--    - parceiro inexistente → rejeita (além da FK, mensagem explícita)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_users_derive_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT pa.commercial_owner_organization_id
    INTO v_tenant
    FROM public.partner_accounts pa
   WHERE pa.id = NEW.partner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'partner_users_partner_not_found' USING ERRCODE = '23503';
  END IF;

  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'partner_users_tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  NEW.tenant_id := v_tenant;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.partner_users_derive_tenant() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER a10_partner_users_derive_tenant
  BEFORE INSERT OR UPDATE ON public.partner_users
  FOR EACH ROW EXECUTE FUNCTION public.partner_users_derive_tenant();

-- ----------------------------------------------------------------------------
-- 4. Versionamento otimista: incrementa version em qualquer UPDATE de linha
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_users_bump_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.partner_users_bump_version() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER a20_partner_users_bump_version
  BEFORE UPDATE ON public.partner_users
  FOR EACH ROW EXECUTE FUNCTION public.partner_users_bump_version();

-- ----------------------------------------------------------------------------
-- 5. Backfill validado de tenant_id (linha a linha; qualquer divergência
--    entre valor preenchido e tenant do parceiro aborta a migration)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_divergentes integer;
  v_preenchidos integer;
BEGIN
  UPDATE public.partner_users pu
     SET tenant_id = pa.commercial_owner_organization_id
    FROM public.partner_accounts pa
   WHERE pa.id = pu.partner_id
     AND pu.tenant_id IS NULL
     AND pa.commercial_owner_organization_id IS NOT NULL;

  GET DIAGNOSTICS v_preenchidos = ROW_COUNT;

  SELECT count(*) INTO v_divergentes
    FROM public.partner_users pu
    JOIN public.partner_accounts pa ON pa.id = pu.partner_id
   WHERE pu.tenant_id IS DISTINCT FROM pa.commercial_owner_organization_id;

  IF v_divergentes > 0 THEN
    RAISE EXCEPTION 'partner_users_backfill_divergent:%', v_divergentes
      USING ERRCODE = 'PT500';
  END IF;

  RAISE NOTICE 'partner_users backfill tenant_id: % linhas preenchidas, 0 divergências', v_preenchidos;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Índice de apoio às consultas por tenant (leituras administrativas e
--    futuras policies por par/tenant) — aditivo, CONCURRENTLY não permitido
--    dentro de transação; tabela tem 2 linhas, lock é desprezível.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_partner_users_tenant_id
  ON public.partner_users (tenant_id);

CREATE INDEX IF NOT EXISTS idx_partner_users_active
  ON public.partner_users (user_id, partner_id)
  WHERE revoked_at IS NULL;

COMMIT;

-- ============================================================================
-- ROLLBACK F1 (reversível — seguro porque NADA foi removido nesta fase;
-- UNIQUE(user_id), helpers e policies atuais permanecem intactos):
--
--   BEGIN;
--   DROP TRIGGER IF EXISTS a20_partner_users_bump_version ON public.partner_users;
--   DROP TRIGGER IF EXISTS a10_partner_users_derive_tenant ON public.partner_users;
--   DROP FUNCTION IF EXISTS public.partner_users_bump_version();
--   DROP FUNCTION IF EXISTS public.partner_users_derive_tenant();
--   DROP INDEX IF EXISTS public.idx_partner_users_active;
--   DROP INDEX IF EXISTS public.idx_partner_users_tenant_id;
--   ALTER TABLE public.partner_users
--     DROP CONSTRAINT IF EXISTS partner_users_version_positive_chk,
--     DROP CONSTRAINT IF EXISTS partner_users_validity_window_chk,
--     DROP CONSTRAINT IF EXISTS partner_users_revocation_coherence_chk,
--     DROP COLUMN IF EXISTS version,
--     DROP COLUMN IF EXISTS tenant_id,
--     DROP COLUMN IF EXISTS revoke_reason,
--     DROP COLUMN IF EXISTS revoked_by,
--     DROP COLUMN IF EXISTS revoked_at,
--     DROP COLUMN IF EXISTS valid_from;
--   COMMIT;
--
-- Dados pré-F1 preservados: rollback apenas remove estruturas novas.
-- ============================================================================
