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

-- ---------------------------------------------------------------------
-- CORREÇÃO 2: sincronizar normalized_status a partir de status.
-- Motivo: documentos NF-e criados pelo fluxo F3 nasciam com
-- normalized_status NULL, o que fazia o guard de itens bloquear a
-- montagem do documento ainda em rascunho.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_fiscal_invoice_sync_normalized_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
DECLARE v_norm text;
BEGIN
  v_norm := upper(btrim(coalesce(NEW.status,'')));
  v_norm := CASE v_norm
    WHEN 'PENDING' THEN 'DRAFT'
    WHEN 'RASCUNHO' THEN 'DRAFT'
    WHEN 'EMITIDA' THEN 'AUTHORIZED'
    WHEN 'AUTORIZADA' THEN 'AUTHORIZED'
    WHEN 'CANCELADA' THEN 'CANCELED'
    WHEN 'REJEITADA' THEN 'REJECTED'
    WHEN 'ERRO' THEN 'ERROR'
    ELSE v_norm
  END;
  IF v_norm NOT IN ('LEGACY_RECORDED','DRAFT','VALIDATING','READY','QUEUED','PROCESSING',
                    'AUTHORIZED','REJECTED','ERROR','CANCEL_REQUESTED','CANCELED','SUBSTITUTED') THEN
    v_norm := COALESCE(NEW.normalized_status, 'DRAFT');
  END IF;
  NEW.normalized_status := v_norm;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fiscal_invoice_sync_normalized_status ON public.fiscal_invoices;
CREATE TRIGGER trg_fiscal_invoice_sync_normalized_status
  BEFORE INSERT OR UPDATE OF status ON public.fiscal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_invoice_sync_normalized_status();
