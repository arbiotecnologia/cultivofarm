-- =====================================================================
-- H7n-PROD — ONDA A1 — security_invoker nas views existentes em produção
-- version: 20261103000000
-- Alvo EXCLUSIVO: produção navfzbwgwzruipouyfnk
--
-- ESCOPO (recorte comprovado do pacote H7n de staging):
--   - ALTER VIEW public.vw_os_integridade_esteira SET (security_invoker=true)
--   - reafirmação idempotente em public.vw_esteira_laboratorio
--   - reafirmação idempotente em public.vw_fluxo_visita_tecnica
--
-- FORA DE ESCOPO, deliberadamente:
--   - schema private / funções private.h7n_* (dependências não comprovadas)
--   - views de catálogo e fn_catalogo_preco_canonico (ausentes em produção)
--   - revokes de trigger/helper e guardas de RPC (sem censo de existência)
--   - ALTER search_path dos 4 helpers da P2 (funções ausentes)
--
-- NÃO redefine view alguma. NÃO concede nem revoga privilégio algum.
-- Fail-closed por alvo. Idempotente. Transacional.
-- Rollback: rollback-sql/20261103000000_h7nprod_a1_rollback.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. GUARDA DE ALVO (fail-closed)
--    O runner deve ter executado antes:
--      SET promocao.target_ref = 'navfzbwgwzruipouyfnk';
-- ---------------------------------------------------------------------
DO $guard$
DECLARE
  v_ref text := current_setting('promocao.target_ref', true);
BEGIN
  IF v_ref IS NULL OR v_ref = '' THEN
    RAISE EXCEPTION 'ENV_ABORT: promocao.target_ref ausente — execução recusada';
  END IF;
  IF v_ref = 'yzszlzjpovmcteuxjznj' THEN
    RAISE EXCEPTION 'ENV_ABORT: sandbox detectado — execução proibida';
  END IF;
  IF v_ref IS DISTINCT FROM 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ENV_ABORT: alvo % nao autorizado para a onda A1', v_ref;
  END IF;
  IF current_database() IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'ENV_ABORT: banco % inesperado', current_database();
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------
-- 2. PRECHECK DE EXISTÊNCIA — as 3 views devem existir e ser views
-- ---------------------------------------------------------------------
DO $pre$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(t.nome, ', ')
    INTO v_missing
  FROM (VALUES
    ('public.vw_os_integridade_esteira'),
    ('public.vw_esteira_laboratorio'),
    ('public.vw_fluxo_visita_tecnica')
  ) AS t(nome)
  WHERE to_regclass(t.nome) IS NULL
     OR (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass(t.nome)) <> 'v';

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK_ABORT: alvo ausente ou nao e view: %', v_missing;
  END IF;
END
$pre$;

-- ---------------------------------------------------------------------
-- 3. BASELINE DE ACL — capturada antes, comparada depois
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _h7nprod_a1_acl_before ON COMMIT DROP AS
SELECT c.oid, c.relname, c.relacl::text AS acl, c.reloptions::text AS opts
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('vw_os_integridade_esteira',
                    'vw_esteira_laboratorio',
                    'vw_fluxo_visita_tecnica');

-- ---------------------------------------------------------------------
-- 4. APLICAÇÃO
-- ---------------------------------------------------------------------
ALTER VIEW public.vw_os_integridade_esteira SET (security_invoker = true);
ALTER VIEW public.vw_esteira_laboratorio    SET (security_invoker = true);
ALTER VIEW public.vw_fluxo_visita_tecnica   SET (security_invoker = true);

-- ---------------------------------------------------------------------
-- 5. PÓS-CHECK EM TRANSAÇÃO — 3/3 com security_invoker e ACL intacta
-- ---------------------------------------------------------------------
DO $post$
DECLARE
  v_ok int;
  v_acl_drift text;
BEGIN
  SELECT count(*) INTO v_ok
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('vw_os_integridade_esteira',
                      'vw_esteira_laboratorio',
                      'vw_fluxo_visita_tecnica')
    AND c.reloptions @> ARRAY['security_invoker=true'];

  IF v_ok <> 3 THEN
    RAISE EXCEPTION 'POSTCHECK_ABORT: apenas %/3 views com security_invoker=true', v_ok;
  END IF;

  SELECT string_agg(b.relname, ', ')
    INTO v_acl_drift
  FROM _h7nprod_a1_acl_before b
  JOIN pg_class c ON c.oid = b.oid
  WHERE c.relacl::text IS DISTINCT FROM b.acl;

  IF v_acl_drift IS NOT NULL THEN
    RAISE EXCEPTION 'POSTCHECK_ABORT: ACL alterada em %', v_acl_drift;
  END IF;
END
$post$;

COMMIT;

-- ---------------------------------------------------------------------
-- 6. LEDGER
--    Esta migration NAO se marca como aplicada. Após o COMMIT e a
--    reexecução dos pós-checks externos (checks/02-postchecks.sql), o
--    runner registra a version 20261103000000 e insere a linha em
--    public.promocao_execucao_registro com o SHA-256 externo deste
--    arquivo, conforme o manifesto.
-- ---------------------------------------------------------------------
