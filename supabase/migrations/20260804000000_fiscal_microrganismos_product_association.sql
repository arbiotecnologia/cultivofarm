-- =====================================================================
-- Fase Fiscal 3.20 — Associação canônica microrganismo → produto
-- Alvo: public.microrganismos
--
-- LOCAL CANÔNICO: supabase/migrations/ é a única fonte SQL executável
--   do projeto. Não há cópia executável em restoration/.
--
-- OBJETIVO
--   Permitir que um microrganismo aponte, quando fizer sentido, para o
--   produto canônico do catálogo (public.produtos). Isso permite a lista
--   unificada em "Perfis Fiscais de Produtos" reutilizar o MESMO
--   product_fiscal_profiles do produto canônico, sem criar perfil
--   fiscal paralelo.
--
-- REGRAS APLICADAS
--   * ADITIVA: apenas ADD COLUMN + FK + índice não único.
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
--
-- CARDINALIDADE
--   Cada microrganismo tem zero ou um product_id. Vários microrganismos
--   PODEM apontar para o mesmo produto canônico. Não há evidência de
--   domínio que justifique restrição 1:1; nenhum UNIQUE é criado por
--   esta migration.
--
-- REVERSIBILIDADE
--   DROP INDEX + DROP CONSTRAINT + DROP COLUMN restaura o estado
--   anterior. Nenhum dado é reescrito por esta migration, portanto o
--   rollback preserva as linhas atuais intactas.
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

-- 3) Índice de busca por product_id (join eficiente). NÃO único.
CREATE INDEX IF NOT EXISTS microrganismos_product_id_idx
  ON public.microrganismos (product_id)
  WHERE product_id IS NOT NULL;

-- 4) Comentário documentando a semântica.
COMMENT ON COLUMN public.microrganismos.product_id IS
  'Associação canônica ao produto no catálogo. Quando preenchido, o '
  'microrganismo reutiliza o product_fiscal_profiles do produto e '
  'aparece na lista unificada de perfis fiscais como uma linha do tipo '
  '"Microrganismo" que aponta para o MESMO perfil. Backfill deve ser '
  'explícito pelo usuário; associação por nome é proibida. '
  'Cardinalidade N:1 permitida — vários microrganismos podem apontar '
  'para o mesmo produto.';

COMMIT;
