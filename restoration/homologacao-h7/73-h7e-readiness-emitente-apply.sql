-- FASE H7.1 — Readiness do emitente: correção SOMENTE dos bloqueios derivávEis
-- do cadastro existente. Idempotente, transacional, guard anti-produção.
-- NÃO marca credenciamento, certificado ou validação contábil (ação humana).
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE v_ref text; v_label text; v_prod int;
BEGIN
  SELECT project_ref, environment_label, production_emission_allowed::int
    INTO v_ref, v_label, v_prod
    FROM public.fiscal_environment_marker WHERE id;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' OR v_label <> 'STAGING' OR v_prod <> 0 THEN
    RAISE EXCEPTION 'H7E_ABORT: ambiente nao autorizado (ref=% label=% prod=%)', v_ref, v_label, v_prod;
  END IF;
END $$;

-- 1) Regime de PIS/COFINS derivado do regime tributário já cadastrado.
--    LUCRO_PRESUMIDO => CUMULATIVO; LUCRO_REAL => NAO_CUMULATIVO;
--    SIMPLES_NACIONAL => SIMPLES_NACIONAL. Sem regime cadastrado: permanece nulo.
UPDATE public.company_fiscal_settings
   SET pis_cofins_regime = CASE upper(btrim(tax_regime))
         WHEN 'LUCRO_PRESUMIDO'  THEN 'CUMULATIVO'
         WHEN 'LUCRO_REAL'       THEN 'NAO_CUMULATIVO'
         WHEN 'SIMPLES_NACIONAL' THEN 'SIMPLES_NACIONAL'
       END
 WHERE is_active
   AND pis_cofins_regime IS NULL
   AND upper(btrim(coalesce(tax_regime,''))) IN ('LUCRO_PRESUMIDO','LUCRO_REAL','SIMPLES_NACIONAL');

-- 2) Série de homologação (tpAmb=2). Nunca cria série de produção.
UPDATE public.company_fiscal_settings
   SET nfe_series_number = 1,
       nfe_series = '1'
 WHERE is_active
   AND nfe_series_number IS NULL
   AND coalesce(nfe_environment_code,'2') = '2';

INSERT INTO public.fiscal_document_series (company_id, document_model, series, environment_code, current_number, status, notes)
SELECT c.id, '55', 1, '2', 0, 'ACTIVE', 'H7.1 — serie de homologacao NF-e 55'
  FROM public.company_fiscal_settings c
 WHERE c.is_active
   AND c.nfe_environment_code = '2'
   AND NOT EXISTS (
     SELECT 1 FROM public.fiscal_document_series s
      WHERE s.company_id = c.id AND s.document_model = '55'
        AND s.series = 1 AND s.environment_code = '2');

COMMIT;
