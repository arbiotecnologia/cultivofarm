-- H17 candidate, NOT APPLIED. Canonical target: swzpzcwiasxmjutrmvkm.
-- Only replaces two existing functions; no new guard, policy, fixture or enablement.
BEGIN;
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker
   WHERE project_ref = 'swzpzcwiasxmjutrmvkm'
     AND environment_label = 'STAGING' AND production_emission_allowed IS FALSE)
 OR EXISTS (SELECT 1 FROM public.company_fiscal_settings WHERE production_enabled IS TRUE OR nfe_enabled IS TRUE)
 THEN RAISE EXCEPTION 'H17_CANONICAL_SAFE_GATE_REQUIRED'; END IF;
END $guard$;
CREATE OR REPLACE mantem os privilegios vigentes).
CREATE OR REPLACE FUNCTION public.fn_fiscal_emitter_pendencies_row(r company_fiscal_settings)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE out jsonb := '[]'::jsonb; ie_state text;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = r.organization_id AND o.ativo IS TRUE
    ) THEN
      RAISE EXCEPTION 'H15_ORGANIZATION_FORBIDDEN' USING ERRCODE='42501';
    END IF;
  ELSE
    PERFORM public.h15_require_staff();
    IF r.organization_id IS DISTINCT FROM public.h15_actor_organization() THEN
      RAISE EXCEPTION 'H15_COMPANY_FORBIDDEN' USING ERRCODE='42501';
    END IF;
  END IF;

  IF NOT public.fn_fiscal_cnpj_is_valid(r.cnpj) THEN
    out := out || jsonb_build_object('code','EMITTER_CNPJ_INVALID','field','cnpj','severity','BLOCK','message','CNPJ ausente ou com digito verificador invalido.');
  END IF;
  IF nullif(btrim(coalesce(r.legal_name,'')),'') IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_LEGAL_NAME_MISSING','field','legal_name','severity','BLOCK','message','Razao social obrigatoria.');
  END IF;
  IF r.crt IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_CRT_MISSING','field','crt','severity','BLOCK','message','CRT (1,2,3,4) obrigatorio.');
  END IF;
  IF nullif(btrim(coalesce(r.primary_cnae,'')),'') IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_CNAE_MISSING','field','primary_cnae','severity','BLOCK','message','CNAE principal obrigatorio.');
  END IF;
  IF r.pis_cofins_regime IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_PIS_COFINS_REGIME_MISSING','field','pis_cofins_regime','severity','BLOCK','message','Regime de PIS/COFINS obrigatorio para calculo.');
  END IF;
  IF NOT public.fn_fiscal_cep_is_valid(r.postal_code) THEN
    out := out || jsonb_build_object('code','EMITTER_CEP_INVALID','field','postal_code','severity','BLOCK','message','CEP deve ter 8 digitos.');
  END IF;
  IF public.fn_fiscal_uf_ibge_code(r.state) IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_UF_INVALID','field','state','severity','BLOCK','message','UF invalida.');
  ELSIF NOT public.fn_fiscal_ibge_municipio_coerente(r.municipality_ibge_code, r.state) THEN
    out := out || jsonb_build_object('code','EMITTER_IBGE_INCOHERENT','field','municipality_ibge_code','severity','BLOCK','message','Codigo IBGE do municipio ausente ou incoerente com a UF.');
  END IF;
  IF nullif(btrim(coalesce(r.street,'')),'') IS NULL
     OR nullif(btrim(coalesce(r.number,'')),'') IS NULL
     OR nullif(btrim(coalesce(r.neighborhood,'')),'') IS NULL
     OR nullif(btrim(coalesce(r.city,'')),'') IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_ADDRESS_INCOMPLETE','field','address','severity','BLOCK','message','Endereco completo obrigatorio (logradouro, numero, bairro, municipio).');
  END IF;
  IF coalesce(r.country_code,'') NOT IN ('1058','BR') THEN
    out := out || jsonb_build_object('code','EMITTER_COUNTRY_MISSING','field','country_code','severity','BLOCK','message','Pais obrigatorio (1058 - Brasil).');
  END IF;
  ie_state := public.fn_fiscal_ie_check(r.state, r.state_registration);
  IF ie_state IN ('MISSING','INVALID_LENGTH','INVALID_DV','INVALID_FORMAT','INVALID_UF') THEN
    out := out || jsonb_build_object('code','EMITTER_IE_INVALID','field','state_registration','severity','BLOCK','message','Inscricao estadual invalida para a UF: '||ie_state);
  ELSIF ie_state = 'VALID_LENGTH_DV_NOT_IMPLEMENTED' THEN
    out := out || jsonb_build_object('code','EMITTER_IE_DV_NOT_IMPLEMENTED','field','state_registration','severity','WARN','message','IE com formato compativel; digito verificador desta UF nao e verificado automaticamente.');
  END IF;
  IF r.nfe_series_number IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_SERIES_MISSING','field','nfe_series_number','severity','BLOCK','message','Serie da NF-e (1-999) obrigatoria.');
  END IF;
  IF r.nfe_environment_code IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_ENVIRONMENT_MISSING','field','nfe_environment_code','severity','BLOCK','message','Ambiente tpAmb (2 homologacao / 1 producao) obrigatorio.');
  END IF;
  IF jsonb_array_length(r.uf_accreditations) = 0 THEN
    out := out || jsonb_build_object('code','EMITTER_ACCREDITATION_MISSING','field','uf_accreditations','severity','BLOCK','message','Credenciamento por UF nao registrado.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_certificates c
    WHERE c.id::text = r.certificate_ref AND c.company_settings_id = r.id
      AND c.environment = 'HOMOLOGATION' AND c.status = 'AVAILABLE'
      AND c.is_active IS TRUE AND c.revoked_at IS NULL
      AND c.valid_from <= now() AND c.valid_until > now()) THEN
    out := out || jsonb_build_object('code','EMITTER_CERTIFICATE_MISSING','field','certificate_ref','severity','BLOCK','message','Certificado ausente, indisponivel, revogado, vencido ou de outra empresa.');
  END IF;
  IF r.accounting_validated_at IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_ACCOUNTING_NOT_VALIDATED','field','accounting_validated_at','severity','BLOCK','message','Validacao contabil pendente.');
  END IF;
  IF coalesce(r.nfe_environment_code,'2') = '1' THEN
    out := out || jsonb_build_object('code','EMITTER_PRODUCTION_BLOCKED_F3','field','nfe_environment_code','severity','BLOCK',
      'message','Ambiente de producao (tpAmb=1) bloqueado na fase F3: teto e READY_HOMOLOGATION ate fluxo controlado de homologacao SEFAZ.');
  END IF;
  RETURN out;
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_nfe_readiness_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  emit public.company_fiscal_settings%ROWTYPE;
  rec_total int; rec_ready int; pol_pub int; rules_pub int; series_cnt int;
  cert_ok boolean; pend jsonb := '[]'::jsonb;
  cov jsonb; micro jsonb;
  m_active int; m_ready int; m_draft int; m_blocked int; m_inactive int;
  emitter_status text; overall text;
