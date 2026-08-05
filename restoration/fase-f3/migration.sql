-- =====================================================================
-- FASE F3 — PRONTIDÃO FISCAL DO EMITENTE/DESTINATÁRIO, OPERAÇÃO E
--            CÁLCULO TRIBUTÁRIO PARA NF-e MODELO 55
-- Base: commit c49950472d9409e76b09b3ae6abac56ddd4dd1bb
-- Ambiente: STAGING ikaauvsflpmamgxmkhoq
-- PRODUÇÃO navfzbwgwzruipouyfnk NÃO ACESSADA.
--
-- Escopo: camada anterior à geração do XML. Não transmite, não assina,
-- não autoriza e não consulta SEFAZ. Apenas reserva DRAFT de numeração.
--
-- Princípios inegociáveis aplicados:
--   * Evolução das estruturas existentes (company_fiscal_settings,
--     customer_fiscal_profiles, fiscal_operation_policies); nenhum fluxo
--     paralelo.
--   * Ausência de regra tributária => BLOQUEIO explícito. Nunca zero ou
--     isento silencioso.
--   * Nenhum dado fiscal real é inventado. Nenhuma alíquota, CFOP, CST,
--     CSOSN, NCM ou IE é semeada. O emitente placeholder permanece
--     NOT_READY.
--   * Segredos/certificados nunca trafegam por JSON de auditoria.
-- =====================================================================

-- =====================================================================
-- SEÇÃO 1 — FONTES OFICIAIS (registro, sem regra derivada)
-- =====================================================================

INSERT INTO public.fiscal_official_sources (source_key, authority, name, url, doc_version, consulted_at, notes, is_active)
VALUES
  ('MOC_NFE_70', 'SEFAZ/ENCAT — Portal Nacional da NF-e',
   'Manual de Orientação do Contribuinte NF-e (MOC) versão 7.0',
   'https://www.nfe.fazenda.gov.br/portal/principal.aspx', '7.0', now(),
   'Layout, regras de validação, arredondamento e totalizacao da NF-e modelo 55.', true),
  ('PORTAL_NFE_SCHEMAS_NT', 'SEFAZ/ENCAT — Portal Nacional da NF-e',
   'Schemas XSD e Notas Tecnicas vigentes da NF-e',
   'https://www.nfe.fazenda.gov.br/portal/principal.aspx', 'vigente', now(),
   'Fonte das NT vigentes, inclusive scaffolding da Reforma Tributaria (IBS/CBS/IS).', true),
  ('PORTAL_NFE_SERVICOS_UF', 'SEFAZ/ENCAT — Portal Nacional da NF-e',
   'Disponibilidade e enderecos de servicos da NF-e por UF',
   'https://www.nfe.fazenda.gov.br/portal/disponibilidade.aspx', 'vigente', now(),
   'Base para credenciamento e endpoints por UF. Nao define tributacao.', true),
  ('RFB_NCM_TIPI', 'Receita Federal do Brasil',
   'Tabela NCM / TIPI',
   'https://www.gov.br/receitafederal/pt-br', 'vigente', now(),
   'Classificacao fiscal de mercadorias e aliquotas de IPI por NCM.', true),
  ('GUIA_EFD_ICMS_IPI_322', 'Receita Federal do Brasil / CONFAZ',
   'Guia Pratico da EFD ICMS/IPI versao 3.2.2',
   'https://www.gov.br/receitafederal/pt-br', '3.2.2', now(),
   'Escrituracao, CST/CSOSN, bases e ajustes. Referencia de consistencia fiscal.', true)
ON CONFLICT (source_key) DO UPDATE
   SET authority = EXCLUDED.authority,
       name      = EXCLUDED.name,
       url       = EXCLUDED.url,
       doc_version = EXCLUDED.doc_version,
       notes     = EXCLUDED.notes,
       is_active = true,
       updated_at = now();

