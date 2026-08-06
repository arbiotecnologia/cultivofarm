-- =====================================================================
-- FASE F3.1-R2 — GATE DE AMBIENTE FAIL-CLOSED E SUPERFICIE MINIMA
-- STAGING ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk PROIBIDA.
-- Migration INCREMENTAL: 20260818000000 / 20260819000000 / 20260820000000
-- ja estao aplicadas no ledger remoto e NAO sao editadas.
--
-- Achados corrigidos (auditoria do commit 2ebf666b):
--   A1) fn_fiscal_assert_environment_homologation nao era fail-closed:
--       sem emitente ativo, env ficava NULL e a funcao retornava sem erro.
--   A2) o helper interno tinha EXECUTE para authenticated, ampliando a
--       superficie sem necessidade (as RPCs sao SECURITY DEFINER e o
--       chamam com os privilegios do owner).
--   A3) funcoes de trigger fiscais ainda tinham EXECUTE para PUBLIC/anon.
--
-- Nao altera dados operacionais, reservas, snapshots nem historicos.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_fiscal_assert_environment_homologation()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_count integer;
  v_env   text;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.company_fiscal_settings cfs
   WHERE cfs.is_active;

  -- (a) fail-closed: ausencia de emitente ativo NAO libera nada.
  IF v_count = 0 THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: nenhum emitente fiscal ativo configurado; operacao bloqueada.';
  END IF;

  -- (a) fail-closed: multiplicidade torna o ambiente indeterminado.
  IF v_count > 1 THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_AMBIGUOUS: % emitentes fiscais ativos; ambiente indeterminado, operacao bloqueada.', v_count;
  END IF;

  SELECT cfs.nfe_environment_code INTO v_env
    FROM public.company_fiscal_settings cfs
   WHERE cfs.is_active
   LIMIT 1;

  -- (b) tpAmb ausente ou fora do dominio SEFAZ {1,2}.
  IF v_env IS NULL OR btrim(v_env) NOT IN ('1', '2') THEN
    RAISE EXCEPTION 'FISCAL_ENVIRONMENT_INVALID: tpAmb do emitente ativo ausente ou invalido; operacao bloqueada.';
  END IF;

  -- (c) producao permanece bloqueada nesta fase.
  IF btrim(v_env) = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao (tpAmb=1) bloqueado na fase F3; teto READY_HOMOLOGATION.';
  END IF;

  -- (d) somente tpAmb=2 (homologacao) segue adiante.
  RETURN;
END;
$fn$;

COMMENT ON FUNCTION public.fn_fiscal_assert_environment_homologation() IS
  'F3.1-R2: gate de ambiente fail-closed (sem emitente / multiplos emitentes / tpAmb invalido / tpAmb=1 bloqueiam). Helper interno: sem EXECUTE para PUBLIC, anon ou authenticated.';

-- (e) superficie minima: apenas o owner (usado pelas RPCs SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.fn_fiscal_assert_environment_homologation()
  FROM PUBLIC, anon, authenticated, service_role;

-- A3) funcoes de trigger nao devem ser executaveis por PUBLIC/anon.
DO $acl$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_type t ON t.oid = p.prorettype
     WHERE n.nspname = 'public'
       AND t.typname = 'trigger'
       AND p.proname LIKE 'tg_fiscal%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END
$acl$;
