-- FASE H7.3 / H7.9 — Rollback do guard de status da matriz fiscal (H7-101/H7-102).
-- Restaura o trigger anterior (sem máquina de estados) e os grants originais.
-- Uso exclusivo em STAGING e apenas se o guard precisar ser revertido.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION public.tg_fiscal_tax_rule_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('PUBLISHED','SUPERSEDED') THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_IMMUTABLE: versao publicada nao pode ser excluida (rule_key=% v=%)', OLD.rule_key, OLD.version;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'PUBLISHED' THEN
    IF NEW.status = 'DRAFT' THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_IMMUTABLE: versao publicada nao retorna a DRAFT (rule_key=% v=%)', OLD.rule_key, OLD.version;
    END IF;
    IF (OLD.tax_kind, OLD.calc_mode, OLD.crt, OLD.origin_uf, OLD.destination_uf, OLD.ncm_prefix,
        OLD.product_category, OLD.final_consumer, OLD.taxpayer_indicator, OLD.cst, OLD.csosn,
        OLD.rate, OLD.base_reduction_pct, OLD.deferral_pct, OLD.mva_pct, OLD.fcp_rate,
        OLD.difal_dest_share_pct, OLD.legal_basis, OLD.source_id, OLD.valid_from, OLD.valid_until, OLD.version)
       IS DISTINCT FROM
       (NEW.tax_kind, NEW.calc_mode, NEW.crt, NEW.origin_uf, NEW.destination_uf, NEW.ncm_prefix,
        NEW.product_category, NEW.final_consumer, NEW.taxpayer_indicator, NEW.cst, NEW.csosn,
        NEW.rate, NEW.base_reduction_pct, NEW.deferral_pct, NEW.mva_pct, NEW.fcp_rate,
        NEW.difal_dest_share_pct, NEW.legal_basis, NEW.source_id, NEW.valid_from, NEW.valid_until, NEW.version) THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_IMMUTABLE: conteudo de versao publicada e imutavel; crie nova versao (rule_key=% v=%)', OLD.rule_key, OLD.version;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_tax_rules TO authenticated;

COMMIT;