-- =====================================================================
-- SEÇÃO 2 — HELPERS DETERMINÍSTICOS DE VALIDAÇÃO
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_fiscal_digits(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(coalesce(_v,''), '[^0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_round(_v numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT round(coalesce(_v, 0)::numeric, 2);
$$;

-- CNPJ: modulo 11 (MOC NF-e 7.0 / RFB)
CREATE OR REPLACE FUNCTION public.fn_fiscal_cnpj_is_valid(_v text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  d text := public.fn_fiscal_digits(_v);
  w1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int := 0; i int; dv1 int; dv2 int;
BEGIN
  IF length(d) <> 14 THEN RETURN false; END IF;
  IF d ~ ('^(' || substr(d,1,1) || '){14}$') THEN RETURN false; END IF;
  FOR i IN 1..12 LOOP s := s + substr(d,i,1)::int * w1[i]; END LOOP;
  dv1 := s % 11; dv1 := CASE WHEN dv1 < 2 THEN 0 ELSE 11 - dv1 END;
  IF dv1 <> substr(d,13,1)::int THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..13 LOOP s := s + substr(d,i,1)::int * w2[i]; END LOOP;
  dv2 := s % 11; dv2 := CASE WHEN dv2 < 2 THEN 0 ELSE 11 - dv2 END;
  RETURN dv2 = substr(d,14,1)::int;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_cpf_is_valid(_v text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  d text := public.fn_fiscal_digits(_v);
  s int := 0; i int; dv1 int; dv2 int;
BEGIN
  IF length(d) <> 11 THEN RETURN false; END IF;
  IF d ~ ('^(' || substr(d,1,1) || '){11}$') THEN RETURN false; END IF;
  FOR i IN 1..9 LOOP s := s + substr(d,i,1)::int * (11 - i); END LOOP;
  dv1 := (s * 10) % 11; IF dv1 = 10 THEN dv1 := 0; END IF;
  IF dv1 <> substr(d,10,1)::int THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..10 LOOP s := s + substr(d,i,1)::int * (12 - i); END LOOP;
  dv2 := (s * 10) % 11; IF dv2 = 10 THEN dv2 := 0; END IF;
  RETURN dv2 = substr(d,11,1)::int;
END $$;

-- Códigos IBGE oficiais de UF (tabela estável do IBGE).
CREATE OR REPLACE FUNCTION public.fn_fiscal_uf_ibge_code(_uf text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE upper(btrim(coalesce(_uf,'')))
    WHEN 'RO' THEN '11' WHEN 'AC' THEN '12' WHEN 'AM' THEN '13' WHEN 'RR' THEN '14'
    WHEN 'PA' THEN '15' WHEN 'AP' THEN '16' WHEN 'TO' THEN '17' WHEN 'MA' THEN '21'
    WHEN 'PI' THEN '22' WHEN 'CE' THEN '23' WHEN 'RN' THEN '24' WHEN 'PB' THEN '25'
    WHEN 'PE' THEN '26' WHEN 'AL' THEN '27' WHEN 'SE' THEN '28' WHEN 'BA' THEN '29'
    WHEN 'MG' THEN '31' WHEN 'ES' THEN '32' WHEN 'RJ' THEN '33' WHEN 'SP' THEN '35'
    WHEN 'PR' THEN '41' WHEN 'SC' THEN '42' WHEN 'RS' THEN '43' WHEN 'MS' THEN '50'
    WHEN 'MT' THEN '51' WHEN 'GO' THEN '52' WHEN 'DF' THEN '53'
    ELSE NULL END;
$$;

-- Coerência estrutural cMun x UF (prefixo IBGE) — não inventa municípios.
CREATE OR REPLACE FUNCTION public.fn_fiscal_ibge_municipio_coerente(_cmun text, _uf text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT public.fn_fiscal_digits(_cmun) ~ '^[0-9]{7}$'
     AND public.fn_fiscal_uf_ibge_code(_uf) IS NOT NULL
     AND substr(public.fn_fiscal_digits(_cmun),1,2) = public.fn_fiscal_uf_ibge_code(_uf);
$$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_cep_is_valid(_cep text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT public.fn_fiscal_digits(_cep) ~ '^[0-9]{8}$';
$$;

-- IE: comprimento oficial por UF para as 27 unidades federativas e
-- dígito verificador apenas onde o algoritmo é público e determinístico.
-- Retorna estado explícito; NUNCA silencia como válido.
CREATE OR REPLACE FUNCTION public.fn_fiscal_ie_check(_uf text, _ie text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  uf text := upper(btrim(coalesce(_uf,'')));
  raw text := upper(btrim(coalesce(_ie,'')));
  d text; len int; s int := 0; i int; dv int; w int;
BEGIN
  IF raw = '' THEN RETURN 'MISSING'; END IF;
  IF raw IN ('ISENTO','ISENTA') THEN RETURN 'ISENTO'; END IF;
  IF public.fn_fiscal_uf_ibge_code(uf) IS NULL THEN RETURN 'INVALID_UF'; END IF;
  d := public.fn_fiscal_digits(raw);
  len := length(d);

  IF (uf = 'AC' AND len <> 13)
  OR (uf = 'AL' AND len <> 9) OR (uf = 'AM' AND len <> 9)
  OR (uf = 'AP' AND len <> 9) OR (uf = 'BA' AND len NOT IN (8,9))
  OR (uf = 'CE' AND len <> 9) OR (uf = 'DF' AND len <> 13)
  OR (uf = 'ES' AND len <> 9) OR (uf = 'GO' AND len <> 9)
  OR (uf = 'MA' AND len <> 9) OR (uf = 'MG' AND len <> 13)
  OR (uf = 'MS' AND len <> 9) OR (uf = 'MT' AND len <> 11)
  OR (uf = 'PA' AND len <> 9) OR (uf = 'PB' AND len <> 9)
  OR (uf = 'PE' AND len NOT IN (9,14)) OR (uf = 'PI' AND len <> 9)
  OR (uf = 'PR' AND len <> 10) OR (uf = 'RJ' AND len <> 8)
  OR (uf = 'RN' AND len NOT IN (9,10)) OR (uf = 'RO' AND len <> 14)
  OR (uf = 'RR' AND len <> 9) OR (uf = 'RS' AND len <> 10)
  OR (uf = 'SC' AND len <> 9) OR (uf = 'SE' AND len <> 9)
  OR (uf = 'SP' AND len NOT IN (12,13)) OR (uf = 'TO' AND len <> 9)
  THEN
    RETURN 'INVALID_LENGTH';
  END IF;

  -- Dígito verificador: subconjunto com algoritmo público e estável.
  IF uf = 'GO' THEN
    IF substr(d,1,2) NOT IN ('10','11','15') THEN RETURN 'INVALID_FORMAT'; END IF;
    s := 0;
    FOR i IN 1..8 LOOP s := s + substr(d,i,1)::int * (10 - i); END LOOP;
    dv := s % 11;
    dv := CASE WHEN dv = 0 THEN 0 WHEN dv = 1 THEN 1 ELSE 11 - dv END;
    RETURN CASE WHEN dv = substr(d,9,1)::int THEN 'VALID_DV' ELSE 'INVALID_DV' END;
  ELSIF uf = 'RJ' THEN
    s := 0; w := 2;
    FOR i IN 1..7 LOOP
      s := s + substr(d,i,1)::int * w;
      w := CASE WHEN w = 7 THEN 2 ELSE w + 1 END;
    END LOOP;
    dv := 11 - (s % 11); IF dv >= 10 THEN dv := 0; END IF;
    RETURN CASE WHEN dv = substr(d,8,1)::int THEN 'VALID_DV' ELSE 'INVALID_DV' END;
  ELSIF uf = 'SC' THEN
    s := 0;
    FOR i IN 1..8 LOOP s := s + substr(d,i,1)::int * (10 - i); END LOOP;
    dv := 11 - (s % 11); IF dv >= 10 THEN dv := 0; END IF;
    RETURN CASE WHEN dv = substr(d,9,1)::int THEN 'VALID_DV' ELSE 'INVALID_DV' END;
  END IF;

  RETURN 'VALID_LENGTH_DV_NOT_IMPLEMENTED';
END $$;

-- GTIN já validado na F2 (fn_gtin_is_valid). Chave de acesso: DV modulo 11.
CREATE OR REPLACE FUNCTION public.fn_fiscal_access_key_dv(_key43 text)
RETURNS int LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  d text := public.fn_fiscal_digits(_key43);
  s int := 0; i int; w int := 2; r int;
BEGIN
  IF length(d) <> 43 THEN
    RAISE EXCEPTION 'FISCAL_ACCESS_KEY_LENGTH: esperado 43 digitos antes do DV, recebido %', length(d);
  END IF;
  FOR i IN REVERSE 43..1 LOOP
    s := s + substr(d,i,1)::int * w;
    w := CASE WHEN w = 9 THEN 2 ELSE w + 1 END;
  END LOOP;
  r := 11 - (s % 11);
  RETURN CASE WHEN r >= 10 THEN 0 ELSE r END;
END $$;

-- =====================================================================
-- SEÇÃO 3 — EMITENTE (evolução de company_fiscal_settings)
-- =====================================================================

ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS nfe_series_number integer,
  ADD COLUMN IF NOT EXISTS nfe_environment_code text,
  ADD COLUMN IF NOT EXISTS uf_accreditations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pis_cofins_regime text,
  ADD COLUMN IF NOT EXISTS ipi_taxpayer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS icms_st_responsible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fcp_applicable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS difal_responsible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rtc_scaffolding_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nfe_readiness_status text NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN IF NOT EXISTS nfe_readiness_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS nfe_readiness_pendencies jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_nfe_series_number_range') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_nfe_series_number_range
      CHECK (nfe_series_number IS NULL OR (nfe_series_number BETWEEN 1 AND 999));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_nfe_environment_code_domain') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_nfe_environment_code_domain
      CHECK (nfe_environment_code IS NULL OR nfe_environment_code IN ('1','2'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_crt_domain') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_crt_domain
      CHECK (crt IS NULL OR crt IN ('1','2','3','4'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_pis_cofins_regime_domain') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_pis_cofins_regime_domain
      CHECK (pis_cofins_regime IS NULL OR pis_cofins_regime IN ('CUMULATIVO','NAO_CUMULATIVO','MISTO','SIMPLES_NACIONAL'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_uf_accreditations_shape') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_uf_accreditations_shape
      CHECK (jsonb_typeof(uf_accreditations) = 'array'
             AND NOT public.fiscal_json_has_sensitive_key(jsonb_build_object('v', uf_accreditations)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_nfe_readiness_domain') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_nfe_readiness_domain
      CHECK (nfe_readiness_status IN ('NOT_READY','PARTIAL','READY_HOMOLOGATION','READY_PRODUCTION','BLOCKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_nfe_readiness_pendencies_shape') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_nfe_readiness_pendencies_shape
      CHECK (jsonb_typeof(nfe_readiness_pendencies) = 'array');
  END IF;
END $$;

-- Avaliação server-side das pendências do emitente. Não corrige dados.
CREATE OR REPLACE FUNCTION public.fn_fiscal_emitter_pendencies(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE r public.company_fiscal_settings%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.company_fiscal_settings WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_array(jsonb_build_object('code','EMITTER_NOT_FOUND','field','id','severity','BLOCK'));
  END IF;
  RETURN public.fn_fiscal_emitter_pendencies_row(r);
END $$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_emitter_status(_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  WITH p AS (SELECT public.fn_fiscal_emitter_pendencies(_id) AS j)
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM p, jsonb_array_elements(p.j) e WHERE e->>'severity' = 'BLOCK') THEN 'NOT_READY'
    WHEN EXISTS (SELECT 1 FROM p, jsonb_array_elements(p.j) e) THEN 'PARTIAL'
    ELSE 'READY_HOMOLOGATION' END
  FROM p;
$$;

CREATE OR REPLACE FUNCTION public.tg_fiscal_emitter_refresh_readiness()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  NEW.nfe_readiness_pendencies := public.fn_fiscal_emitter_pendencies_row(NEW);
  NEW.nfe_readiness_status := CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.nfe_readiness_pendencies) e WHERE e->>'severity'='BLOCK') THEN 'NOT_READY'
    WHEN jsonb_array_length(NEW.nfe_readiness_pendencies) > 0 THEN 'PARTIAL'
    WHEN coalesce(NEW.nfe_environment_code,'2') = '1' THEN 'READY_PRODUCTION'
    ELSE 'READY_HOMOLOGATION' END;
  NEW.nfe_readiness_checked_at := now();
  RETURN NEW;
END $$;

-- Versão por ROW (permite avaliar antes do commit, sem reler a tabela).
CREATE OR REPLACE FUNCTION public.fn_fiscal_emitter_pendencies_row(r public.company_fiscal_settings)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE out jsonb := '[]'::jsonb; ie_state text;
BEGIN
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
  RETURN out;
END $$;

DROP TRIGGER IF EXISTS trg_fiscal_emitter_readiness ON public.company_fiscal_settings;
CREATE TRIGGER trg_fiscal_emitter_readiness
  BEFORE INSERT OR UPDATE ON public.company_fiscal_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_emitter_refresh_readiness();

-- Recalcula o estado atual sem alterar nenhum dado de negócio.
UPDATE public.company_fiscal_settings SET updated_at = updated_at;

-- =====================================================================
-- SEÇÃO 4 — DESTINATÁRIO (evolução de customer_fiscal_profiles)
-- =====================================================================

ALTER TABLE public.customer_fiscal_profiles
  ADD COLUMN IF NOT EXISTS person_type text,
  ADD COLUMN IF NOT EXISTS cpf_cnpj text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS state_registration text,
  ADD COLUMN IF NOT EXISTS final_consumer boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS icms_taxpayer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nfe_readiness_status text NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN IF NOT EXISTS nfe_readiness_pendencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nfe_readiness_checked_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfp_person_type_domain') THEN
    ALTER TABLE public.customer_fiscal_profiles
      ADD CONSTRAINT cfp_person_type_domain CHECK (person_type IS NULL OR person_type IN ('PF','PJ','ESTRANGEIRO'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfp_nfe_readiness_domain') THEN
    ALTER TABLE public.customer_fiscal_profiles
      ADD CONSTRAINT cfp_nfe_readiness_domain CHECK (nfe_readiness_status IN ('NOT_READY','PARTIAL','READY'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfp_nfe_readiness_pendencies_shape') THEN
    ALTER TABLE public.customer_fiscal_profiles
      ADD CONSTRAINT cfp_nfe_readiness_pendencies_shape CHECK (jsonb_typeof(nfe_readiness_pendencies) = 'array');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_recipient_pendencies_row(r public.customer_fiscal_profiles)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE out jsonb := '[]'::jsonb; ie_state text; doc text;
BEGIN
  doc := public.fn_fiscal_digits(r.cpf_cnpj);
  IF r.person_type IS NULL THEN
    out := out || jsonb_build_object('code','RECIPIENT_PERSON_TYPE_MISSING','field','person_type','severity','BLOCK','message','Tipo de pessoa (PF/PJ/ESTRANGEIRO) obrigatorio.');
  ELSIF r.person_type = 'PJ' AND NOT public.fn_fiscal_cnpj_is_valid(doc) THEN
    out := out || jsonb_build_object('code','RECIPIENT_CNPJ_INVALID','field','cpf_cnpj','severity','BLOCK','message','CNPJ do destinatario invalido.');
  ELSIF r.person_type = 'PF' AND NOT public.fn_fiscal_cpf_is_valid(doc) THEN
    out := out || jsonb_build_object('code','RECIPIENT_CPF_INVALID','field','cpf_cnpj','severity','BLOCK','message','CPF do destinatario invalido.');
  ELSIF r.person_type = 'ESTRANGEIRO' AND coalesce(r.country_code,'1058') IN ('1058','BR') THEN
    out := out || jsonb_build_object('code','RECIPIENT_FOREIGN_COUNTRY_REQUIRED','field','country_code','severity','BLOCK','message','Destinatario estrangeiro exige pais diferente de Brasil.');
  END IF;

  IF nullif(btrim(coalesce(r.legal_name,'')),'') IS NULL THEN
    out := out || jsonb_build_object('code','RECIPIENT_NAME_MISSING','field','legal_name','severity','BLOCK','message','Razao social / nome do destinatario obrigatorio.');
  END IF;
  IF r.taxpayer_indicator IS NULL THEN
    out := out || jsonb_build_object('code','RECIPIENT_TAXPAYER_INDICATOR_MISSING','field','taxpayer_indicator','severity','BLOCK','message','Indicador de IE do destinatario (indIEDest) obrigatorio.');
  END IF;
  IF coalesce(r.foreign_customer_indicator,false) = false THEN
    IF public.fn_fiscal_uf_ibge_code(r.fiscal_state) IS NULL THEN
      out := out || jsonb_build_object('code','RECIPIENT_UF_INVALID','field','fiscal_state','severity','BLOCK','message','UF do destinatario invalida.');
    ELSIF NOT public.fn_fiscal_ibge_municipio_coerente(r.fiscal_municipality_ibge_code, r.fiscal_state) THEN
      out := out || jsonb_build_object('code','RECIPIENT_IBGE_INCOHERENT','field','fiscal_municipality_ibge_code','severity','BLOCK','message','Codigo IBGE do municipio ausente ou incoerente com a UF.');
    END IF;
    IF NOT public.fn_fiscal_cep_is_valid(r.fiscal_postal_code) THEN
      out := out || jsonb_build_object('code','RECIPIENT_CEP_INVALID','field','fiscal_postal_code','severity','BLOCK','message','CEP do destinatario deve ter 8 digitos.');
    END IF;
    IF nullif(btrim(coalesce(r.fiscal_street,'')),'') IS NULL
       OR nullif(btrim(coalesce(r.fiscal_number,'')),'') IS NULL
       OR nullif(btrim(coalesce(r.fiscal_neighborhood,'')),'') IS NULL
       OR nullif(btrim(coalesce(r.fiscal_city,'')),'') IS NULL THEN
      out := out || jsonb_build_object('code','RECIPIENT_ADDRESS_INCOMPLETE','field','address','severity','BLOCK','message','Endereco fiscal completo obrigatorio.');
    END IF;
    IF coalesce(r.icms_taxpayer,false) THEN
      ie_state := public.fn_fiscal_ie_check(r.fiscal_state, r.state_registration);
      IF ie_state IN ('MISSING','INVALID_LENGTH','INVALID_DV','INVALID_FORMAT','INVALID_UF','ISENTO') THEN
        out := out || jsonb_build_object('code','RECIPIENT_IE_INVALID','field','state_registration','severity','BLOCK','message','Destinatario contribuinte exige IE valida: '||ie_state);
      ELSIF ie_state = 'VALID_LENGTH_DV_NOT_IMPLEMENTED' THEN
        out := out || jsonb_build_object('code','RECIPIENT_IE_DV_NOT_IMPLEMENTED','field','state_registration','severity','WARN','message','IE com formato compativel; DV desta UF nao e verificado automaticamente.');
      END IF;
    END IF;
  END IF;
  IF nullif(btrim(coalesce(r.fiscal_email,'')),'') IS NULL THEN
    out := out || jsonb_build_object('code','RECIPIENT_FISCAL_EMAIL_MISSING','field','fiscal_email','severity','WARN','message','E-mail fiscal ausente; DANFE/XML nao poderao ser enviados automaticamente.');
  END IF;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.tg_fiscal_recipient_refresh_readiness()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  NEW.nfe_readiness_pendencies := public.fn_fiscal_recipient_pendencies_row(NEW);
  NEW.nfe_readiness_status := CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.nfe_readiness_pendencies) e WHERE e->>'severity'='BLOCK') THEN 'NOT_READY'
    WHEN jsonb_array_length(NEW.nfe_readiness_pendencies) > 0 THEN 'PARTIAL'
    ELSE 'READY' END;
  NEW.nfe_readiness_checked_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fiscal_recipient_readiness ON public.customer_fiscal_profiles;
CREATE TRIGGER trg_fiscal_recipient_readiness
  BEFORE INSERT OR UPDATE ON public.customer_fiscal_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_recipient_refresh_readiness();

-- =====================================================================
-- SEÇÃO 5 — OPERAÇÃO / CFOP (evolução de fiscal_operation_policies)
-- =====================================================================

ALTER TABLE public.fiscal_operation_policies
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS fin_nfe smallint,
  ADD COLUMN IF NOT EXISTS nature_operation text,
  ADD COLUMN IF NOT EXISTS presence_indicator smallint,
  ADD COLUMN IF NOT EXISTS final_consumer boolean,
  ADD COLUMN IF NOT EXISTS taxpayer_indicator text,
  ADD COLUMN IF NOT EXISTS origin_uf text,
  ADD COLUMN IF NOT EXISTS destination_uf text,
  ADD COLUMN IF NOT EXISTS cfop text,
  ADD COLUMN IF NOT EXISTS crt text,
  ADD COLUMN IF NOT EXISTS ncm_prefix text,
  ADD COLUMN IF NOT EXISTS product_category text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.fiscal_official_sources(id),
  ADD COLUMN IF NOT EXISTS legal_version text,
  ADD COLUMN IF NOT EXISTS policy_status text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid,
  ADD COLUMN IF NOT EXISTS prepared_by uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fop_direction_domain') THEN
    ALTER TABLE public.fiscal_operation_policies ADD CONSTRAINT fop_direction_domain
      CHECK (direction IS NULL OR direction IN ('IN','OUT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fop_cfop_format') THEN
    ALTER TABLE public.fiscal_operation_policies ADD CONSTRAINT fop_cfop_format
      CHECK (cfop IS NULL OR cfop ~ '^[1-7][0-9]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fop_crt_domain') THEN
    ALTER TABLE public.fiscal_operation_policies ADD CONSTRAINT fop_crt_domain
      CHECK (crt IS NULL OR crt IN ('1','2','3','4'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fop_ufs_domain') THEN
    ALTER TABLE public.fiscal_operation_policies ADD CONSTRAINT fop_ufs_domain
      CHECK ((origin_uf IS NULL OR public.fn_fiscal_uf_ibge_code(origin_uf) IS NOT NULL)
         AND (destination_uf IS NULL OR destination_uf = 'EX' OR public.fn_fiscal_uf_ibge_code(destination_uf) IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fop_status_domain') THEN
    ALTER TABLE public.fiscal_operation_policies ADD CONSTRAINT fop_status_domain
      CHECK (policy_status IN ('DRAFT','PUBLISHED','SUPERSEDED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fop_published_requires_evidence') THEN
    ALTER TABLE public.fiscal_operation_policies ADD CONSTRAINT fop_published_requires_evidence
      CHECK (policy_status <> 'PUBLISHED' OR (
        cfop IS NOT NULL AND nature_operation IS NOT NULL AND direction IS NOT NULL
        AND document_model = '55' AND source_id IS NOT NULL
        AND nullif(btrim(coalesce(legal_basis,'')),'') IS NOT NULL
        AND published_at IS NOT NULL AND published_by IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fop_fin_nfe_domain') THEN
    ALTER TABLE public.fiscal_operation_policies ADD CONSTRAINT fop_fin_nfe_domain
      CHECK (fin_nfe IS NULL OR fin_nfe BETWEEN 1 AND 4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fop_presence_domain') THEN
    ALTER TABLE public.fiscal_operation_policies ADD CONSTRAINT fop_presence_domain
      CHECK (presence_indicator IS NULL OR presence_indicator BETWEEN 0 AND 9);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_fop_resolution
  ON public.fiscal_operation_policies (document_model, direction, origin_uf, destination_uf, priority)
  WHERE policy_status = 'PUBLISHED';

-- Imutabilidade de políticas publicadas.
CREATE OR REPLACE FUNCTION public.tg_fiscal_operation_policy_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.policy_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'FISCAL_POLICY_IMMUTABLE: politica publicada nao pode ser excluida (id=%)', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.policy_status = 'PUBLISHED' AND NEW.policy_status = 'PUBLISHED' THEN
    IF (OLD.cfop, OLD.nature_operation, OLD.direction, OLD.origin_uf, OLD.destination_uf,
        OLD.crt, OLD.ncm_prefix, OLD.final_consumer, OLD.taxpayer_indicator,
        OLD.valid_from, OLD.valid_until, OLD.source_id, OLD.legal_basis)
       IS DISTINCT FROM
       (NEW.cfop, NEW.nature_operation, NEW.direction, NEW.origin_uf, NEW.destination_uf,
        NEW.crt, NEW.ncm_prefix, NEW.final_consumer, NEW.taxpayer_indicator,
        NEW.valid_from, NEW.valid_until, NEW.source_id, NEW.legal_basis) THEN
      RAISE EXCEPTION 'FISCAL_POLICY_IMMUTABLE: politica publicada e imutavel; crie nova vigencia (id=%)', OLD.id;
    END IF;
  END IF;
  IF OLD.policy_status = 'PUBLISHED' AND NEW.policy_status = 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_POLICY_IMMUTABLE: politica publicada nao retorna a DRAFT (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fiscal_operation_policy_immutable ON public.fiscal_operation_policies;
CREATE TRIGGER trg_fiscal_operation_policy_immutable
  BEFORE UPDATE OR DELETE ON public.fiscal_operation_policies
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_operation_policy_immutable();

-- Resolução determinística de operação/CFOP. Sem regra => bloqueio.
CREATE OR REPLACE FUNCTION public.fn_fiscal_resolve_operation(
  _direction text, _origin_uf text, _destination_uf text, _crt text,
  _final_consumer boolean, _taxpayer_indicator text, _ncm text,
  _product_category text, _sales_channel text, _ref_date date DEFAULT current_date)
RETURNS public.fiscal_operation_policies
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE p public.fiscal_operation_policies%ROWTYPE;
BEGIN
  SELECT * INTO p
  FROM public.fiscal_operation_policies f
  WHERE f.policy_status = 'PUBLISHED'
    AND f.document_model = '55'
    AND f.active IS TRUE
    AND f.direction = _direction
    AND (f.origin_uf IS NULL OR f.origin_uf = upper(_origin_uf))
    AND (f.destination_uf IS NULL OR f.destination_uf = upper(_destination_uf))
    AND (f.crt IS NULL OR f.crt = _crt)
    AND (f.final_consumer IS NULL OR f.final_consumer = _final_consumer)
    AND (f.taxpayer_indicator IS NULL OR f.taxpayer_indicator = _taxpayer_indicator)
    AND (f.ncm_prefix IS NULL OR public.fn_fiscal_digits(_ncm) LIKE f.ncm_prefix || '%')
    AND (f.product_category IS NULL OR f.product_category = _product_category)
    AND (f.sales_channel IS NULL OR f.sales_channel = _sales_channel)
    AND f.valid_from <= _ref_date
    AND (f.valid_until IS NULL OR f.valid_until >= _ref_date)
  ORDER BY f.priority ASC,
           (f.ncm_prefix IS NOT NULL) DESC,
           (f.destination_uf IS NOT NULL) DESC,
           (f.origin_uf IS NOT NULL) DESC,
           (f.taxpayer_indicator IS NOT NULL) DESC,
           (f.final_consumer IS NOT NULL) DESC,
           f.valid_from DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_OPERATION_POLICY_NOT_FOUND: sem politica publicada para direcao=% origem=% destino=% crt=% consumidorFinal=% indIEDest=% ncm=%',
      _direction, _origin_uf, _destination_uf, _crt, _final_consumer, _taxpayer_indicator, coalesce(_ncm,'-')
      USING HINT = 'Cadastre e publique a politica de operacao com CFOP, natureza, base legal e fonte oficial.';
  END IF;
  RETURN p;
END $$;

-- =====================================================================
-- SEÇÃO 6 — REGRAS TRIBUTÁRIAS VERSIONADAS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  tax_kind text NOT NULL,
  calc_mode text NOT NULL DEFAULT 'PERCENT',
  crt text,
  origin_uf text,
  destination_uf text,
  ncm_prefix text,
  product_category text,
  final_consumer boolean,
  taxpayer_indicator text,
  cst text,
  csosn text,
  rate numeric(9,4),
  base_reduction_pct numeric(9,4),
  deferral_pct numeric(9,4),
  mva_pct numeric(9,4),
  fcp_rate numeric(9,4),
  difal_dest_share_pct numeric(9,4),
  legal_basis text,
  legal_version text,
  source_id uuid REFERENCES public.fiscal_official_sources(id),
  justification text,
  priority integer NOT NULL DEFAULT 100,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  status text NOT NULL DEFAULT 'DRAFT',
  prepared_by uuid,
  published_by uuid,
  published_at timestamptz,
  superseded_by uuid REFERENCES public.fiscal_tax_rules(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT ftr_rule_version_unique UNIQUE (rule_key, version),
  CONSTRAINT ftr_tax_kind_domain CHECK (tax_kind IN ('ICMS','ICMS_ST','FCP','DIFAL','PIS','COFINS','IPI','IBS','CBS','IS')),
  CONSTRAINT ftr_calc_mode_domain CHECK (calc_mode IN ('PERCENT','EXEMPT_DOCUMENTED','NOT_TAXED_DOCUMENTED','SUSPENDED_DOCUMENTED','DEFERRED_DOCUMENTED')),
  CONSTRAINT ftr_status_domain CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  CONSTRAINT ftr_crt_domain CHECK (crt IS NULL OR crt IN ('1','2','3','4')),
  CONSTRAINT ftr_ufs_domain CHECK ((origin_uf IS NULL OR public.fn_fiscal_uf_ibge_code(origin_uf) IS NOT NULL)
                               AND (destination_uf IS NULL OR destination_uf='EX' OR public.fn_fiscal_uf_ibge_code(destination_uf) IS NOT NULL)),
  CONSTRAINT ftr_rate_range CHECK (rate IS NULL OR (rate >= 0 AND rate <= 100)),
  CONSTRAINT ftr_pct_ranges CHECK (
        (base_reduction_pct IS NULL OR (base_reduction_pct >= 0 AND base_reduction_pct <= 100))
    AND (deferral_pct IS NULL OR (deferral_pct >= 0 AND deferral_pct <= 100))
    AND (mva_pct IS NULL OR mva_pct >= 0)
    AND (fcp_rate IS NULL OR (fcp_rate >= 0 AND fcp_rate <= 100))
    AND (difal_dest_share_pct IS NULL OR (difal_dest_share_pct >= 0 AND difal_dest_share_pct <= 100))),
  CONSTRAINT ftr_cst_csosn_exclusive CHECK (cst IS NULL OR csosn IS NULL),
  CONSTRAINT ftr_published_requires_evidence CHECK (
    status <> 'PUBLISHED' OR (
      source_id IS NOT NULL
      AND nullif(btrim(coalesce(legal_basis,'')),'') IS NOT NULL
      AND published_at IS NOT NULL AND published_by IS NOT NULL
      AND (cst IS NOT NULL OR csosn IS NOT NULL OR tax_kind IN ('IBS','CBS','IS'))
      AND (calc_mode <> 'PERCENT' OR rate IS NOT NULL)
      AND (calc_mode = 'PERCENT' OR length(btrim(coalesce(justification,''))) >= 20))),
  CONSTRAINT ftr_validity CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS ix_ftr_resolution
  ON public.fiscal_tax_rules (tax_kind, origin_uf, destination_uf, priority)
  WHERE status = 'PUBLISHED';

CREATE OR REPLACE FUNCTION public.tg_fiscal_tax_rule_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
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
END $$;

DROP TRIGGER IF EXISTS trg_fiscal_tax_rule_immutable ON public.fiscal_tax_rules;
CREATE TRIGGER trg_fiscal_tax_rule_immutable
  BEFORE UPDATE OR DELETE ON public.fiscal_tax_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_tax_rule_immutable();

-- Overrides auditados de segregação de funções (regras fiscais).
CREATE TABLE IF NOT EXISTS public.fiscal_rule_sod_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  target_id uuid NOT NULL,
  justification text NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  consumed_by uuid,
  CONSTRAINT frso_scope_domain CHECK (scope IN ('TAX_RULE','OPERATION_POLICY')),
  CONSTRAINT frso_justification_len CHECK (length(btrim(justification)) >= 40)
);

-- =====================================================================
-- SEÇÃO 7 — SÉRIES E NUMERAÇÃO
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_document_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.company_fiscal_settings(id) ON DELETE RESTRICT,
  document_model text NOT NULL DEFAULT '55',
  series integer NOT NULL,
  environment_code text NOT NULL,
  current_number integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT fds_model_domain CHECK (document_model = '55'),
  CONSTRAINT fds_series_range CHECK (series BETWEEN 1 AND 999),
  CONSTRAINT fds_env_domain CHECK (environment_code IN ('1','2')),
  CONSTRAINT fds_status_domain CHECK (status IN ('ACTIVE','BLOCKED')),
  CONSTRAINT fds_current_number_range CHECK (current_number BETWEEN 0 AND 999999999),
  CONSTRAINT fds_unique UNIQUE (company_id, document_model, series, environment_code)
);

CREATE TABLE IF NOT EXISTS public.fiscal_number_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES public.fiscal_document_series(id) ON DELETE RESTRICT,
  number integer NOT NULL,
  cnf text NOT NULL,
  access_key text NOT NULL,
  check_digit smallint NOT NULL,
  status text NOT NULL DEFAULT 'RESERVED',
  fiscal_invoice_id uuid REFERENCES public.fiscal_invoices(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  reserved_by uuid,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  release_reason text,
  CONSTRAINT fnr_status_domain CHECK (status IN ('RESERVED','CONSUMED','CANCELED','INUTILIZED')),
  CONSTRAINT fnr_number_range CHECK (number BETWEEN 1 AND 999999999),
  CONSTRAINT fnr_cnf_format CHECK (cnf ~ '^[0-9]{8}$'),
  CONSTRAINT fnr_access_key_format CHECK (access_key ~ '^[0-9]{44}$'),
  CONSTRAINT fnr_unique_number UNIQUE (series_id, number),
  CONSTRAINT fnr_unique_idempotency UNIQUE (idempotency_key),
  CONSTRAINT fnr_unique_access_key UNIQUE (access_key)
);

CREATE INDEX IF NOT EXISTS ix_fnr_invoice ON public.fiscal_number_reservations (fiscal_invoice_id);

-- Uma NF-e por escopo fiscal (pedido/entrega/faturamento).
CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_invoice_scope_nfe
  ON public.fiscal_invoices (source_type, source_id, billing_scope)
  WHERE document_model = 'NFE' AND source_id IS NOT NULL AND status <> 'CANCELED';

-- =====================================================================
-- SEÇÃO 8 — ELEGIBILIDADE DO DOCUMENTO
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_fiscal_invoice_eligibility(_source_type text, _source_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE reasons jsonb := '[]'::jsonb; st text; canceled boolean := false;
BEGIN
  IF _source_type IS NULL OR _source_id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reasons',
      jsonb_build_array(jsonb_build_object('code','FISCAL_SOURCE_MISSING','message','Origem fiscal (pedido/entrega) obrigatoria.')));
  END IF;

  IF _source_type = 'PARTNER_ORDER' THEN
    SELECT po.status::text INTO st FROM public.partner_orders po WHERE po.id = _source_id;
    IF st IS NULL THEN
      reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_NOT_FOUND','message','Pedido inexistente.');
    ELSIF st IN ('rascunho','em_analise_comercial','solicitado','pendente') THEN
      reasons := reasons || jsonb_build_object('code','FISCAL_QUOTE_ONLY_BLOCKED','message','Pedido ainda em cotacao/analise; emissao bloqueada. Status atual: '||st);
    ELSIF st = 'reprovado' THEN
      reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_REJECTED','message','Pedido reprovado; emissao bloqueada.');
    END IF;
  ELSIF _source_type = 'ENTREGA' THEN
    IF NOT EXISTS (SELECT 1 FROM public.entregas e WHERE e.id = _source_id) THEN
      reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_NOT_FOUND','message','Entrega inexistente.');
    END IF;
  ELSE
    reasons := reasons || jsonb_build_object('code','FISCAL_SOURCE_TYPE_UNSUPPORTED','message','Escopo fiscal nao suportado nesta fase: '||_source_type);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_invoices fi
    WHERE fi.source_type = _source_type AND fi.source_id = _source_id
      AND fi.document_model = 'NFE' AND fi.status = 'CANCELED') INTO canceled;

  RETURN jsonb_build_object('eligible', jsonb_array_length(reasons) = 0, 'reasons', reasons, 'has_canceled_history', canceled);
END $$;

-- =====================================================================
-- SEÇÃO 9 — MOTOR CANÔNICO DE CÁLCULO (server-side, transacional)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_calculation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_invoice_id uuid NOT NULL REFERENCES public.fiscal_invoices(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  engine_version text NOT NULL DEFAULT 'F3.1',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fcr_unique UNIQUE (fiscal_invoice_id, idempotency_key),
  CONSTRAINT fcr_result_object CHECK (jsonb_typeof(result) = 'object'
                                      AND NOT public.fiscal_json_has_sensitive_key(result))
);

-- Resolve uma regra tributária publicada. Sem regra => exceção.
CREATE OR REPLACE FUNCTION public.fn_fiscal_resolve_tax_rule(
  _tax_kind text, _crt text, _origin_uf text, _destination_uf text, _ncm text,
  _product_category text, _final_consumer boolean, _taxpayer_indicator text,
  _ref_date date DEFAULT current_date)
RETURNS public.fiscal_tax_rules
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE r public.fiscal_tax_rules%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.fiscal_tax_rules t
  WHERE t.status = 'PUBLISHED'
    AND t.tax_kind = _tax_kind
    AND (t.crt IS NULL OR t.crt = _crt)
    AND (t.origin_uf IS NULL OR t.origin_uf = upper(_origin_uf))
    AND (t.destination_uf IS NULL OR t.destination_uf = upper(_destination_uf))
    AND (t.ncm_prefix IS NULL OR public.fn_fiscal_digits(_ncm) LIKE t.ncm_prefix || '%')
    AND (t.product_category IS NULL OR t.product_category = _product_category)
    AND (t.final_consumer IS NULL OR t.final_consumer = _final_consumer)
    AND (t.taxpayer_indicator IS NULL OR t.taxpayer_indicator = _taxpayer_indicator)
    AND t.valid_from <= _ref_date
    AND (t.valid_until IS NULL OR t.valid_until >= _ref_date)
  ORDER BY t.priority ASC,
           (t.ncm_prefix IS NOT NULL) DESC,
           (t.destination_uf IS NOT NULL) DESC,
           (t.origin_uf IS NOT NULL) DESC,
           t.valid_from DESC, t.version DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_TAX_RULE_NOT_FOUND: sem regra publicada para tributo=% crt=% origem=% destino=% ncm=%',
      _tax_kind, _crt, _origin_uf, _destination_uf, coalesce(_ncm,'-')
      USING HINT = 'Cadastre a regra com CST/CSOSN, aliquota ou modo documentado, base legal e fonte oficial, e publique-a. Ausencia de regra nunca e tratada como isencao.';
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_apply_tax(
  r public.fiscal_tax_rules, _base numeric)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE base_eff numeric; val numeric;
BEGIN
  base_eff := public.fn_fiscal_round(_base * (1 - coalesce(r.base_reduction_pct,0)/100));
  IF r.calc_mode = 'PERCENT' THEN
    val := public.fn_fiscal_round(base_eff * coalesce(r.rate,0) / 100);
    IF coalesce(r.deferral_pct,0) > 0 THEN
      val := public.fn_fiscal_round(val * (1 - r.deferral_pct/100));
    END IF;
  ELSE
    base_eff := 0; val := 0;
  END IF;
  RETURN jsonb_build_object(
    'taxKind', r.tax_kind, 'calcMode', r.calc_mode,
    'ruleId', r.id, 'ruleKey', r.rule_key, 'ruleVersion', r.version,
    'sourceId', r.source_id, 'legalBasis', r.legal_basis, 'legalVersion', r.legal_version,
    'justification', r.justification,
    'cst', r.cst, 'csosn', r.csosn,
    'rate', r.rate, 'baseReductionPct', r.base_reduction_pct, 'deferralPct', r.deferral_pct,
    'mvaPct', r.mva_pct, 'fcpRate', r.fcp_rate, 'difalDestSharePct', r.difal_dest_share_pct,
    'baseOriginal', public.fn_fiscal_round(_base), 'base', base_eff, 'value', val);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_calculate_invoice_v1(
  p_invoice_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  it record; pol public.fiscal_operation_policies%ROWTYPE; rule public.fiscal_tax_rules%ROWTYPE;
  item_taxes jsonb; item_snapshot jsonb; base numeric;
  totals jsonb := '{}'::jsonb; existing jsonb;
  t_icms numeric := 0; t_st numeric := 0; t_fcp numeric := 0; t_difal numeric := 0;
  t_pis numeric := 0; t_cofins numeric := 0; t_ipi numeric := 0;
  t_prod numeric := 0; t_desc numeric := 0; t_frete numeric := 0; t_seg numeric := 0; t_outros numeric := 0;
  t_nf numeric := 0; n_items int := 0; ref_date date; kinds text[]; k text;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() AND NOT public.has_role(auth.uid(),'financeiro'::app_role) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para calcular documento fiscal.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;

  SELECT result INTO existing FROM public.fiscal_calculation_runs
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF existing IS NOT NULL THEN
    RETURN existing || jsonb_build_object('idempotentReplay', true);
  END IF;

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;
  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: somente rascunho pode ser calculado (status=%)', inv.status;
  END IF;
  IF inv.document_model <> 'NFE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: fase F3 cobre apenas NF-e modelo 55.';
  END IF;
  IF inv.tax_snapshot IS NOT NULL AND inv.tax_snapshot ? 'engineVersion' THEN
    RAISE EXCEPTION 'FISCAL_SNAPSHOT_IMMUTABLE: documento ja possui snapshot tributario; historico nao recalcula.';
  END IF;

  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %', (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'reasons';
  END IF;

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF emit.nfe_readiness_status NOT IN ('READY_HOMOLOGATION','READY_PRODUCTION') THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_READY: emitente com pendencias %', emit.nfe_readiness_pendencies;
  END IF;

  IF inv.customer_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_RECIPIENT_MISSING: destinatario/devedor nao resolvido para o documento.';
  END IF;
  SELECT * INTO dest FROM public.customer_fiscal_profiles WHERE customer_id = inv.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECIPIENT_PROFILE_MISSING: perfil fiscal do destinatario nao cadastrado.'; END IF;
  IF dest.nfe_readiness_status <> 'READY' THEN
    RAISE EXCEPTION 'FISCAL_RECIPIENT_NOT_READY: destinatario com pendencias %', dest.nfe_readiness_pendencies;
  END IF;

  ref_date := coalesce(inv.issue_date, current_date);

  FOR it IN
    SELECT * FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id ORDER BY item_sequence
  LOOP
    n_items := n_items + 1;
    IF coalesce(it.quantity,0) <= 0 OR coalesce(it.unit_value,0) < 0 THEN
      RAISE EXCEPTION 'FISCAL_ITEM_INVALID: item % com quantidade ou valor unitario invalido.', it.item_sequence;
    END IF;
    IF nullif(btrim(coalesce(it.ncm_snapshot,'')),'') IS NULL THEN
      RAISE EXCEPTION 'FISCAL_ITEM_NCM_MISSING: item % sem NCM no snapshot do pedido.', it.item_sequence;
    END IF;

    base := public.fn_fiscal_round(coalesce(it.gross_value, it.quantity * it.unit_value)
            - coalesce(it.discount_value,0) + coalesce(it.freight_value,0)
            + coalesce(it.insurance_value,0) + coalesce(it.other_value,0));
    IF base < 0 THEN
      RAISE EXCEPTION 'FISCAL_ITEM_BASE_NEGATIVE: item % com base negativa apos descontos.', it.item_sequence;
    END IF;

    pol := public.fn_fiscal_resolve_operation(
      coalesce(inv.direction,'OUT'), emit.state, coalesce(dest.fiscal_state, emit.state), emit.crt,
      dest.final_consumer, dest.taxpayer_indicator, it.ncm_snapshot, null, inv.sales_channel, ref_date);

    kinds := ARRAY['ICMS','PIS','COFINS'];
    IF coalesce(emit.ipi_taxpayer,false) THEN kinds := kinds || 'IPI'::text; END IF;
    IF coalesce(emit.icms_st_responsible,false) THEN kinds := kinds || 'ICMS_ST'::text; END IF;
    IF coalesce(emit.fcp_applicable,false) THEN kinds := kinds || 'FCP'::text; END IF;
    IF coalesce(emit.difal_responsible,false)
       AND upper(coalesce(dest.fiscal_state,'')) <> upper(coalesce(emit.state,''))
       AND coalesce(dest.final_consumer,true) THEN
      kinds := kinds || 'DIFAL'::text;
    END IF;
    IF coalesce(emit.rtc_scaffolding_enabled,false) THEN kinds := kinds || ARRAY['IBS','CBS']; END IF;

    item_taxes := '{}'::jsonb;
    FOREACH k IN ARRAY kinds LOOP
      rule := public.fn_fiscal_resolve_tax_rule(k, emit.crt, emit.state, coalesce(dest.fiscal_state, emit.state),
                                                it.ncm_snapshot, null, dest.final_consumer, dest.taxpayer_indicator, ref_date);
      item_taxes := item_taxes || jsonb_build_object(k, public.fn_fiscal_apply_tax(rule, base));
    END LOOP;

    t_prod   := t_prod + public.fn_fiscal_round(coalesce(it.gross_value, it.quantity * it.unit_value));
    t_desc   := t_desc + public.fn_fiscal_round(coalesce(it.discount_value,0));
    t_frete  := t_frete + public.fn_fiscal_round(coalesce(it.freight_value,0));
    t_seg    := t_seg + public.fn_fiscal_round(coalesce(it.insurance_value,0));
    t_outros := t_outros + public.fn_fiscal_round(coalesce(it.other_value,0));
    t_icms   := t_icms   + coalesce((item_taxes->'ICMS'->>'value')::numeric,0);
    t_st     := t_st     + coalesce((item_taxes->'ICMS_ST'->>'value')::numeric,0);
    t_fcp    := t_fcp    + coalesce((item_taxes->'FCP'->>'value')::numeric,0);
    t_difal  := t_difal  + coalesce((item_taxes->'DIFAL'->>'value')::numeric,0);
    t_pis    := t_pis    + coalesce((item_taxes->'PIS'->>'value')::numeric,0);
    t_cofins := t_cofins + coalesce((item_taxes->'COFINS'->>'value')::numeric,0);
    t_ipi    := t_ipi    + coalesce((item_taxes->'IPI'->>'value')::numeric,0);

    item_snapshot := jsonb_build_object(
      'engineVersion','F3.1',
      'calculatedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
      'ncm', it.ncm_snapshot,
      'cfop', pol.cfop,
      'natureOperation', pol.nature_operation,
      'operationPolicyId', pol.id,
      'operationLegalBasis', pol.legal_basis,
      'operationSourceId', pol.source_id,
      'base', base,
      'taxes', item_taxes);

    UPDATE public.fiscal_invoice_items
       SET tax_snapshot = item_snapshot,
           cfop_snapshot = pol.cfop,
           cst_icms_snapshot = item_taxes->'ICMS'->>'cst',
           csosn_snapshot = item_taxes->'ICMS'->>'csosn',
           net_value = base,
           updated_at = now()
     WHERE id = it.id;
  END LOOP;

  IF n_items = 0 THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NO_ITEMS: documento sem itens.';
  END IF;

  t_nf := public.fn_fiscal_round(t_prod - t_desc + t_frete + t_seg + t_outros + t_st + t_ipi);

  IF inv.total_amount IS NOT NULL AND abs(inv.total_amount - t_nf) > 0.01 THEN
    RAISE EXCEPTION 'FISCAL_TOTAL_MISMATCH: total informado % difere do total calculado %', inv.total_amount, t_nf;
  END IF;

  totals := jsonb_build_object(
    'engineVersion','F3.1',
    'itemCount', n_items,
    'vProd', public.fn_fiscal_round(t_prod), 'vDesc', public.fn_fiscal_round(t_desc),
    'vFrete', public.fn_fiscal_round(t_frete), 'vSeg', public.fn_fiscal_round(t_seg),
    'vOutro', public.fn_fiscal_round(t_outros),
    'vICMS', public.fn_fiscal_round(t_icms), 'vST', public.fn_fiscal_round(t_st),
    'vFCP', public.fn_fiscal_round(t_fcp), 'vDIFAL', public.fn_fiscal_round(t_difal),
    'vPIS', public.fn_fiscal_round(t_pis), 'vCOFINS', public.fn_fiscal_round(t_cofins),
    'vIPI', public.fn_fiscal_round(t_ipi), 'vNF', t_nf);

  UPDATE public.fiscal_invoices
     SET tax_snapshot = totals,
         fiscal_totals_snapshot = totals,
         total_amount = t_nf,
         company_snapshot = jsonb_build_object(
           'cnpj', emit.cnpj, 'legalName', emit.legal_name, 'crt', emit.crt,
           'ie', emit.state_registration, 'uf', emit.state,
           'municipalityIbge', emit.municipality_ibge_code,
           'series', emit.nfe_series_number, 'environment', emit.nfe_environment_code),
         customer_snapshot = jsonb_build_object(
           'document', dest.cpf_cnpj, 'legalName', dest.legal_name,
           'indIEDest', dest.taxpayer_indicator, 'uf', dest.fiscal_state,
           'municipalityIbge', dest.fiscal_municipality_ibge_code,
           'finalConsumer', dest.final_consumer, 'icmsTaxpayer', dest.icms_taxpayer),
         updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.fiscal_calculation_runs (fiscal_invoice_id, idempotency_key, result, created_by)
  VALUES (p_invoice_id, p_idempotency_key, totals, auth.uid());

  RETURN totals || jsonb_build_object('idempotentReplay', false);
END $$;

-- =====================================================================
-- SEÇÃO 10 — RESERVA DE NUMERAÇÃO (apenas DRAFT nesta fase)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_fiscal_reserve_nfe_number_v1(
  p_invoice_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  s public.fiscal_document_series%ROWTYPE;
  existing public.fiscal_number_reservations%ROWTYPE;
  n int; cnf text; key43 text; dv int; full_key text; cuf text;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() AND NOT public.has_role(auth.uid(),'financeiro'::app_role) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para reservar numeracao.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;

  SELECT * INTO existing FROM public.fiscal_number_reservations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('reservationId', existing.id, 'number', existing.number,
      'accessKey', existing.access_key, 'status', existing.status, 'idempotentReplay', true);
  END IF;

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;
  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: reserva permitida apenas em rascunho (status=%)', inv.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fiscal_number_reservations r
             WHERE r.fiscal_invoice_id = p_invoice_id AND r.status = 'RESERVED') THEN
    RAISE EXCEPTION 'FISCAL_NUMBER_ALREADY_RESERVED: documento ja possui reserva ativa.';
  END IF;
  IF inv.tax_snapshot IS NULL OR NOT (inv.tax_snapshot ? 'engineVersion') THEN
    RAISE EXCEPTION 'FISCAL_CALCULATION_REQUIRED: calcule os tributos antes de reservar numeracao.';
  END IF;

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF emit.nfe_readiness_status NOT IN ('READY_HOMOLOGATION','READY_PRODUCTION') THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_READY: emitente com pendencias %', emit.nfe_readiness_pendencies;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('fiscal_series:' || emit.id::text || ':' ||
          coalesce(emit.nfe_series_number,0)::text || ':' || coalesce(emit.nfe_environment_code,'2')));

  SELECT * INTO s FROM public.fiscal_document_series
   WHERE company_id = emit.id AND document_model = '55'
     AND series = emit.nfe_series_number AND environment_code = emit.nfe_environment_code
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.fiscal_document_series (company_id, series, environment_code, created_by)
    VALUES (emit.id, emit.nfe_series_number, emit.nfe_environment_code, auth.uid())
    RETURNING * INTO s;
  END IF;
  IF s.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FISCAL_SERIES_BLOCKED: serie % bloqueada.', s.series;
  END IF;

  n := s.current_number + 1;
  IF n > 999999999 THEN RAISE EXCEPTION 'FISCAL_SERIES_EXHAUSTED: serie % esgotada.', s.series; END IF;

  cnf := lpad(((get_byte(gen_random_bytes(4),0)::bigint << 24)
             | (get_byte(gen_random_bytes(4),0)::bigint << 16)
             | (get_byte(gen_random_bytes(4),0)::bigint << 8)
             | get_byte(gen_random_bytes(4),0)::bigint) % 100000000, 8, '0');

  cuf := public.fn_fiscal_uf_ibge_code(emit.state);
  key43 := cuf
        || to_char(coalesce(inv.issue_date, current_date), 'YYMM')
        || public.fn_fiscal_digits(emit.cnpj)
        || '55'
        || lpad(s.series::text, 3, '0')
        || lpad(n::text, 9, '0')
        || '1'
        || cnf;
  dv := public.fn_fiscal_access_key_dv(key43);
  full_key := key43 || dv::text;

  UPDATE public.fiscal_document_series SET current_number = n, updated_at = now() WHERE id = s.id;

  INSERT INTO public.fiscal_number_reservations
    (series_id, number, cnf, access_key, check_digit, status, fiscal_invoice_id, idempotency_key, reserved_by)
  VALUES (s.id, n, cnf, full_key, dv, 'RESERVED', p_invoice_id, p_idempotency_key, auth.uid());

  UPDATE public.fiscal_invoices
     SET series = s.series::text, invoice_number = n::text, access_key = full_key, updated_at = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('number', n, 'series', s.series, 'accessKey', full_key,
                            'checkDigit', dv, 'status','RESERVED', 'idempotentReplay', false);
END $$;

-- =====================================================================
-- SEÇÃO 11 — PUBLICAÇÃO COM SEGREGAÇÃO DE FUNÇÕES
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_fiscal_tax_rule_publish(
  p_rule_id uuid, p_justification text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE r public.fiscal_tax_rules%ROWTYPE; ov public.fiscal_rule_sod_overrides%ROWTYPE;
BEGIN
  IF NOT public.fn_regulatory_can_approve('FISCAL') THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para publicar regra tributaria.';
  END IF;
  SELECT * INTO r FROM public.fiscal_tax_rules WHERE id = p_rule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_TAX_RULE_NOT_FOUND: %', p_rule_id; END IF;
  IF r.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_TAX_RULE_NOT_DRAFT: apenas rascunho pode ser publicado (status=%)', r.status;
  END IF;
  IF r.source_id IS NULL OR nullif(btrim(coalesce(r.legal_basis,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_TAX_RULE_SOURCE_REQUIRED: fonte oficial e base legal obrigatorias.';
  END IF;

  IF r.prepared_by IS NOT NULL AND r.prepared_by = auth.uid() THEN
    SELECT * INTO ov FROM public.fiscal_rule_sod_overrides
     WHERE scope = 'TAX_RULE' AND target_id = r.id AND consumed_at IS NULL
     ORDER BY granted_at DESC LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FISCAL_SEGREGATION_OF_DUTIES: quem preparou a regra nao pode publica-la. Solicite aprovacao de outro responsavel ou override auditado de administrador.';
    END IF;
    UPDATE public.fiscal_rule_sod_overrides SET consumed_at = now(), consumed_by = auth.uid() WHERE id = ov.id;
  END IF;

  UPDATE public.fiscal_tax_rules
     SET status = 'PUBLISHED', published_by = auth.uid(), published_at = now(),
         justification = coalesce(nullif(btrim(coalesce(p_justification,'')),''), justification),
         updated_by = auth.uid(), updated_at = now()
   WHERE id = p_rule_id;

  UPDATE public.fiscal_tax_rules
     SET status = 'SUPERSEDED', superseded_by = p_rule_id, updated_at = now()
   WHERE rule_key = r.rule_key AND id <> p_rule_id AND status = 'PUBLISHED';

  RETURN jsonb_build_object('ruleId', p_rule_id, 'ruleKey', r.rule_key, 'version', r.version, 'status','PUBLISHED');
END $$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_operation_policy_publish(
  p_policy_id uuid, p_justification text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE p public.fiscal_operation_policies%ROWTYPE; ov public.fiscal_rule_sod_overrides%ROWTYPE;
BEGIN
  IF NOT public.fn_regulatory_can_approve('FISCAL') THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para publicar politica de operacao.';
  END IF;
  SELECT * INTO p FROM public.fiscal_operation_policies WHERE id = p_policy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_OPERATION_POLICY_NOT_FOUND: %', p_policy_id; END IF;
  IF p.policy_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_OPERATION_POLICY_NOT_DRAFT: apenas rascunho pode ser publicado (status=%)', p.policy_status;
  END IF;
  IF p.cfop IS NULL OR p.nature_operation IS NULL OR p.direction IS NULL
     OR p.source_id IS NULL OR nullif(btrim(coalesce(p.legal_basis,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_OPERATION_POLICY_INCOMPLETE: CFOP, natureza, sentido, base legal e fonte oficial sao obrigatorios.';
  END IF;
  IF p.prepared_by IS NOT NULL AND p.prepared_by = auth.uid() THEN
    SELECT * INTO ov FROM public.fiscal_rule_sod_overrides
     WHERE scope = 'OPERATION_POLICY' AND target_id = p.id AND consumed_at IS NULL
     ORDER BY granted_at DESC LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FISCAL_SEGREGATION_OF_DUTIES: quem preparou a politica nao pode publica-la.';
    END IF;
    UPDATE public.fiscal_rule_sod_overrides SET consumed_at = now(), consumed_by = auth.uid() WHERE id = ov.id;
  END IF;

  UPDATE public.fiscal_operation_policies
     SET policy_status = 'PUBLISHED', published_by = auth.uid(), published_at = now(),
         document_model = '55', notes = coalesce(nullif(btrim(coalesce(p_justification,'')),''), notes),
         updated_by = auth.uid(), updated_at = now()
   WHERE id = p_policy_id;

  RETURN jsonb_build_object('policyId', p_policy_id, 'status','PUBLISHED', 'cfop', p.cfop);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_rule_sod_override(
  p_scope text, p_target_id uuid, p_justification text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador'::app_role) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: somente administrador concede override de segregacao.';
  END IF;
  IF p_scope NOT IN ('TAX_RULE','OPERATION_POLICY') THEN
    RAISE EXCEPTION 'FISCAL_SOD_SCOPE_INVALID: %', p_scope;
  END IF;
  IF length(btrim(coalesce(p_justification,''))) < 40 THEN
    RAISE EXCEPTION 'FISCAL_SOD_JUSTIFICATION_REQUIRED: justificativa com pelo menos 40 caracteres.';
  END IF;
  INSERT INTO public.fiscal_rule_sod_overrides (scope, target_id, justification, granted_by)
  VALUES (p_scope, p_target_id, btrim(p_justification), auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('overrideId', v_id, 'scope', p_scope, 'targetId', p_target_id);
END $$;

-- =====================================================================
-- SEÇÃO 12 — PRONTIDÃO AGREGADA PARA NF-e
-- =====================================================================

CREATE OR REPLACE VIEW public.v_fiscal_nfe_emitter_readiness AS
SELECT id, cnpj IS NOT NULL AS has_cnpj, crt, state, nfe_series_number, nfe_environment_code,
       nfe_readiness_status, nfe_readiness_pendencies, nfe_readiness_checked_at,
       certificate_ref IS NOT NULL AS has_certificate,
       accounting_validated_at IS NOT NULL AS accounting_validated
FROM public.company_fiscal_settings
WHERE is_active = true;

CREATE OR REPLACE VIEW public.v_fiscal_nfe_recipient_readiness AS
SELECT id, customer_id, person_type, fiscal_state, taxpayer_indicator, final_consumer,
       icms_taxpayer, nfe_readiness_status, nfe_readiness_pendencies, nfe_readiness_checked_at
FROM public.customer_fiscal_profiles;

CREATE OR REPLACE VIEW public.v_fiscal_nfe_rule_coverage AS
SELECT tax_kind,
       count(*) FILTER (WHERE status='PUBLISHED') AS published_rules,
       count(*) FILTER (WHERE status='DRAFT') AS draft_rules,
       count(*) FILTER (WHERE status='SUPERSEDED') AS superseded_rules
FROM public.fiscal_tax_rules
GROUP BY tax_kind;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_nfe_readiness_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  emit public.company_fiscal_settings%ROWTYPE;
  rec_total int; rec_ready int; pol_pub int; rules_pub int; series_cnt int;
  cert_ok boolean; pend jsonb := '[]'::jsonb; kinds_missing text[] := ARRAY[]::text[]; k text;
BEGIN
  IF NOT public.fn_regulatory_can_read() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao de leitura fiscal.';
  END IF;

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  SELECT count(*), count(*) FILTER (WHERE nfe_readiness_status = 'READY')
    INTO rec_total, rec_ready FROM public.customer_fiscal_profiles;
  SELECT count(*) INTO pol_pub FROM public.fiscal_operation_policies
   WHERE policy_status = 'PUBLISHED' AND document_model = '55';
  SELECT count(*) INTO rules_pub FROM public.fiscal_tax_rules WHERE status = 'PUBLISHED';
  SELECT count(*) INTO series_cnt FROM public.fiscal_document_series WHERE status = 'ACTIVE';
  cert_ok := emit.certificate_ref IS NOT NULL;

  FOREACH k IN ARRAY ARRAY['ICMS','PIS','COFINS'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fiscal_tax_rules WHERE status='PUBLISHED' AND tax_kind = k) THEN
      kinds_missing := kinds_missing || k;
    END IF;
  END LOOP;

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
  IF array_length(kinds_missing,1) IS NOT NULL THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','TAX_RULES_MISSING','severity','BLOCK',
      'message','Tributos sem regra publicada: '||array_to_string(kinds_missing,', '));
  END IF;
  IF NOT cert_ok THEN
    pend := pend || jsonb_build_object('section','CERTIFICADO','code','CERTIFICATE_MISSING','severity','BLOCK','message','Certificado digital nao vinculado.');
  END IF;
  IF series_cnt = 0 THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','SERIES_NOT_INITIALIZED','severity','WARN','message','Nenhuma serie de numeracao inicializada; sera criada na primeira reserva.');
  END IF;

  RETURN jsonb_build_object(
    'generatedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
    'documentModel','55',
    'emitter', jsonb_build_object(
      'configured', emit.id IS NOT NULL,
      'status', coalesce(emit.nfe_readiness_status,'NOT_READY'),
      'crt', emit.crt, 'uf', emit.state,
      'series', emit.nfe_series_number, 'environment', emit.nfe_environment_code,
      'certificateLinked', cert_ok,
      'accountingValidated', emit.accounting_validated_at IS NOT NULL),
    'recipients', jsonb_build_object('total', rec_total, 'ready', rec_ready),
    'operations', jsonb_build_object('publishedPolicies', pol_pub),
    'taxes', jsonb_build_object('publishedRules', rules_pub, 'missingMandatoryKinds', to_jsonb(kinds_missing)),
    'numbering', jsonb_build_object('activeSeries', series_cnt),
    'pendencies', pend,
    'overallStatus', CASE
      WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(pend) e WHERE e->>'severity'='BLOCK') THEN 'NOT_READY'
      WHEN jsonb_array_length(pend) > 0 THEN 'PARTIAL'
      ELSE 'READY' END);
END $$;

-- Solicitação/registro de validação contábil com justificativa.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_emitter_request_accounting_review(p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para solicitar validacao contabil.';
  END IF;
  IF length(btrim(coalesce(p_notes,''))) < 20 THEN
    RAISE EXCEPTION 'FISCAL_JUSTIFICATION_REQUIRED: descreva a solicitacao com pelo menos 20 caracteres.';
  END IF;
  UPDATE public.company_fiscal_settings
     SET configuration_status = 'PENDING_ACCOUNTING',
         configuration_notes = btrim(p_notes), updated_by = auth.uid(), updated_at = now()
   WHERE is_active RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  RETURN jsonb_build_object('companyId', v_id, 'status','PENDING_ACCOUNTING');
END $$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_emitter_accounting_validate(p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE r public.company_fiscal_settings%ROWTYPE;
BEGIN
  IF NOT public.fn_regulatory_can_approve('FISCAL') THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: somente responsavel fiscal/contabil valida o emitente.';
  END IF;
  IF length(btrim(coalesce(p_notes,''))) < 20 THEN
    RAISE EXCEPTION 'FISCAL_JUSTIFICATION_REQUIRED: registre a justificativa da validacao (min. 20 caracteres).';
  END IF;
  SELECT * INTO r FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF r.updated_by IS NOT NULL AND r.updated_by = auth.uid() AND r.configuration_status = 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_SEGREGATION_OF_DUTIES: preparador e validador contabil devem ser pessoas distintas.';
  END IF;
  UPDATE public.company_fiscal_settings
     SET configuration_status = 'VALIDATED', accounting_validated_at = now(),
         accounting_validated_by = auth.uid(), configuration_notes = btrim(p_notes), updated_at = now()
   WHERE id = r.id;
  RETURN jsonb_build_object('companyId', r.id, 'status','VALIDATED');
END $$;

-- =====================================================================
-- SEÇÃO 13 — AUDITORIA
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fiscal_audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_actor uuid;
  v_allowed text[] := ARRAY[
    'company_fiscal_settings','product_fiscal_profiles','service_fiscal_profiles',
    'customer_fiscal_profiles','fiscal_invoices','fiscal_invoice_items',
    'fiscal_events','fiscal_idempotency_keys',
    'fiscal_operation_policies','fiscal_tax_rules','fiscal_document_series',
    'fiscal_number_reservations','fiscal_rule_sod_overrides','fiscal_calculation_runs'
  ];
BEGIN
  IF NOT (TG_TABLE_NAME = ANY(v_allowed)) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_actor, public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_actor,
            public.mask_sensitive_jsonb(to_jsonb(OLD)), public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_actor, public.mask_sensitive_jsonb(to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tg_fiscal_tax_rules_audit ON public.fiscal_tax_rules;
CREATE TRIGGER tg_fiscal_tax_rules_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.fiscal_tax_rules
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();

DROP TRIGGER IF EXISTS tg_fiscal_operation_policies_audit ON public.fiscal_operation_policies;
CREATE TRIGGER tg_fiscal_operation_policies_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.fiscal_operation_policies
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();

DROP TRIGGER IF EXISTS tg_fiscal_number_reservations_audit ON public.fiscal_number_reservations;
CREATE TRIGGER tg_fiscal_number_reservations_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.fiscal_number_reservations
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();

DROP TRIGGER IF EXISTS tg_fiscal_document_series_audit ON public.fiscal_document_series;
CREATE TRIGGER tg_fiscal_document_series_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.fiscal_document_series
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger();

-- =====================================================================
-- SEÇÃO 14 — RLS, GRANTS E REVOGAÇÕES
-- =====================================================================

ALTER TABLE public.fiscal_tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_document_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_number_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_rule_sod_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_calculation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ftr_select ON public.fiscal_tax_rules;
CREATE POLICY ftr_select ON public.fiscal_tax_rules FOR SELECT TO authenticated
  USING (public.fn_regulatory_can_read());
DROP POLICY IF EXISTS ftr_insert ON public.fiscal_tax_rules;
CREATE POLICY ftr_insert ON public.fiscal_tax_rules FOR INSERT TO authenticated
  WITH CHECK (public.fn_regulatory_can_prepare() AND status = 'DRAFT');
DROP POLICY IF EXISTS ftr_update ON public.fiscal_tax_rules;
CREATE POLICY ftr_update ON public.fiscal_tax_rules FOR UPDATE TO authenticated
  USING (public.fn_regulatory_can_prepare() AND status = 'DRAFT')
  WITH CHECK (public.fn_regulatory_can_prepare() AND status = 'DRAFT');

DROP POLICY IF EXISTS fds_select ON public.fiscal_document_series;
CREATE POLICY fds_select ON public.fiscal_document_series FOR SELECT TO authenticated
  USING (public.fn_regulatory_can_read());

DROP POLICY IF EXISTS fnr_select ON public.fiscal_number_reservations;
CREATE POLICY fnr_select ON public.fiscal_number_reservations FOR SELECT TO authenticated
  USING (public.fn_regulatory_can_read());

DROP POLICY IF EXISTS frso_select ON public.fiscal_rule_sod_overrides;
CREATE POLICY frso_select ON public.fiscal_rule_sod_overrides FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'::app_role));

DROP POLICY IF EXISTS fcr_select ON public.fiscal_calculation_runs;
CREATE POLICY fcr_select ON public.fiscal_calculation_runs FOR SELECT TO authenticated
  USING (public.fn_regulatory_can_read());

REVOKE ALL ON public.fiscal_tax_rules FROM PUBLIC, anon;
REVOKE ALL ON public.fiscal_document_series FROM PUBLIC, anon;
REVOKE ALL ON public.fiscal_number_reservations FROM PUBLIC, anon;
REVOKE ALL ON public.fiscal_rule_sod_overrides FROM PUBLIC, anon;
REVOKE ALL ON public.fiscal_calculation_runs FROM PUBLIC, anon;
REVOKE ALL ON public.v_fiscal_nfe_emitter_readiness FROM PUBLIC, anon;
REVOKE ALL ON public.v_fiscal_nfe_recipient_readiness FROM PUBLIC, anon;
REVOKE ALL ON public.v_fiscal_nfe_rule_coverage FROM PUBLIC, anon;
REVOKE ALL ON public.company_fiscal_settings FROM anon;
REVOKE ALL ON public.customer_fiscal_profiles FROM anon;
REVOKE ALL ON public.fiscal_operation_policies FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.fiscal_tax_rules TO authenticated;
GRANT SELECT ON public.fiscal_document_series TO authenticated;
GRANT SELECT ON public.fiscal_number_reservations TO authenticated;
GRANT SELECT ON public.fiscal_rule_sod_overrides TO authenticated;
GRANT SELECT ON public.fiscal_calculation_runs TO authenticated;
GRANT SELECT ON public.v_fiscal_nfe_emitter_readiness TO authenticated;
GRANT SELECT ON public.v_fiscal_nfe_recipient_readiness TO authenticated;
GRANT SELECT ON public.v_fiscal_nfe_rule_coverage TO authenticated;
GRANT ALL ON public.fiscal_tax_rules TO service_role;
GRANT ALL ON public.fiscal_document_series TO service_role;
GRANT ALL ON public.fiscal_number_reservations TO service_role;
GRANT ALL ON public.fiscal_rule_sod_overrides TO service_role;
GRANT ALL ON public.fiscal_calculation_runs TO service_role;

DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rpc_fiscal_calculate_invoice_v1','rpc_fiscal_reserve_nfe_number_v1',
        'rpc_fiscal_tax_rule_publish','rpc_fiscal_operation_policy_publish',
        'rpc_fiscal_rule_sod_override','rpc_fiscal_nfe_readiness_v1',
        'rpc_fiscal_emitter_request_accounting_review','rpc_fiscal_emitter_accounting_validate',
        'fn_fiscal_resolve_operation','fn_fiscal_resolve_tax_rule','fn_fiscal_invoice_eligibility',
        'fn_fiscal_emitter_pendencies','fn_fiscal_emitter_pendencies_row','fn_fiscal_emitter_status',
        'fn_fiscal_recipient_pendencies_row','fn_fiscal_apply_tax','fn_fiscal_access_key_dv',
        'fn_fiscal_cnpj_is_valid','fn_fiscal_cpf_is_valid','fn_fiscal_ie_check','fn_fiscal_cep_is_valid',
        'fn_fiscal_uf_ibge_code','fn_fiscal_ibge_municipio_coerente','fn_fiscal_digits','fn_fiscal_round')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_fiscal_calculate_invoice_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_reserve_nfe_number_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_tax_rule_publish(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_operation_policy_publish(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_rule_sod_override(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_nfe_readiness_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_emitter_request_accounting_review(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_emitter_accounting_validate(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_invoice_eligibility(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cnpj_is_valid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cpf_is_valid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ie_check(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_cep_is_valid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_uf_ibge_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_ibge_municipio_coerente(text,text) TO authenticated;

-- =====================================================================
-- FIM DA FASE F3
-- =====================================================================
