-- =====================================================================
-- FASE F4.2 — VERIFY (assertivas de banco, SOMENTE LEITURA)
-- Executar DEPOIS de 20-run-e2e.ts. Fail-fast: qualquer gate falho aborta.
--   psql --single-transaction -v ON_ERROR_STOP=1 \
--        -v f42_tag="'F42-HARNESS-20260806A'" -f 30-verify.sql
-- =====================================================================

\if :{?f42_tag}
\else
  \echo 'ERRO: informe -v f42_tag'
  \quit
\endif

BEGIN;

DO $g$
DECLARE v text;
BEGIN
  SELECT project_ref INTO v FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'F42_GUARD: somente staging ikaauvsflpmamgxmkhoq';
  END IF;
END $g$;

DO $v$
DECLARE
  v_tag     text := :'f42_tag';
  v_invoice uuid;
  n int; r record; pass int := 0; total int := 0;
  PROCEDURE_NOTE text;
BEGIN
  SELECT entity_id INTO v_invoice
    FROM public._f42_harness_fixtures
   WHERE tag = v_tag AND entity = 'fiscal_invoices'
   ORDER BY id LIMIT 1;
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'F42_VERIFY: fixtures da tag % nao encontradas', v_tag;
  END IF;

  -- G1 — existe exatamente uma execução SIGNED para o documento elegível.
  total := total + 1;
  SELECT count(*) INTO n FROM public.fiscal_xml_runs
   WHERE fiscal_invoice_id = v_invoice AND state = 'SIGNED';
  IF n <> 1 THEN RAISE EXCEPTION 'G1 FAIL: execucoes SIGNED = % (esperado 1)', n; END IF;
  pass := pass + 1; RAISE NOTICE 'G1 PASS  execucao SIGNED unica';

  -- G2 — nenhuma execução ficou pendente (PREPARED/GENERATED/XSD_VALIDATED).
  total := total + 1;
  SELECT count(*) INTO n FROM public.fiscal_xml_runs
   WHERE fiscal_invoice_id = v_invoice
     AND state NOT IN ('SIGNED','FAILED');
  IF n <> 0 THEN RAISE EXCEPTION 'G2 FAIL: % execucao(oes) pendente(s)', n; END IF;
  pass := pass + 1; RAISE NOTICE 'G2 PASS  nenhuma execucao pendente';

  -- G3 — validator e pacote XSD oficiais registrados na execução assinada.
  total := total + 1;
  SELECT * INTO r FROM public.fiscal_xml_runs
   WHERE fiscal_invoice_id = v_invoice AND state = 'SIGNED' LIMIT 1;
  IF coalesce(r.validation->>'validator','') <> 'xmllint-wasm@5.3.0 (libxml2, XSD 1.0)' THEN
    RAISE EXCEPTION 'G3 FAIL: validator=%', coalesce(r.validation->>'validator','-');
  END IF;
  IF coalesce(r.validation->>'xsdPackage','') <> 'PL_010e_v1.02' THEN
    RAISE EXCEPTION 'G3 FAIL: xsdPackage=%', coalesce(r.validation->>'xsdPackage','-');
  END IF;
  IF coalesce(r.validation->>'target','') <> 'SIGNED_DOCUMENT' THEN
    RAISE EXCEPTION 'G3 FAIL: alvo da validacao XSD nao foi o documento assinado';
  END IF;
  pass := pass + 1; RAISE NOTICE 'G3 PASS  validator/pacote/alvo XSD corretos';

  -- G4 — hashes, bytes e paths presentes e coerentes.
  total := total + 1;
  IF r.unsigned_sha256 !~ '^[0-9a-f]{64}$' OR r.signed_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'G4 FAIL: hashes ausentes/mal formados';
  END IF;
  IF coalesce(r.signed_bytes,0) <= coalesce(r.unsigned_bytes,0) THEN
    RAISE EXCEPTION 'G4 FAIL: XML assinado nao e maior que o nao assinado';
  END IF;
  IF r.unsigned_path IS NULL OR r.signed_path IS NULL
     OR r.signed_path NOT LIKE v_invoice::text || '/%' THEN
    RAISE EXCEPTION 'G4 FAIL: paths de artefato invalidos';
  END IF;
  pass := pass + 1; RAISE NOTICE 'G4 PASS  hashes/bytes/paths coerentes';

  -- G5 — metadados de assinatura presentes (sem material sensível).
  total := total + 1;
  IF coalesce(r.signature->>'certificateFingerprintSha256','') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'G5 FAIL: fingerprint do certificado ausente';
  END IF;
  IF public.fiscal_json_has_sensitive_key(r.signature)
     OR public.fiscal_json_has_sensitive_key(r.validation) THEN
    RAISE EXCEPTION 'G5 FAIL: chave sensivel persistida na execucao';
  END IF;
  pass := pass + 1; RAISE NOTICE 'G5 PASS  metadados de assinatura sanitizados';

  -- G6 — replay idempotente: uma única run_version por chave.
  total := total + 1;
  SELECT count(DISTINCT run_version) INTO n FROM public.fiscal_xml_runs
   WHERE fiscal_invoice_id = v_invoice;
  IF n <> (SELECT count(*) FROM public.fiscal_xml_runs WHERE fiscal_invoice_id = v_invoice) THEN
    RAISE EXCEPTION 'G6 FAIL: run_version duplicada';
  END IF;
  SELECT count(*) INTO n FROM public.fiscal_xml_runs
   WHERE fiscal_invoice_id = v_invoice
     AND idempotency_key LIKE v_tag || '-MAIN%';
  IF n <> 1 THEN RAISE EXCEPTION 'G6 FAIL: chave principal gerou % execucoes', n; END IF;
  pass := pass + 1; RAISE NOTICE 'G6 PASS  replay nao criou nova execucao';

  -- G7 — concorrência: a chave concorrente produziu no máximo uma execução.
  total := total + 1;
  SELECT count(*) INTO n FROM public.fiscal_xml_runs
   WHERE fiscal_invoice_id = v_invoice
     AND idempotency_key LIKE v_tag || '-CONC%';
  IF n > 1 THEN RAISE EXCEPTION 'G7 FAIL: concorrencia criou % execucoes', n; END IF;
  pass := pass + 1; RAISE NOTICE 'G7 PASS  concorrencia com execucao unica';

  -- G8 — documento em cotação não produziu qualquer efeito colateral.
  total := total + 1;
  SELECT count(*) INTO n FROM public.fiscal_xml_runs fr
    JOIN public._f42_harness_fixtures f
      ON f.entity = 'fiscal_invoices' AND f.entity_id = fr.fiscal_invoice_id
   WHERE f.tag = v_tag
     AND fr.fiscal_invoice_id <> v_invoice;
  IF n <> 0 THEN RAISE EXCEPTION 'G8 FAIL: documento bloqueado gerou % execucao(oes)', n; END IF;
  pass := pass + 1; RAISE NOTICE 'G8 PASS  bloqueio sem efeitos colaterais';

  -- G9 — o teto SIGNED foi respeitado: nada transmitido/autorizado.
  total := total + 1;
  SELECT count(*) INTO n FROM public.fiscal_xml_runs
   WHERE fiscal_invoice_id = v_invoice
     AND state NOT IN ('PREPARED','GENERATED','XSD_VALIDATED','SIGNED','FAILED');
  IF n <> 0 THEN RAISE EXCEPTION 'G9 FAIL: estado fora do teto SIGNED'; END IF;
  IF EXISTS (SELECT 1 FROM public.fiscal_invoices
              WHERE id = v_invoice AND status NOT IN ('PENDING','ERROR')) THEN
    RAISE EXCEPTION 'G9 FAIL: documento saiu de PENDING sem transmissao';
  END IF;
  pass := pass + 1; RAISE NOTICE 'G9 PASS  teto SIGNED respeitado';

  -- G10 — trilha de auditoria registrada.
  total := total + 1;
  SELECT count(*) INTO n FROM public.fiscal_audit_log
   WHERE table_name = 'fiscal_xml_runs' AND record_id = r.id;
  IF n = 0 THEN RAISE EXCEPTION 'G10 FAIL: sem trilha de auditoria'; END IF;
  pass := pass + 1; RAISE NOTICE 'G10 PASS trilha de auditoria presente';

  -- G11 — certificado usado é a fixture do harness (nunca um real).
  total := total + 1;
  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_certificates c
     WHERE c.id = r.certificate_id AND c.display_name LIKE 'F42-HARNESS-%') THEN
    RAISE EXCEPTION 'G11 FAIL: assinatura nao usou o certificado sintetico do harness';
  END IF;
  pass := pass + 1; RAISE NOTICE 'G11 PASS certificado sintetico do harness';

  -- G12 — o emitente sintético é o ÚNICO ativo durante o harness.
  total := total + 1;
  SELECT count(*) INTO n FROM public.company_fiscal_settings WHERE is_active;
  IF n <> 1 THEN RAISE EXCEPTION 'G12 FAIL: % emitentes ativos (esperado 1)', n; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_fiscal_settings c
      JOIN public._f42_harness_fixtures f
        ON f.entity = 'company_fiscal_settings' AND f.entity_id = c.id AND f.tag = v_tag
     WHERE c.is_active) THEN
    RAISE EXCEPTION 'G12 FAIL: emitente ativo nao e o fixture da tag';
  END IF;
  pass := pass + 1; RAISE NOTICE 'G12 PASS emitente sintetico unico ativo';

  -- G13 — o emitente ativo anterior está registrado para restauração.
  total := total + 1;
  IF NOT EXISTS (
    SELECT 1 FROM public._f42_harness_fixtures
     WHERE tag = v_tag AND entity = 'previous_active_company_fiscal_settings') THEN
    RAISE EXCEPTION 'G13 FAIL: emitente anterior nao registrado';
  END IF;
  pass := pass + 1; RAISE NOTICE 'G13 PASS emitente anterior registrado';

  -- G14 — prontidão real do emitente e do destinatário (contrato do motor).
  total := total + 1;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_fiscal_settings c
      JOIN public._f42_harness_fixtures f
        ON f.entity = 'company_fiscal_settings' AND f.entity_id = c.id AND f.tag = v_tag
     WHERE c.nfe_readiness_status = 'READY_HOMOLOGATION') THEN
    RAISE EXCEPTION 'G14 FAIL: emitente sintetico nao esta READY_HOMOLOGATION';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_fiscal_profiles p
      JOIN public._f42_harness_fixtures f
        ON f.entity = 'customer_fiscal_profiles' AND f.entity_id = p.customer_id AND f.tag = v_tag
     WHERE p.nfe_readiness_status = 'READY' AND p.profile_status = 'VALIDATED') THEN
    RAISE EXCEPTION 'G14 FAIL: destinatario sintetico nao esta READY/VALIDATED';
  END IF;
  pass := pass + 1; RAISE NOTICE 'G14 PASS prontidao real emitente/destinatario';

  -- G15 — nenhum objeto sintético fora da tag corrente.
  total := total + 1;
  SELECT count(*) INTO n FROM public._f42_harness_fixtures WHERE tag <> v_tag;
  IF n <> 0 THEN RAISE EXCEPTION 'G15 FAIL: % fixture(s) de outra tag presentes', n; END IF;
  SELECT count(*) INTO n FROM public.company_fiscal_settings
   WHERE legal_name LIKE 'F42-HARNESS-%' AND legal_name NOT LIKE v_tag || '%';
  IF n <> 0 THEN RAISE EXCEPTION 'G15 FAIL: % emitente(s) sinteticos fora da tag', n; END IF;
  SELECT count(*) INTO n FROM public.clientes
   WHERE nome LIKE 'F42-HARNESS-%' AND nome NOT LIKE v_tag || '%';
  IF n <> 0 THEN RAISE EXCEPTION 'G15 FAIL: % cliente(s) sinteticos fora da tag', n; END IF;
  SELECT count(*) INTO n FROM public.partner_accounts
   WHERE razao_social LIKE 'F42-HARNESS-%' AND razao_social NOT LIKE v_tag || '%';
  IF n <> 0 THEN RAISE EXCEPTION 'G15 FAIL: % parceiro(s) sinteticos fora da tag', n; END IF;
  pass := pass + 1; RAISE NOTICE 'G15 PASS somente objetos da tag corrente';

  -- G16 — gatilhos de prontidão permanecem habilitados (nada foi desligado).
  total := total + 1;
  SELECT count(*) INTO n FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgenabled <> 'D'
     AND t.tgfoid IN (
       'public.tg_fiscal_emitter_refresh_readiness()'::regprocedure,
       'public.tg_fiscal_recipient_refresh_readiness()'::regprocedure);
  IF n < 2 THEN RAISE EXCEPTION 'G16 FAIL: gatilhos de prontidao ausentes/desabilitados (%)', n; END IF;
  pass := pass + 1; RAISE NOTICE 'G16 PASS gatilhos de prontidao ativos';

  RAISE NOTICE 'VERIFY F4.2: %/% GATES PASS', pass, total;
  IF pass <> total THEN RAISE EXCEPTION 'VERIFY F4.2 FAIL'; END IF;
END $v$;

COMMIT;