BEGIN
  PERFORM public.h15_require_staff();

  IF NOT public.fn_fiscal_can_read_internal() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao de leitura fiscal.';
  END IF;

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  SELECT count(*), count(*) FILTER (WHERE nfe_readiness_status = 'READY')
    INTO rec_total, rec_ready FROM public.customer_fiscal_profiles;
  SELECT count(*) INTO pol_pub FROM public.fiscal_operation_policies
   WHERE policy_status = 'PUBLISHED' AND document_model = '55';
  SELECT count(*) INTO rules_pub FROM public.fiscal_tax_rules WHERE status = 'PUBLISHED';
  SELECT count(*) INTO series_cnt FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series WHERE status = 'ACTIVE';
  cert_ok := EXISTS (SELECT 1 FROM public.fiscal_certificates c
    WHERE c.id::text = emit.certificate_ref AND c.company_settings_id = emit.id
      AND c.environment = 'HOMOLOGATION' AND c.status = 'AVAILABLE'
      AND c.is_active IS TRUE AND c.revoked_at IS NULL
      AND c.valid_from <= now() AND c.valid_until > now());

  cov := public.fn_fiscal_scenario_coverage();
  micro := coalesce(cov->'microorganisms','{}'::jsonb);
  m_active   := coalesce((micro->>'active')::int,0);
  m_ready    := coalesce((micro->>'ready')::int,0);
  m_draft    := coalesce((micro->>'draft')::int,0);
  m_blocked  := coalesce((micro->>'blocked')::int,0);
  m_inactive := coalesce((micro->>'inactive')::int,0);

  -- Teto absoluto da F3: nunca READY_PRODUCTION.
  emitter_status := coalesce(emit.nfe_readiness_status,'NOT_READY');
  IF NOT cert_ok OR emitter_status = 'READY_PRODUCTION' THEN
    emitter_status := 'NOT_READY';
  END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','EMITTER_PRODUCTION_BLOCKED_F3',
      'severity','BLOCK','message','Ambiente de producao (tpAmb=1) bloqueado nesta fase. Teto: READY_HOMOLOGATION.');
  END IF;
  IF emit.id IS NOT NULL AND emit.sefaz_homologation_at IS NULL THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','SEFAZ_HOMOLOGATION_NOT_RECORDED',
      'severity','WARN','message','Homologacao SEFAZ ainda nao registrada. A transicao so ocorrera por RPC controlada em fase posterior.');
  END IF;

  IF emit.id IS NULL THEN
    pend := pend || jsonb_build_object('section','EMITENTE','code','EMITTER_NOT_CONFIGURED','severity','BLOCK','message','Emitente nao cadastrado.');
  ELSE
    pend := pend || coalesce((SELECT jsonb_agg(e || jsonb_build_object('section','EMITENTE'))
                              FROM jsonb_array_elements(emit.nfe_readiness_pendencies) e), '[]'::jsonb);
  END IF;

  IF rec_total = 0 THEN
    pend := pend || jsonb_build_object('section','DESTINATARIOS','code','RECIPIENTS_NONE','severity','BLOCK','message','Nenhum perfil fiscal de destinatario cadastrado.');
  ELSIF rec_ready = 0 THEN
    pend := pend || jsonb_build_object('section','DESTINATARIOS','code','RECIPIENTS_NONE_READY','severity','BLOCK','message','Nenhum destinatario com cadastro fiscal completo.');
  END IF;

  IF pol_pub = 0 THEN
    pend := pend || jsonb_build_object('section','OPERACOES','code','OPERATION_POLICIES_NONE','severity','BLOCK','message','Nenhuma politica de operacao/CFOP publicada para modelo 55.');
  END IF;

  IF coalesce((cov->>'total')::int,0) = 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','COVERAGE_NO_SCENARIOS','severity','BLOCK',
      'message','Nao ha cenarios reais (destinatario pronto x canal ativo x NCM oficial) para aferir cobertura tributaria.');
  ELSIF (cov->>'covered')::int < (cov->>'total')::int THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','COVERAGE_INCOMPLETE','severity','BLOCK',
      'message','Cobertura tributaria incompleta: '||(cov->>'covered')||' de '||(cov->>'total')||' cenarios validados no motor.');
  END IF;

  -- Somente microrganismos ATIVOS podem bloquear. Inativos sao informativos.
  IF m_blocked > 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','MICROORGANISMS_BLOCKED','severity','BLOCK',
      'message', m_blocked||' microrganismo(s) ativo(s) com perfil fiscal BLOQUEADO.');
  END IF;
  IF m_draft > 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','MICROORGANISMS_NOT_READY','severity','BLOCK',
      'message', m_draft||' de '||m_active||' microrganismos ativos sem dossie aprovado e validacao contabil.');
  END IF;

  IF NOT cert_ok THEN
    pend := pend || jsonb_build_object('section','CERTIFICADO','code','CERTIFICATE_MISSING','severity','BLOCK','message','Certificado ausente, indisponivel, revogado, vencido ou de outra empresa.');
  END IF;
  IF series_cnt = 0 THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','SERIES_NOT_INITIALIZED','severity','WARN','message','Nenhuma serie de numeracao inicializada; sera criada na primeira reserva.');
  END IF;

  overall := CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(pend) e WHERE e->>'severity'='BLOCK') THEN 'NOT_READY'
    WHEN jsonb_array_length(pend) > 0 THEN 'PARTIAL'
    ELSE 'READY_HOMOLOGATION' END;

  RETURN jsonb_build_object(
    'generatedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
    'documentModel','55',
    'maxAllowedStatus','READY_HOMOLOGATION',
    'emitter', jsonb_build_object(
      'configured', emit.id IS NOT NULL,
      'status', emitter_status,
      'crt', emit.crt, 'uf', emit.state,
      'series', emit.nfe_series_number, 'environment', emit.nfe_environment_code,
      'certificateLinked', cert_ok,
      'sefazHomologationRecorded', emit.sefaz_homologation_at IS NOT NULL,
      'productionBlocked', true,
      'accountingValidated', emit.accounting_validated_at IS NOT NULL),
    'recipients', jsonb_build_object('total', rec_total, 'ready', rec_ready),
    'operations', jsonb_build_object('publishedPolicies', pol_pub),
    'taxes', jsonb_build_object('publishedRules', rules_pub, 'missingMandatoryKinds', '[]'::jsonb),
    'coverage', cov,
    'microorganisms', jsonb_build_object(
      'active', m_active, 'ready', m_ready, 'draft', m_draft,
      'blocked', m_blocked, 'inactive', m_inactive,
      'total', m_active + m_inactive),
    'numbering', jsonb_build_object('activeSeries', series_cnt),
    'pendencies', pend,
    'overallStatus', overall);
END $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_nfe_readiness_v1() FROM PUBLIC,anon;

COMMIT;
