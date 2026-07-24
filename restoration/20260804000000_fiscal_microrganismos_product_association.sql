-- =====================================================================
-- Fase Fiscal 3.20 — Associação canônica microrganismo → produto
-- Alvo: public.microrganismos
--
-- ARQUIVO CANÔNICO EM restoration/ — NÃO APLICADO.
--   Rota de promoção: mover para supabase/migrations/ via ferramenta
--   canônica de migration, após aprovação explícita.
--   Nome final: 20260804000000_fiscal_microrganismos_product_association.sql
--
-- OBJETIVO
--   Permitir que um microrganismo aponte, quando fizer sentido, para o
--   produto canônico do catálogo (public.produtos). Isso permite a lista
--   unificada em "Perfis Fiscais de Produtos" reutilizar o MESMO
--   product_fiscal_profiles do produto canônico, sem criar perfil
--   fiscal paralelo.
--
-- REGRAS APLICADAS
--   * ADITIVA: apenas ADD COLUMN + FK + índice + partial unique.
--   * NÃO faz backfill. Nenhum UPDATE nesta migration.
--   * NÃO faz DELETE em nenhuma tabela.
--   * NÃO altera policies. As policies existentes (SELECT p/
--     authenticated e ALL p/ administrador|tecnico_agronomo) já cobrem
--     a nova coluna sem ampliação de acesso.
--   * NÃO altera GRANTs; a tabela já é acessível conforme as migrations
--     anteriores.
--   * FK ON DELETE RESTRICT: exclusão de produto canônico é bloqueada
--     enquanto houver microrganismo associado — evita perda silenciosa
--     de vínculo fiscal.
--   * Cardinalidade: partial UNIQUE em product_id WHERE product_id IS
--     NOT NULL. Um mesmo produto canônico não pode ter dois
--     microrganismos apontando para ele. NULL é permitido (produtos
--     sem microrganismo). Se novas evidências de domínio permitirem
--     N:1, uma migration posterior pode remover o UNIQUE — reversível.
--
-- REVERSIBILIDADE
--   DROP INDEX + DROP CONSTRAINT + DROP COLUMN restaura o estado
--   anterior. Nenhum dado é reescrito por esta migration, portanto o
--   rollback preserva as 24 linhas atuais intactas.
-- =====================================================================

BEGIN;

-- 1) Coluna aditiva.
ALTER TABLE public.microrganismos
  ADD COLUMN IF NOT EXISTS product_id uuid NULL;

-- 2) Foreign key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'microrganismos_product_id_fkey'
      AND conrelid = 'public.microrganismos'::regclass
  ) THEN
    ALTER TABLE public.microrganismos
      ADD CONSTRAINT microrganismos_product_id_fkey
      FOREIGN KEY (product_id)
      REFERENCES public.produtos(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;

-- 3) Índice de busca por product_id (join eficiente).
CREATE INDEX IF NOT EXISTS microrganismos_product_id_idx
  ON public.microrganismos (product_id)
  WHERE product_id IS NOT NULL;

-- 4) Unicidade parcial: no máximo um microrganismo por produto canônico.
CREATE UNIQUE INDEX IF NOT EXISTS microrganismos_product_id_unique
  ON public.microrganismos (product_id)
  WHERE product_id IS NOT NULL;

-- 5) Comentário documentando a semântica.
COMMENT ON COLUMN public.microrganismos.product_id IS
  'Associação canônica ao produto no catálogo. Quando preenchido, o '
  'microrganismo reutiliza o product_fiscal_profiles do produto e '
  'aparece na lista unificada de perfis fiscais como uma linha do tipo '
  '"Microrganismo" que aponta para o MESMO perfil. Backfill deve ser '
  'explícito pelo usuário; associação por nome é proibida.';

COMMIT;

-- =====================================================================
-- VERIFICAÇÕES PÓS-APLICAÇÃO (executar manualmente após promover)
-- =====================================================================
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='microrganismos'
--     AND column_name='product_id';
-- -- Esperado: uuid, YES.
--
-- SELECT conname, confdeltype, confupdtype
--   FROM pg_constraint
--   WHERE conname='microrganismos_product_id_fkey';
-- -- Esperado: confdeltype='r' (RESTRICT), confupdtype='c' (CASCADE).
--
-- SELECT indexname FROM pg_indexes
--   WHERE schemaname='public' AND tablename='microrganismos'
--     AND indexname IN ('microrganismos_product_id_idx','microrganismos_product_id_unique');
-- -- Esperado: ambas as linhas presentes.
--
-- SELECT count(*) FROM public.microrganismos WHERE product_id IS NOT NULL;
-- -- Esperado: 0 (sem backfill).
-- =====================================================================
