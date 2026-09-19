-- H15 pos-auditoria: sincronizacao do repositorio com a definicao viva.
-- Autorizacao da prontidao do emitente: usuario comum e comparado diretamente
-- com a organizacao do ator (h15_actor_organization); service_role exige apenas
-- organizacao ativa existente. Lógica fiscal, retorno, search_path e ACL atuais
-- preservados (CREATE OR REPLACE mantem os privilegios vigentes).
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
  IF r.certificate_ref IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_CERTIFICATE_MISSING','field','certificate_ref','severity','BLOCK','message','Certificado digital nao vinculado (fluxo privado de certificados).');
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
