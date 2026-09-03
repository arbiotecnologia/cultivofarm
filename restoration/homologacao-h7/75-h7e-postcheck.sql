-- Postcheck H7.1 — readiness do emitente após correções derivadas do cadastro.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE v_ok int := 0; v_fail int := 0; r record; v_blocks text;
BEGIN
  SELECT * INTO r FROM public.company_fiscal_settings WHERE is_active LIMIT 1;

  IF r.pis_cofins_regime IS NOT NULL THEN v_ok := v_ok+1; RAISE NOTICE 'H7E-1 PASS regime PIS/COFINS definido';
  ELSE v_fail := v_fail+1; RAISE WARNING 'H7E-1 FAIL regime PIS/COFINS ausente'; END IF;

  IF r.nfe_series_number = 1 AND r.nfe_environment_code = '2' THEN v_ok := v_ok+1; RAISE NOTICE 'H7E-2 PASS serie HML definida';
  ELSE v_fail := v_fail+1; RAISE WARNING 'H7E-2 FAIL serie/ambiente invalidos'; END IF;

  IF EXISTS (SELECT 1 FROM public.fiscal_document_series
              WHERE company_id=r.id AND document_model='55' AND series=1 AND environment_code='2') THEN
    v_ok := v_ok+1; RAISE NOTICE 'H7E-3 PASS serie registrada no mecanismo canonico';
  ELSE v_fail := v_fail+1; RAISE WARNING 'H7E-3 FAIL serie ausente em fiscal_document_series'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fiscal_document_series WHERE environment_code='1') THEN
    v_ok := v_ok+1; RAISE NOTICE 'H7E-4 PASS nenhuma serie de producao criada';
  ELSE v_fail := v_fail+1; RAISE WARNING 'H7E-4 FAIL serie de producao presente'; END IF;

  -- Bloqueios de ação humana devem PERMANECER.
  SELECT string_agg(e->>'code', ',') INTO v_blocks
    FROM public.company_fiscal_settings c,
         jsonb_array_elements(c.nfe_readiness_pendencies) e
   WHERE c.is_active AND e->>'severity' = 'BLOCK';

  IF coalesce(v_blocks,'') NOT LIKE '%PIS_COFINS%' AND coalesce(v_blocks,'') NOT LIKE '%SERIES_MISSING%' THEN
    v_ok := v_ok+1; RAISE NOTICE 'H7E-5 PASS bloqueios automatizaveis resolvidos';
  ELSE v_fail := v_fail+1; RAISE WARNING 'H7E-5 FAIL bloqueios remanescentes: %', v_blocks; END IF;

  -- H7 (continuação): com o certificado A1 de homologação já registrado e vinculado,
  -- CERTIFICATE_MISSING deixa de ser esperado. O bloqueio só permanece obrigatório
  -- enquanto não houver `certificate_ref`. Os bloqueios de decisão humana
  -- (credenciamento e validação contábil) continuam obrigatórios.
  IF (r.certificate_ref IS NOT NULL OR coalesce(v_blocks,'') LIKE '%CERTIFICATE_MISSING%')
     AND coalesce(v_blocks,'') LIKE '%ACCREDITATION_MISSING%'
     AND coalesce(v_blocks,'') LIKE '%ACCOUNTING_NOT_VALIDATED%' THEN
    v_ok := v_ok+1; RAISE NOTICE 'H7E-6 PASS bloqueios humanos preservados (fail-closed)';
  ELSE v_fail := v_fail+1; RAISE WARNING 'H7E-6 FAIL bloqueio humano ausente: %', v_blocks; END IF;


  IF r.nfe_readiness_status = 'NOT_READY' THEN v_ok := v_ok+1; RAISE NOTICE 'H7E-7 PASS readiness continua NOT_READY';
  ELSE v_fail := v_fail+1; RAISE WARNING 'H7E-7 FAIL readiness=%', r.nfe_readiness_status; END IF;

  RAISE NOTICE '== H7.1 POSTCHECK: % PASS / % FAIL ==', v_ok, v_fail;
  IF v_fail > 0 THEN RAISE EXCEPTION 'H7E_POSTCHECK_FAIL: % falhas', v_fail; END IF;
END $$;

ROLLBACK;
