-- =====================================================================
-- ROLLBACK — Classe D microrganismos (20260804000000 + 20260805000000)
-- Staging ikaauvsflpmamgxmkhoq SOMENTE. Produção proibida.
-- NÃO EXECUTAR se os testes T1–T13 estiverem PASS.
--
-- Após este script, reverter o ledger pelo mecanismo oficial:
--   supabase migration repair --status reverted 20260805000000 20260804000000 --db-url "$STAGING_DSN"
-- =====================================================================

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: ambiente nao autorizado (%)', coalesce(v_ref,'<null>');
  END IF;
END $guard$;

BEGIN;

-- 1) RPC comercial.
DROP FUNCTION IF EXISTS public.rpc_associate_microorganism_fiscal_product(uuid, uuid);

-- 2) Índice.
DROP INDEX IF EXISTS public.microrganismos_product_id_idx;

-- 3) FK + coluna — SOMENTE se a coluna estiver integralmente vazia.
DO $drop$
DECLARE v_used bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='microrganismos' AND column_name='product_id'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.microrganismos WHERE product_id IS NOT NULL' INTO v_used;
    IF v_used > 0 THEN
      RAISE EXCEPTION 'ROLLBACK_ABORT: % vinculo(s) comercial(is) existentes; drop da coluna negado', v_used;
    END IF;
    ALTER TABLE public.microrganismos DROP CONSTRAINT IF EXISTS microrganismos_product_id_fkey;
    ALTER TABLE public.microrganismos DROP COLUMN product_id;
  END IF;
END $drop$;

COMMIT;

DO $$ BEGIN RAISE NOTICE 'ROLLBACK_CLASSE_D_OK'; END $$;
