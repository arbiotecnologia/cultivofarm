-- Migration 20261014215550 APLICADA: rollback preservado, NÃO executar sem autorização específica e export prévio.
-- ROLLBACK do candidato proposed-platform-global-product-family.sql (somente se aplicado).
-- Remove funções/policy/trigger/colunas novas. ATENÇÃO: descartar as colunas apaga as
-- classificações feitas pela UI; exportar antes (SELECT id, familia_catalogo, classe_catalogo
-- FROM public.produtos WHERE familia_catalogo IS NOT NULL) e anexar à evidência.
-- Linhas set_global_product_family do ledger são preservadas (histórico imutável); por isso o
-- CHECK do ledger MANTÉM o valor 'set_global_product_family'.
BEGIN;
DROP FUNCTION IF EXISTS public.platform_set_global_product_family(uuid,timestamptz,text,text,text,uuid);
DROP FUNCTION IF EXISTS public.platform_read_global_product_catalog_by_family(text,text,text,integer,integer);
DROP FUNCTION IF EXISTS platform_private.set_global_product_family_core(uuid,timestamptz,text,text,text,uuid);
DROP FUNCTION IF EXISTS platform_private.read_global_product_catalog_by_family_core(text,text,text,integer,integer);
DROP POLICY IF EXISTS catalog_family_audit_active_read ON public.catalog_platform_admin_audit;
-- Trigger de imutabilidade permanece enquanto existirem linhas do ledger desta operação.
DROP INDEX IF EXISTS public.produtos_familia_catalogo_idx;
ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_classe_catalogo_coerente_check;
ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_familia_catalogo_check;
ALTER TABLE public.produtos DROP COLUMN IF EXISTS classe_catalogo;
ALTER TABLE public.produtos DROP COLUMN IF EXISTS familia_catalogo;
DO $$ BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos') <> 19 THEN
    RAISE EXCEPTION 'family_rollback_column_count_mismatch'; END IF;
END $$;
COMMIT;
