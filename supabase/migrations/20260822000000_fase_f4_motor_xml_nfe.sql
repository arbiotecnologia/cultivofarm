-- =====================================================================
-- FASE F4 — Geração, validação XSD e assinatura controlada da NF-e 4.00
-- (modelo 55). Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq.
-- Produção navfzbwgwzruipouyfnk é proibida.
--
-- Arquivo canônico da migration 20260822000000_fase_f4_nfe_xml_motor.sql.
-- Transaction-neutral (sem BEGIN/COMMIT): aplique com --single-transaction.
--
-- Princípios inegociáveis:
--   * Teto absoluto: SIGNED. Nenhum caminho transmite, autoriza ou fala
--     com a SEFAZ. tpAmb=1 (produção) permanece bloqueado (F3.1-R2).
--   * Artefatos imutáveis: execuções append-only; correção nunca
--     sobrescreve — cria nova versão encadeada.
--   * Payload congelado no preparo: o XML é função pura do snapshot.
--   * Nenhum segredo, senha, chave privada ou material de certificado
--     trafega ou é persistido nesta camada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Registro versionado de esquemas XSD oficiais
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_xsd_registry (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_name    text NOT NULL,
  schema_version text NOT NULL,
  document_model text NOT NULL DEFAULT '55',
  root_element   text NOT NULL,
  namespace_uri  text NOT NULL,
  source_url     text NOT NULL,
  legal_basis    text NOT NULL,
  published_at   date NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  CONSTRAINT fiscal_xsd_registry_unique UNIQUE (schema_name, schema_version),
  CONSTRAINT fiscal_xsd_registry_model_chk CHECK (document_model = '55'),
  CONSTRAINT fiscal_xsd_registry_url_chk
    CHECK (public.fn_fiscal_official_url_allowlisted(source_url))
);

COMMENT ON TABLE public.fiscal_xsd_registry IS
  'F4: esquemas XSD oficiais (fonte gov.br) usados na validacao estrutural da NF-e 4.00.';

-- ---------------------------------------------------------------------
-- 2. Execuções de geração/validação/assinatura (append-only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_xml_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_invoice_id   uuid NOT NULL REFERENCES public.fiscal_invoices(id) ON DELETE RESTRICT,
  reservation_id      uuid REFERENCES public.fiscal_number_reservations(id) ON DELETE RESTRICT,
  idempotency_key     text NOT NULL,
  run_version         integer NOT NULL DEFAULT 1,
  previous_run_id     uuid REFERENCES public.fiscal_xml_runs(id) ON DELETE RESTRICT,
  engine_version      text NOT NULL DEFAULT 'F4.1',
  schema_version      text NOT NULL,
  environment_code    text NOT NULL,
  access_key          text NOT NULL,
  state               text NOT NULL DEFAULT 'PREPARED',
  payload             jsonb NOT NULL,
  payload_sha256      text NOT NULL,
  unsigned_sha256     text,
  unsigned_bytes      integer,
  unsigned_path       text,
  signed_sha256       text,
  signed_bytes        integer,
  signed_path         text,
  storage_bucket      text NOT NULL DEFAULT 'fiscal-xml',
  validation          jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_metadata  jsonb NOT NULL DEFAULT '{}'::jsonb,
  certificate_id      uuid,
  error_code          text,
  error_detail        text,
  prepared_at         timestamptz NOT NULL DEFAULT now(),
  generated_at        timestamptz,
  validated_at        timestamptz,
  signed_at           timestamptz,
  failed_at           timestamptz,
  created_by          uuid,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_xml_runs_idem_unique UNIQUE (fiscal_invoice_id, idempotency_key),
  CONSTRAINT fiscal_xml_runs_state_chk CHECK (
    state IN ('PREPARED','GENERATED','XSD_VALIDATED','SIGNED','FAILED')),
  CONSTRAINT fiscal_xml_runs_env_chk CHECK (environment_code = '2'),
  CONSTRAINT fiscal_xml_runs_key_chk CHECK (access_key ~ '^[0-9]{44}$'),
  CONSTRAINT fiscal_xml_runs_version_chk CHECK (run_version >= 1)
);

