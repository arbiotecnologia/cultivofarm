-- H7.3/H7.9 — Guard de status da matriz fiscal (achados H7-101 e H7-102).
-- Migration canonica incremental. Guard duro de staging embutido.
--
-- H7-101 (P1): uma regra SUPERSEDED podia voltar a PUBLISHED por UPDATE direto,
--   contornando `rpc_fiscal_tax_rule_publish` (segregação de funções, fonte
--   oficial e base legal). Também podia ter conteúdo alterado após arquivamento.
-- H7-102 (P2): `authenticated` mantinha DELETE/TRUNCATE em `fiscal_tax_rules`
--   (bloqueados só por ausência de policy). Menor privilégio explícito.
--
-- Somente STAGING. Idempotente. Não altera dados fiscais existentes.

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public.fiscal_environment_marker LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'H7H ABORT: ambiente nao autorizado (ref=%)', coalesce(v_ref, '<null>');
  END IF;
END
$guard$;

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

  -- H7-101: máquina de estados fechada. Nenhum caminho reabilita histórico.
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
         (OLD.status = 'DRAFT'     AND NEW.status IN ('PUBLISHED'))
      OR (OLD.status = 'PUBLISHED' AND NEW.status = 'SUPERSEDED')
    ) THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_STATUS_TRANSITION_FORBIDDEN: % -> % nao permitido (rule_key=% v=%)',
        OLD.status, NEW.status, OLD.rule_key, OLD.version
        USING HINT = 'Regra arquivada nunca volta a vigorar. Crie nova versao DRAFT e publique via rpc_fiscal_tax_rule_publish.';
    END IF;
    -- Publicação só pelo fluxo canônico (fonte oficial + SoD + aprovador).
    IF NEW.status = 'PUBLISHED' AND (NEW.published_by IS NULL OR NEW.published_at IS NULL) THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_PUBLISH_CHANNEL: publicacao exige rpc_fiscal_tax_rule_publish (autoria/aprovacao obrigatorias).';
    END IF;
  END IF;

  -- H7-101: conteúdo de versão publicada OU arquivada é imutável.
  IF OLD.status IN ('PUBLISHED','SUPERSEDED') THEN
    IF OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT' THEN
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
      RAISE EXCEPTION 'FISCAL_TAX_RULE_IMMUTABLE: conteudo de versao % e imutavel; crie nova versao (rule_key=% v=%)',
        OLD.status, OLD.rule_key, OLD.version;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

-- H7-102 — menor privilégio explícito (RLS continua sendo a autorização).
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fiscal_tax_rules FROM authenticated;
REVOKE ALL ON public.fiscal_tax_rules FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.fiscal_tax_rules TO authenticated;
GRANT ALL ON public.fiscal_tax_rules TO service_role;

