-- =====================================================================
-- FASE F3 — CORREÇÃO 1: unicidade de política de operação por destino
-- Staging ikaauvsflpmamgxmkhoq. Produção NÃO acessada.
-- Motivo: o índice legado fop_active_uq ignorava origin_uf/destination_uf,
-- impedindo políticas concorrentes GO->GO (5101) e GO->SP (6101) com a
-- mesma vigência — requisito de resolução de CFOP por destino da Fase F3.
-- =====================================================================

DROP INDEX IF EXISTS public.fop_active_uq;

CREATE UNIQUE INDEX IF NOT EXISTS fop_active_uq
  ON public.fiscal_operation_policies (
    sales_channel,
    operation_type,
    COALESCE(uf, '*'),
    COALESCE(origin_uf, '*'),
    COALESCE(destination_uf, '*'),
    COALESCE(document_model, '*'),
    COALESCE(taxpayer_indicator, '*'),
    COALESCE(final_consumer, false),
    valid_from
  )
  WHERE active;

COMMENT ON INDEX public.fop_active_uq IS
  'F3: unicidade de politica ativa considerando origem, destino, modelo e perfil do destinatario.';