CREATE INDEX IF NOT EXISTS fiscal_xml_runs_invoice_idx
  ON public.fiscal_xml_runs (fiscal_invoice_id, run_version DESC);
CREATE INDEX IF NOT EXISTS fiscal_xml_runs_state_idx
  ON public.fiscal_xml_runs (state, prepared_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_xml_runs_invoice_version_uidx
  ON public.fiscal_xml_runs (fiscal_invoice_id, run_version);

COMMENT ON TABLE public.fiscal_xml_runs IS
  'F4: execucoes append-only de geracao/validacao XSD/assinatura da NF-e 55. Teto SIGNED.';

-- ---------------------------------------------------------------------
-- 3. Imutabilidade real: DELETE sempre bloqueado; UPDATE apenas via
--    motor SECURITY DEFINER (GUC app.fiscal_xml_engine = 'on') e apenas
--    em colunas de progressao. Vale inclusive para service_role.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_fiscal_xml_runs_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_IMMUTABLE: execucoes de XML sao append-only; DELETE proibido.';
  END IF;

  IF coalesce(current_setting('app.fiscal_xml_engine', true),'off') <> 'on' THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_IMMUTABLE: atualize execucoes apenas via rpc_fiscal_xml_record_v1.';
  END IF;

  IF NEW.id <> OLD.id
     OR NEW.fiscal_invoice_id <> OLD.fiscal_invoice_id
     OR NEW.idempotency_key <> OLD.idempotency_key
     OR NEW.run_version <> OLD.run_version
     OR NEW.payload_sha256 <> OLD.payload_sha256
     OR NEW.payload::text <> OLD.payload::text
     OR NEW.access_key <> OLD.access_key
     OR NEW.environment_code <> OLD.environment_code
     OR NEW.engine_version <> OLD.engine_version
     OR NEW.prepared_at <> OLD.prepared_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.previous_run_id IS DISTINCT FROM OLD.previous_run_id THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_IMMUTABLE: campos congelados nao podem ser alterados.';
  END IF;

  IF OLD.unsigned_sha256 IS NOT NULL AND NEW.unsigned_sha256 IS DISTINCT FROM OLD.unsigned_sha256 THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_IMMUTABLE: hash do XML nao assinado ja registrado.';
  END IF;
  IF OLD.signed_sha256 IS NOT NULL AND NEW.signed_sha256 IS DISTINCT FROM OLD.signed_sha256 THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_IMMUTABLE: hash do XML assinado ja registrado.';
  END IF;
  IF OLD.unsigned_path IS NOT NULL AND NEW.unsigned_path IS DISTINCT FROM OLD.unsigned_path THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_IMMUTABLE: caminho do XML nao assinado ja registrado.';
  END IF;
  IF OLD.signed_path IS NOT NULL AND NEW.signed_path IS DISTINCT FROM OLD.signed_path THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_IMMUTABLE: caminho do XML assinado ja registrado.';
  END IF;

  IF OLD.state IN ('SIGNED','FAILED') AND NEW.state <> OLD.state THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_TERMINAL: execucao % ja esta em estado terminal %.', OLD.id, OLD.state;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.tg_fiscal_xml_runs_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_fiscal_xml_runs_immutable() FROM anon;
REVOKE ALL ON FUNCTION public.tg_fiscal_xml_runs_immutable() FROM authenticated;

DROP TRIGGER IF EXISTS trg_fiscal_xml_runs_immutable ON public.fiscal_xml_runs;
CREATE TRIGGER trg_fiscal_xml_runs_immutable
  BEFORE UPDATE OR DELETE ON public.fiscal_xml_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_xml_runs_immutable();

CREATE OR REPLACE FUNCTION public.tg_fiscal_xsd_registry_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  RAISE EXCEPTION 'FISCAL_XSD_REGISTRY_IMMUTABLE: registro de XSD e versionado; use nova versao.';
END;
$fn$;

REVOKE ALL ON FUNCTION public.tg_fiscal_xsd_registry_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_fiscal_xsd_registry_immutable() FROM anon;
REVOKE ALL ON FUNCTION public.tg_fiscal_xsd_registry_immutable() FROM authenticated;

DROP TRIGGER IF EXISTS trg_fiscal_xsd_registry_immutable ON public.fiscal_xsd_registry;
CREATE TRIGGER trg_fiscal_xsd_registry_immutable
  BEFORE UPDATE OR DELETE ON public.fiscal_xsd_registry
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_xsd_registry_immutable();

-- ---------------------------------------------------------------------
-- 4. Grants e RLS — fail-closed. Nenhuma escrita direta pela aplicacao.
-- ---------------------------------------------------------------------
REVOKE ALL ON public.fiscal_xml_runs FROM PUBLIC;
REVOKE ALL ON public.fiscal_xml_runs FROM anon;
REVOKE ALL ON public.fiscal_xml_runs FROM authenticated;
REVOKE ALL ON public.fiscal_xsd_registry FROM PUBLIC;
REVOKE ALL ON public.fiscal_xsd_registry FROM anon;
REVOKE ALL ON public.fiscal_xsd_registry FROM authenticated;

GRANT SELECT ON public.fiscal_xml_runs TO authenticated;
GRANT SELECT ON public.fiscal_xsd_registry TO authenticated;
GRANT ALL ON public.fiscal_xml_runs TO service_role;
GRANT ALL ON public.fiscal_xsd_registry TO service_role;

ALTER TABLE public.fiscal_xml_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_xsd_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_xml_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_xsd_registry FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_xml_runs_select_internal ON public.fiscal_xml_runs;
CREATE POLICY fiscal_xml_runs_select_internal
  ON public.fiscal_xml_runs FOR SELECT TO authenticated
  USING (public.fn_fiscal_can_read_internal(auth.uid()));

DROP POLICY IF EXISTS fiscal_xsd_registry_select_internal ON public.fiscal_xsd_registry;
CREATE POLICY fiscal_xsd_registry_select_internal
  ON public.fiscal_xsd_registry FOR SELECT TO authenticated
  USING (public.fn_fiscal_can_read_internal(auth.uid()));

-- ---------------------------------------------------------------------
-- 5. Semente do registro XSD oficial (Leiaute NF-e 4.00)
-- ---------------------------------------------------------------------
INSERT INTO public.fiscal_xsd_registry
  (schema_name, schema_version, root_element, namespace_uri, source_url, legal_basis, published_at, notes)
VALUES
  ('nfe_v4.00', '4.00', 'NFe', 'http://www.portalfiscal.inf.br/nfe',
   'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/fwLvLUSmU8=',
   'Manual de Orientacao do Contribuinte — Leiaute NF-e 4.00',
   DATE '2024-01-01',
   'Estrutura infNFe: ide, emit, dest, det[], total, transp, pag, infAdic.'),
  ('xmldsig_core', '1.0', 'Signature', 'http://www.w3.org/2000/09/xmldsig#',
   'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/fwLvLUSmU8=',
   'MOC NF-e 4.00 — assinatura XMLDSig enveloped, C14N, RSA',
   DATE '2024-01-01',
   'Reference URI = #NFe<chave>, transforms enveloped-signature + C14N.')
ON CONFLICT (schema_name, schema_version) DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. rpc_fiscal_xml_prepare_v1 — congela payload deterministico
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_xml_prepare_v1(
  p_invoice_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE
  inv  public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  resv public.fiscal_number_reservations%ROWTYPE;
  srs  public.fiscal_document_series%ROWTYPE;
  existing public.fiscal_xml_runs%ROWTYPE;
  v_items jsonb;
  v_payload jsonb;
  v_hash text;
  v_schema text;
  v_version int;
  v_prev uuid;
  v_run public.fiscal_xml_runs%ROWTYPE;
BEGIN
  IF NOT public.fn_fiscal_can_operate(auth.uid()) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para gerar XML fiscal.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: documento nao informado.';
  END IF;

  -- Gate de ambiente fail-closed ANTES de qualquer leitura/efeito (F3.1-R2).
  PERFORM public.fn_fiscal_assert_environment_homologation();

  IF EXISTS (SELECT 1 FROM public.fiscal_xml_runs
              WHERE idempotency_key = p_idempotency_key
                AND fiscal_invoice_id <> p_invoice_id) THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave de idempotencia ja utilizada por outro documento fiscal.';
  END IF;

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;

  IF inv.document_model <> 'NFE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: fase F4 cobre apenas NF-e modelo 55.';
  END IF;
  IF coalesce(inv.tp_emis,1) <> 1 THEN
    RAISE EXCEPTION 'FISCAL_TPEMIS_UNSUPPORTED: apenas emissao normal (tpEmis=1) esta habilitada nesta fase.';
  END IF;
  IF inv.tax_snapshot IS NULL OR NOT (inv.tax_snapshot ? 'engineVersion') THEN
    RAISE EXCEPTION 'FISCAL_CALCULATION_REQUIRED: calcule os tributos antes de gerar o XML.';
  END IF;

  SELECT * INTO resv FROM public.fiscal_number_reservations
   WHERE fiscal_invoice_id = p_invoice_id AND status = 'RESERVED'
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_NUMBER_RESERVATION_REQUIRED: reserve a numeracao antes de gerar o XML.';
  END IF;
  SELECT * INTO srs FROM public.fiscal_document_series WHERE id = resv.series_id;

  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %',
      (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'reasons';
  END IF;

  PERFORM public.fn_fiscal_assert_debtor_recipient(p_invoice_id);

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') <> '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: apenas homologacao (tpAmb=2) e permitida na fase F4.';
  END IF;
  IF emit.nfe_readiness_status <> 'READY_HOMOLOGATION' THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_READY: emitente com pendencias %', emit.nfe_readiness_pendencies;
  END IF;

  SELECT * INTO dest FROM public.customer_fiscal_profiles WHERE customer_id = inv.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECIPIENT_PROFILE_MISSING: perfil fiscal do destinatario nao cadastrado.'; END IF;
  IF dest.nfe_readiness_status <> 'READY' THEN
    RAISE EXCEPTION 'FISCAL_RECIPIENT_NOT_READY: destinatario com pendencias %', dest.nfe_readiness_pendencies;
  END IF;

  SELECT schema_version INTO v_schema
    FROM public.fiscal_xsd_registry
   WHERE schema_name = 'nfe_v4.00' AND is_active
   ORDER BY published_at DESC LIMIT 1;
  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'FISCAL_XSD_NOT_REGISTERED: esquema NF-e 4.00 ausente no registro oficial.';
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'nItem', i.item_sequence,
             'cProd', coalesce(nullif(btrim(coalesce(i.source_item_id::text,'')),''), 'ITEM' || i.item_sequence::text),
             'xProd', i.description,
             'NCM', i.ncm_snapshot,
             'CEST', i.cest_snapshot,
             'CFOP', i.cfop_snapshot,
             'uCom', i.commercial_unit,
             'qCom', i.quantity,
             'vUnCom', i.unit_value,
             'vProd', coalesce(i.gross_value, i.quantity * i.unit_value),
             'vDesc', coalesce(i.discount_value,0),
             'vFrete', coalesce(i.freight_value,0),
             'vSeg', coalesce(i.insurance_value,0),
             'vOutro', coalesce(i.other_value,0),
             'orig', coalesce(i.origem_snapshot,'0'),
             'CST', i.cst_icms_snapshot,
             'CSOSN', i.csosn_snapshot,
             'taxSnapshot', i.tax_snapshot)
           ORDER BY i.item_sequence)
    INTO v_items
    FROM public.fiscal_invoice_items i
   WHERE i.fiscal_invoice_id = p_invoice_id;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NO_ITEMS: documento sem itens.';
  END IF;

  v_payload := jsonb_build_object(
    'engineVersion','F4.1',
    'schemaVersion', v_schema,
    'tpAmb', emit.nfe_environment_code,
    'accessKey', resv.access_key,
    'ide', jsonb_build_object(
      'cUF', left(resv.access_key,2),
      'cNF', resv.cnf,
      'natOp', coalesce(inv.nature_operation, 'VENDA'),
      'mod', '55',
      'serie', coalesce(srs.series, emit.nfe_series_number),
      'nNF', resv.number,
      'dhEmi', to_char(coalesce(inv.issue_date, current_date), 'YYYY-MM-DD'),
      'tpNF', CASE WHEN coalesce(inv.direction,'OUT') = 'OUT' THEN '1' ELSE '0' END,
      'idDest', CASE
                  WHEN upper(coalesce(dest.fiscal_state,'')) = upper(coalesce(emit.state,'')) THEN '1'
                  ELSE '2' END,
      'cMunFG', emit.municipality_ibge_code,
      'tpImp','1', 'tpEmis','1',
      'cDV', resv.check_digit::text,
      'finNFe', coalesce(inv.fin_nfe,'1'),
      'indFinal', CASE WHEN coalesce(dest.final_consumer,true) THEN '1' ELSE '0' END,
      'indPres','9', 'procEmi','0', 'verProc','ARBIO-F4.1'),
    'emit', jsonb_build_object(
      'CNPJ', public.fn_fiscal_digits(emit.cnpj),
      'xNome', emit.legal_name,
      'xFant', emit.trade_name,
      'IE', public.fn_fiscal_digits(coalesce(emit.state_registration,'')),
      'CRT', emit.crt,
      'CNAE', emit.primary_cnae,
      'enderEmit', jsonb_build_object(
        'xLgr', emit.street, 'nro', emit.number, 'xCpl', emit.complement,
        'xBairro', emit.neighborhood, 'cMun', emit.municipality_ibge_code,
        'xMun', emit.city, 'UF', emit.state,
        'CEP', public.fn_fiscal_digits(coalesce(emit.postal_code,'')),
        'cPais','1058','xPais','BRASIL')),
    'dest', jsonb_build_object(
      'personType', dest.person_type,
      'doc', public.fn_fiscal_digits(coalesce(dest.cpf_cnpj,'')),
      'xNome', dest.legal_name,
      'indIEDest', dest.taxpayer_indicator,
      'IE', public.fn_fiscal_digits(coalesce(dest.state_registration,'')),
      'enderDest', jsonb_build_object(
        'xLgr', dest.fiscal_street, 'nro', dest.fiscal_number, 'xCpl', dest.fiscal_complement,
        'xBairro', dest.fiscal_neighborhood, 'cMun', dest.fiscal_municipality_ibge_code,
        'xMun', dest.fiscal_city, 'UF', dest.fiscal_state,
        'CEP', public.fn_fiscal_digits(coalesce(dest.fiscal_postal_code,'')),
        'cPais','1058','xPais','BRASIL')),
    'det', v_items,
    'total', inv.fiscal_totals_snapshot,
    'infAdic', jsonb_build_object(
      'infCpl', 'AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'));

  IF public.fiscal_json_has_sensitive_key(v_payload) THEN
    RAISE EXCEPTION 'FISCAL_PAYLOAD_SENSITIVE: payload de XML contem chave sensivel.';
  END IF;

  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  SELECT * INTO existing FROM public.fiscal_xml_runs
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing.payload_sha256 <> v_hash THEN
      RAISE EXCEPTION 'FISCAL_XML_FINGERPRINT_MISMATCH: documento mudou apos o preparo; use nova chave de idempotencia.';
    END IF;
    RETURN jsonb_build_object(
      'runId', existing.id, 'state', existing.state, 'runVersion', existing.run_version,
      'schemaVersion', existing.schema_version, 'accessKey', existing.access_key,
      'payloadSha256', existing.payload_sha256, 'payload', existing.payload,
      'idempotentReplay', true);
  END IF;

  SELECT id, run_version INTO v_prev, v_version
    FROM public.fiscal_xml_runs
   WHERE fiscal_invoice_id = p_invoice_id
   ORDER BY run_version DESC LIMIT 1;

  IF v_prev IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.fiscal_xml_runs
       WHERE fiscal_invoice_id = p_invoice_id AND state NOT IN ('SIGNED','FAILED')) THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_IN_PROGRESS: existe execucao em andamento para este documento.';
  END IF;

  INSERT INTO public.fiscal_xml_runs (
    fiscal_invoice_id, reservation_id, idempotency_key, run_version, previous_run_id,
    schema_version, environment_code, access_key, payload, payload_sha256, created_by)
  VALUES (
    p_invoice_id, resv.id, p_idempotency_key, coalesce(v_version,0) + 1, v_prev,
    v_schema, emit.nfe_environment_code, resv.access_key, v_payload, v_hash, auth.uid())
  RETURNING * INTO v_run;

  INSERT INTO public.fiscal_audit_log (table_name, record_id, action, changed_by, new_values)
  VALUES ('fiscal_xml_runs', v_run.id, 'XML_PREPARED', auth.uid(),
          jsonb_build_object('invoiceId', p_invoice_id, 'runVersion', v_run.run_version,
                             'payloadSha256', v_hash, 'schemaVersion', v_schema));

  RETURN jsonb_build_object(
    'runId', v_run.id, 'state', v_run.state, 'runVersion', v_run.run_version,
    'schemaVersion', v_run.schema_version, 'accessKey', v_run.access_key,
    'payloadSha256', v_run.payload_sha256, 'payload', v_run.payload,
    'idempotentReplay', false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_xml_prepare_v1(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_xml_prepare_v1(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_xml_prepare_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_xml_prepare_v1(uuid,text) TO service_role;

-- ---------------------------------------------------------------------
-- 7. rpc_fiscal_xml_record_v1 — progressao de estado (service_role only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_xml_record_v1(
  p_run_id uuid,
  p_state text,
  p_patch jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE
  r public.fiscal_xml_runs%ROWTYPE;
  v_ok boolean := false;
BEGIN
  IF p_state IS NULL OR p_state NOT IN ('GENERATED','XSD_VALIDATED','SIGNED','FAILED') THEN
    RAISE EXCEPTION 'FISCAL_XML_STATE_INVALID: estado % nao permitido.', p_state;
  END IF;
  IF p_patch IS NOT NULL AND public.fiscal_json_has_sensitive_key(p_patch) THEN
    RAISE EXCEPTION 'FISCAL_PAYLOAD_SENSITIVE: patch contem chave sensivel.';
  END IF;

  SELECT * INTO r FROM public.fiscal_xml_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_XML_RUN_NOT_FOUND: %', p_run_id; END IF;
  IF r.state IN ('SIGNED','FAILED') THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_TERMINAL: execucao ja finalizada em %.', r.state;
  END IF;

  v_ok := (p_state = 'FAILED')
       OR (r.state = 'PREPARED'      AND p_state = 'GENERATED')
       OR (r.state = 'GENERATED'     AND p_state = 'XSD_VALIDATED')
       OR (r.state = 'XSD_VALIDATED' AND p_state = 'SIGNED');
  IF NOT v_ok THEN
    RAISE EXCEPTION 'FISCAL_XML_TRANSITION_INVALID: % -> % nao permitido.', r.state, p_state;
  END IF;

  PERFORM set_config('app.fiscal_xml_engine','on', true);

  UPDATE public.fiscal_xml_runs SET
    state = p_state,
    unsigned_sha256 = coalesce(unsigned_sha256, nullif(p_patch->>'unsignedSha256','')),
    unsigned_bytes  = coalesce(unsigned_bytes,  nullif(p_patch->>'unsignedBytes','')::int),
    unsigned_path   = coalesce(unsigned_path,   nullif(p_patch->>'unsignedPath','')),
    signed_sha256   = coalesce(signed_sha256,   nullif(p_patch->>'signedSha256','')),
    signed_bytes    = coalesce(signed_bytes,    nullif(p_patch->>'signedBytes','')::int),
    signed_path     = coalesce(signed_path,     nullif(p_patch->>'signedPath','')),
    certificate_id  = coalesce(certificate_id,  nullif(p_patch->>'certificateId','')::uuid),
    validation      = CASE WHEN p_patch ? 'validation'
                           THEN validation || (p_patch->'validation') ELSE validation END,
    signature_metadata = CASE WHEN p_patch ? 'signature'
                           THEN signature_metadata || (p_patch->'signature') ELSE signature_metadata END,
    error_code   = CASE WHEN p_state = 'FAILED' THEN nullif(p_patch->>'errorCode','') ELSE error_code END,
    error_detail = CASE WHEN p_state = 'FAILED' THEN left(coalesce(p_patch->>'errorDetail',''), 500) ELSE error_detail END,
    generated_at = CASE WHEN p_state = 'GENERATED'     THEN now() ELSE generated_at END,
    validated_at = CASE WHEN p_state = 'XSD_VALIDATED' THEN now() ELSE validated_at END,
    signed_at    = CASE WHEN p_state = 'SIGNED'        THEN now() ELSE signed_at END,
    failed_at    = CASE WHEN p_state = 'FAILED'        THEN now() ELSE failed_at END
  WHERE id = p_run_id
  RETURNING * INTO r;

  PERFORM set_config('app.fiscal_xml_engine','off', true);

  INSERT INTO public.fiscal_audit_log (table_name, record_id, action, changed_by, new_values)
  VALUES ('fiscal_xml_runs', r.id, 'XML_' || p_state, r.created_by,
          jsonb_build_object('state', r.state, 'unsignedSha256', r.unsigned_sha256,
                             'signedSha256', r.signed_sha256, 'errorCode', r.error_code));

  RETURN jsonb_build_object('runId', r.id, 'state', r.state,
    'unsignedSha256', r.unsigned_sha256, 'signedSha256', r.signed_sha256,
    'validation', r.validation, 'errorCode', r.error_code);
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_xml_record_v1(uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_xml_record_v1(uuid,text,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_fiscal_xml_record_v1(uuid,text,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_xml_record_v1(uuid,text,jsonb) TO service_role;

-- ---------------------------------------------------------------------
-- 8. rpc_fiscal_xml_status_v1 — leitura sanitizada para a UI
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_xml_status_v1(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_runs jsonb;
BEGIN
  IF NOT public.fn_fiscal_can_read_internal(auth.uid()) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para consultar execucoes de XML.';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'runId', r.id, 'runVersion', r.run_version, 'state', r.state,
           'engineVersion', r.engine_version, 'schemaVersion', r.schema_version,
           'accessKey', r.access_key, 'environmentCode', r.environment_code,
           'payloadSha256', r.payload_sha256,
           'unsignedSha256', r.unsigned_sha256, 'unsignedBytes', r.unsigned_bytes,
           'signedSha256', r.signed_sha256, 'signedBytes', r.signed_bytes,
           'hasUnsigned', r.unsigned_path IS NOT NULL,
           'hasSigned', r.signed_path IS NOT NULL,
           'validation', r.validation, 'signature', r.signature_metadata,
           'errorCode', r.error_code,
           'preparedAt', r.prepared_at, 'generatedAt', r.generated_at,
           'validatedAt', r.validated_at, 'signedAt', r.signed_at, 'failedAt', r.failed_at)
           ORDER BY r.run_version DESC), '[]'::jsonb)
    INTO v_runs
    FROM public.fiscal_xml_runs r
   WHERE r.fiscal_invoice_id = p_invoice_id;

  RETURN jsonb_build_object('invoiceId', p_invoice_id, 'ceiling','SIGNED', 'runs', v_runs);
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_xml_status_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_xml_status_v1(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_xml_status_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_xml_status_v1(uuid) TO service_role;
