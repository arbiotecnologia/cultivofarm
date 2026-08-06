-- =====================================================================
-- FASE F3.1 — CORREÇÃO FINAL APÓS AUDITORIA INDEPENDENTE (commit bba810c5)
-- Alvo: STAGING ikaauvsflpmamgxmkhoq. Produção navfzbwgwzruipouyfnk PROIBIDA.
-- Migration incremental, idempotente e promovível, POSTERIOR a 20260817030000.
-- Nenhuma migration já aplicada é editada. Nenhum dado é apagado.
-- Nada é publicado nem transmitido à SEFAZ.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) PREFLIGHT DE PROMOÇÃO — fail-closed, sem apagar nem inventar vínculo
-- ---------------------------------------------------------------------
DO $$
DECLARE n int; ids text;
BEGIN
  SELECT count(*) INTO n
    FROM public.fiscal_number_reservations
   WHERE fiscal_invoice_id IS NULL;

  IF n > 0 THEN
    SELECT string_agg(left(id::text, 8) || '…', ', ' ORDER BY id)
      INTO ids
      FROM (SELECT id FROM public.fiscal_number_reservations
             WHERE fiscal_invoice_id IS NULL ORDER BY id LIMIT 20) q;
    RAISE EXCEPTION
      'FISCAL_PREFLIGHT_RESERVATION_ORPHAN: % reserva(s) de numeracao sem fiscal_invoice_id. IDs (mascarados): %',
      n, coalesce(ids, '-')
      USING HINT = 'Saneie por vinculo auditavel (RPC/registro humano) antes de promover. NAO delete reservas nem invente vinculo: numeracao inutilizada exige evento fiscal proprio.';
  END IF;
END $$;

-- Preflight 2: contexto tributario encadeado exige que nenhuma regra publicada
-- dependa de componente de base ainda nao suportado pelo motor.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.fiscal_tax_rules t
   WHERE t.status = 'PUBLISHED'
     AND NOT public.fn_fiscal_base_components_valid(t.base_components);
  IF n > 0 THEN
    RAISE EXCEPTION 'FISCAL_PREFLIGHT_BASE_COMPONENTS_INVALID: % regra(s) publicada(s) com componentes de base fora do dominio.', n;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) DEVEDOR / DESTINATÁRIO — o destinatário da NF-e B2B é o cliente
--    fiscal do PARCEIRO devedor; nunca o produtor final vinculado.
-- ---------------------------------------------------------------------

-- Resolve o customer_id canônico (public.clientes) do parceiro B2B.
-- Retorna NULL quando ausente; levanta exceção quando ambíguo.
CREATE OR REPLACE FUNCTION public.fn_fiscal_partner_fiscal_customer(_partner_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_customer uuid; n_share int;
BEGIN
  IF _partner_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT pa.client_id INTO v_customer
    FROM public.partner_accounts pa
   WHERE pa.id = _partner_id
     AND pa.deleted_at IS NULL;

  IF v_customer IS NULL THEN
    RETURN NULL;
  END IF;

  -- Duplicidade: mais de um parceiro ativo apontando para o mesmo cliente fiscal
  -- torna o destinatário ambíguo. Nunca escolher em silêncio.
  SELECT count(*) INTO n_share
    FROM public.partner_accounts pa
   WHERE pa.client_id = v_customer
     AND pa.deleted_at IS NULL
     AND coalesce(pa.ativo, true);

  IF n_share > 1 THEN
    RAISE EXCEPTION
      'FISCAL_DEBTOR_RECIPIENT_MISMATCH: % contas de parceiro ativas compartilham o mesmo cliente fiscal; destinatario ambiguo.', n_share
      USING HINT = 'Regularize o cadastro comercial antes de faturar. O motor fiscal nunca desempata devedor automaticamente.';
  END IF;

  RETURN v_customer;
END $function$;

-- Verificação canônica devedor × destinatário do documento.
-- Fail-closed: ausência, duplicidade ou divergência => FISCAL_DEBTOR_RECIPIENT_MISMATCH.
CREATE OR REPLACE FUNCTION public.fn_fiscal_assert_debtor_recipient(_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  elig jsonb; v_debtor uuid; v_expected uuid;
BEGIN
  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', _invoice_id;
  END IF;

  IF coalesce(inv.source_type,'') NOT IN ('PARTNER_ORDER','ENTREGA') THEN
    RAISE EXCEPTION 'FISCAL_SOURCE_TYPE_UNSUPPORTED: escopo % nao suportado nesta fase.', coalesce(inv.source_type,'-');
  END IF;

  elig := public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id);
  v_debtor := nullif(elig->>'debtorPartnerId','')::uuid;

  IF v_debtor IS NULL THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: parceiro devedor nao resolvido para a origem % .', inv.source_type
      USING HINT = 'Somente o parceiro B2B devedor pode figurar como destinatario; produtor final vinculado nunca e devedor.';
  END IF;

  v_expected := public.fn_fiscal_partner_fiscal_customer(v_debtor);

  IF v_expected IS NULL THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: parceiro devedor sem cliente fiscal (partner_accounts.client_id) cadastrado.'
      USING HINT = 'Vincule a conta do parceiro ao cliente fiscal antes de faturar.';
  END IF;

  IF inv.customer_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: documento sem destinatario (customer_id) definido.';
  END IF;

  IF inv.customer_id <> v_expected THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: destinatario do documento nao corresponde ao cliente fiscal do parceiro devedor.'
      USING HINT = 'Emissao bloqueada sem qualquer efeito colateral. Corrija o destinatario ou o devedor.';
  END IF;

  IF inv.debtor_partner_id IS NOT NULL AND inv.debtor_partner_id <> v_debtor THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: debtor_partner_id do documento diverge do devedor da origem.';
  END IF;

  IF inv.debtor_customer_id IS NOT NULL AND inv.debtor_customer_id <> v_expected THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: debtor_customer_id do documento diverge do cliente fiscal do parceiro devedor.';
  END IF;

  RETURN jsonb_build_object(
    'debtorPartnerId', v_debtor,
    'recipientCustomerId', v_expected,
    'sourceType', inv.source_type,
    'orderId', elig->>'orderId');
END $function$;

-- ---------------------------------------------------------------------
-- 2) HOMOLOGAÇÃO/PRODUÇÃO — teto READY_HOMOLOGATION nesta fase.
--    O estado PERSISTIDO nunca pode virar READY_PRODUCTION.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_fiscal_emitter_pendencies_row(r company_fiscal_settings)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- F3.1: ambiente de PRODUCAO (tpAmb=1) permanece BLOQUEADO nesta fase.
  IF coalesce(r.nfe_environment_code,'2') = '1' THEN
    out := out || jsonb_build_object('code','EMITTER_PRODUCTION_BLOCKED_F3','field','nfe_environment_code','severity','BLOCK',
      'message','Ambiente de producao (tpAmb=1) bloqueado na fase F3: teto e READY_HOMOLOGATION ate fluxo controlado de homologacao SEFAZ.');
  END IF;

  RETURN out;
END $function$;

-- Trigger de prontidão: READY_PRODUCTION deixa de existir como estado persistido.
CREATE OR REPLACE FUNCTION public.tg_fiscal_emitter_refresh_readiness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.nfe_readiness_pendencies := public.fn_fiscal_emitter_pendencies_row(NEW);
  NEW.nfe_readiness_status := CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.nfe_readiness_pendencies) e WHERE e->>'severity'='BLOCK') THEN 'NOT_READY'
    WHEN jsonb_array_length(NEW.nfe_readiness_pendencies) > 0 THEN 'PARTIAL'
    ELSE 'READY_HOMOLOGATION' END;  -- teto absoluto da F3
  NEW.nfe_readiness_checked_at := now();
  RETURN NEW;
END $function$;

-- Guarda dos campos de prova de homologação: UPDATE informal é recusado.
-- A transição só poderá ocorrer por RPC controlada (fase posterior), que deverá
-- declarar o contexto `fiscal.homologation_ctx = 'controlled-rpc'`.
CREATE OR REPLACE FUNCTION public.tg_fiscal_homologation_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.sefaz_homologation_at IS DISTINCT FROM OLD.sefaz_homologation_at)
     OR (NEW.sefaz_homologation_evidence IS DISTINCT FROM OLD.sefaz_homologation_evidence) THEN
    IF coalesce(current_setting('fiscal.homologation_ctx', true), '') <> 'controlled-rpc' THEN
      RAISE EXCEPTION 'FISCAL_HOMOLOGATION_EVIDENCE_IMMUTABLE: prova de homologacao SEFAZ nao pode ser alterada por UPDATE direto.'
        USING HINT = 'A transicao ocorrera somente por RPC controlada e auditada em fase posterior.';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_fiscal_homologation_evidence_guard ON public.company_fiscal_settings;
CREATE TRIGGER trg_fiscal_homologation_evidence_guard
  BEFORE UPDATE ON public.company_fiscal_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_homologation_evidence_guard();

-- Reavalia prontidão persistida com as novas regras (sem alterar dados de negócio).
UPDATE public.company_fiscal_settings
   SET updated_at = updated_at
 WHERE nfe_readiness_status IS DISTINCT FROM 'ARBIO_NOOP';

-- ---------------------------------------------------------------------
-- 3) CONTEXTO TRIBUTÁRIO ENCADEADO + DEVEDOR NO MOTOR DE CÁLCULO
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_calculate_invoice_v1(p_invoice_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  it record; pol public.fiscal_operation_policies%ROWTYPE; rule public.fiscal_tax_rules%ROWTYPE;
  item_taxes jsonb; item_snapshot jsonb; ctx jsonb; res jsonb;
  totals jsonb; existing jsonb; debtor jsonb;
  t_icms numeric := 0; t_st numeric := 0; t_fcp numeric := 0; t_difal numeric := 0;
  t_pis numeric := 0; t_cofins numeric := 0; t_ipi numeric := 0; t_fcpst numeric := 0;
  t_difal_dest numeric := 0; t_difal_orig numeric := 0; t_fcp_dest numeric := 0;
  t_prod numeric := 0; t_desc numeric := 0; t_frete numeric := 0; t_seg numeric := 0; t_outros numeric := 0;
  t_nf numeric := 0; n_items int := 0; ref_date date; kinds text[]; k text;
  has_difal boolean := false;
  v_prod numeric; v_icms_own numeric; v_ipi numeric; v_base_st numeric;
  v_st_val numeric; v_fcp_own numeric; v_fcp_st numeric;
  v_difal_dest numeric; v_difal_orig numeric; v_fcp_dest numeric;
BEGIN
  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para calcular documento fiscal.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;

  IF EXISTS (SELECT 1 FROM public.fiscal_calculation_runs
              WHERE idempotency_key = p_idempotency_key
                AND fiscal_invoice_id <> p_invoice_id) THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave de idempotencia ja utilizada por outro documento fiscal.';
  END IF;

  SELECT result INTO existing FROM public.fiscal_calculation_runs
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF existing IS NOT NULL THEN
    RETURN existing || jsonb_build_object('idempotentReplay', true);
  END IF;

  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: somente rascunho pode ser calculado (status=%)', inv.status;
  END IF;
  IF inv.document_model <> 'NFE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: fase F3 cobre apenas NF-e modelo 55.';
  END IF;
  IF coalesce(inv.tp_emis,1) <> 1 THEN
    RAISE EXCEPTION 'FISCAL_TPEMIS_UNSUPPORTED: apenas emissao normal (tpEmis=1) esta habilitada nesta fase.';
  END IF;
  IF inv.tax_snapshot IS NOT NULL AND inv.tax_snapshot ? 'engineVersion' THEN
    RAISE EXCEPTION 'FISCAL_SNAPSHOT_IMMUTABLE: documento ja possui snapshot tributario; historico nao recalcula.';
  END IF;

  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %', (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'reasons';
  END IF;

  -- F3.1: devedor B2B x destinatario do documento (fail-closed, antes de qualquer efeito).
  debtor := public.fn_fiscal_assert_debtor_recipient(p_invoice_id);

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;

  -- F3.1: gate de ambiente/homologacao reavaliado tambem no CALCULO.
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao (tpAmb=1) bloqueado na fase F3; teto READY_HOMOLOGATION.';
  END IF;
  IF emit.nfe_readiness_status <> 'READY_HOMOLOGATION' THEN
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

    v_prod := public.fn_fiscal_round(coalesce(it.gross_value, it.quantity * it.unit_value));

    pol := public.fn_fiscal_resolve_operation(
      coalesce(inv.direction,'OUT'), emit.state, coalesce(dest.fiscal_state, emit.state), emit.crt,
      dest.final_consumer, dest.taxpayer_indicator, it.ncm_snapshot, null, inv.sales_channel, ref_date);

    -- Ordem canonica: ICMS -> IPI -> ICMS_ST -> FCP/FCP_ST -> DIFAL -> PIS/COFINS.
    kinds := ARRAY['ICMS']::text[];
    IF coalesce(emit.ipi_taxpayer,false) THEN kinds := array_append(kinds,'IPI'); END IF;
    IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'ICMS_ST'); END IF;
    IF coalesce(emit.fcp_applicable,false) THEN
      kinds := array_append(kinds,'FCP');
      IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'FCP_ST'); END IF;
    END IF;
    IF coalesce(emit.difal_responsible,false)
       AND upper(coalesce(dest.fiscal_state,'')) <> upper(coalesce(emit.state,''))
       AND coalesce(dest.final_consumer,true) THEN
      kinds := array_append(kinds,'DIFAL');
    END IF;
    kinds := kinds || ARRAY['PIS','COFINS']::text[];

    item_taxes := '{}'::jsonb;
    v_icms_own := 0; v_ipi := 0; v_base_st := NULL; v_st_val := 0;
    v_fcp_own := 0; v_fcp_st := 0;
    v_difal_dest := 0; v_difal_orig := 0; v_fcp_dest := 0;

    FOREACH k IN ARRAY kinds LOOP
      -- Contexto ENCADEADO: cada etapa enxerga o resultado das anteriores.
      ctx := jsonb_build_object(
        'produto', v_prod,
        'frete', public.fn_fiscal_round(coalesce(it.freight_value,0)),
        'seguro', public.fn_fiscal_round(coalesce(it.insurance_value,0)),
        'outras', public.fn_fiscal_round(coalesce(it.other_value,0)),
        'desconto', public.fn_fiscal_round(coalesce(it.discount_value,0)),
        'ipi', v_ipi,
        'icmsSt', v_st_val,
        'icmsOwnValue', v_icms_own,
        'baseST', v_base_st);

      rule := public.fn_fiscal_resolve_tax_rule(k, emit.crt, emit.state,
        coalesce(dest.fiscal_state, emit.state), it.ncm_snapshot, null,
        dest.final_consumer, dest.taxpayer_indicator, ref_date);
      res := public.fn_fiscal_apply_tax_v2(rule, ctx);
      item_taxes := item_taxes || jsonb_build_object(k, res || jsonb_build_object('contextIn', ctx));

      IF k = 'ICMS'    THEN v_icms_own := (res->>'value')::numeric; END IF;
      IF k = 'IPI'     THEN v_ipi := (res->>'value')::numeric; END IF;
      IF k = 'ICMS_ST' THEN
        v_st_val  := (res->>'value')::numeric;
        v_base_st := (res->'params'->>'baseST')::numeric;
      END IF;
      IF k = 'FCP'     THEN v_fcp_own := (res->>'value')::numeric; END IF;
      IF k = 'FCP_ST'  THEN v_fcp_st := (res->>'value')::numeric; END IF;
      IF k = 'DIFAL'   THEN
        has_difal := true;
        v_difal_dest := coalesce((res->'params'->>'valueDestination')::numeric,0);
        v_difal_orig := coalesce((res->'params'->>'valueOrigin')::numeric,0);
        v_fcp_dest   := coalesce((res->'params'->>'fcpValue')::numeric,0);
      END IF;
    END LOOP;

    t_prod   := t_prod + v_prod;
    t_desc   := t_desc + public.fn_fiscal_round(coalesce(it.discount_value,0));
    t_frete  := t_frete + public.fn_fiscal_round(coalesce(it.freight_value,0));
    t_seg    := t_seg + public.fn_fiscal_round(coalesce(it.insurance_value,0));
    t_outros := t_outros + public.fn_fiscal_round(coalesce(it.other_value,0));
    t_icms   := t_icms   + coalesce((item_taxes->'ICMS'->>'value')::numeric,0);
    t_st     := t_st     + v_st_val;
    -- vFCP = FCP proprio da operacao. vFCPST = FCP retido por ST.
    -- vFCPUFDest = FCP devido a UF de destino no DIFAL. Sem sobreposicao.
    t_fcp    := t_fcp    + v_fcp_own;
    t_fcpst  := t_fcpst  + v_fcp_st;
    t_difal  := t_difal  + coalesce((item_taxes->'DIFAL'->>'value')::numeric,0);
    t_difal_dest := t_difal_dest + v_difal_dest;
    t_difal_orig := t_difal_orig + v_difal_orig;
    t_fcp_dest   := t_fcp_dest + v_fcp_dest;
    t_pis    := t_pis    + coalesce((item_taxes->'PIS'->>'value')::numeric,0);
    t_cofins := t_cofins + coalesce((item_taxes->'COFINS'->>'value')::numeric,0);
    t_ipi    := t_ipi    + coalesce((item_taxes->'IPI'->>'value')::numeric,0);

    item_snapshot := jsonb_build_object(
      'engineVersion','F3.3',
      'calculatedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
      'ncm', it.ncm_snapshot,
      'cfop', pol.cfop,
      'natureOperation', pol.nature_operation,
      'operationPolicyId', pol.id,
      'operationPolicyVersion', pol.legal_version,
      'operationLegalBasis', pol.legal_basis,
      'operationSourceId', pol.source_id,
      'crt', emit.crt,
      'roundingMode','HALF_UP_2',
      'components', jsonb_build_object(
        'produto', v_prod,
        'desconto', public.fn_fiscal_round(coalesce(it.discount_value,0)),
        'frete', public.fn_fiscal_round(coalesce(it.freight_value,0)),
        'seguro', public.fn_fiscal_round(coalesce(it.insurance_value,0)),
        'outras', public.fn_fiscal_round(coalesce(it.other_value,0))),
      'taxOrder', to_jsonb(kinds),
      'chainedContext', jsonb_build_object(
        'icmsOwnValue', v_icms_own, 'ipi', v_ipi,
        'icmsSt', v_st_val, 'baseST', v_base_st),
      'itemTotals', jsonb_build_object(
        'vFCP', v_fcp_own, 'vFCPST', v_fcp_st,
        'vICMSUFDest', v_difal_dest, 'vICMSUFRemet', v_difal_orig,
        'vFCPUFDest', v_fcp_dest),
      'taxes', item_taxes);

    UPDATE public.fiscal_invoice_items
       SET tax_snapshot = item_snapshot,
           cfop_snapshot = pol.cfop,
           cst_icms_snapshot = item_taxes->'ICMS'->>'cst',
           csosn_snapshot = item_taxes->'ICMS'->>'csosn',
           net_value = coalesce((item_taxes->'ICMS'->>'baseOriginal')::numeric, v_prod),
           updated_at = now()
     WHERE id = it.id;
  END LOOP;

  IF n_items = 0 THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NO_ITEMS: documento sem itens.';
  END IF;

  t_nf := public.fn_fiscal_round(t_prod - t_desc + t_frete + t_seg + t_outros + t_st + t_fcpst + t_ipi);

  IF inv.total_amount IS NOT NULL AND abs(inv.total_amount - t_nf) > 0.01 THEN
    RAISE EXCEPTION 'FISCAL_TOTAL_MISMATCH: total informado % difere do total calculado %', inv.total_amount, t_nf;
  END IF;

  totals := jsonb_build_object(
    'engineVersion','F3.3', 'roundingMode','HALF_UP_2',
    'itemCount', n_items,
    'vProd', public.fn_fiscal_round(t_prod), 'vDesc', public.fn_fiscal_round(t_desc),
    'vFrete', public.fn_fiscal_round(t_frete), 'vSeg', public.fn_fiscal_round(t_seg),
    'vOutro', public.fn_fiscal_round(t_outros),
    'vICMS', public.fn_fiscal_round(t_icms), 'vST', public.fn_fiscal_round(t_st),
    'vFCP', public.fn_fiscal_round(t_fcp), 'vFCPST', public.fn_fiscal_round(t_fcpst),
    'vDIFAL', public.fn_fiscal_round(t_difal),
    'vPIS', public.fn_fiscal_round(t_pis), 'vCOFINS', public.fn_fiscal_round(t_cofins),
    'vIPI', public.fn_fiscal_round(t_ipi), 'vNF', t_nf,
    'debtor', debtor);

  IF has_difal THEN
    totals := totals || jsonb_build_object(
      'vICMSUFDest', public.fn_fiscal_round(t_difal_dest),
      'vICMSUFRemet', public.fn_fiscal_round(t_difal_orig),
      'vFCPUFDest', public.fn_fiscal_round(t_fcp_dest));
  END IF;

  UPDATE public.fiscal_invoices
     SET tax_snapshot = totals,
         fiscal_totals_snapshot = totals,
         total_amount = t_nf,
         debtor_partner_id = coalesce(inv.debtor_partner_id, nullif(debtor->>'debtorPartnerId','')::uuid),
         debtor_customer_id = coalesce(inv.debtor_customer_id, nullif(debtor->>'recipientCustomerId','')::uuid),
         company_snapshot = jsonb_build_object(
           'cnpj', emit.cnpj, 'legalName', emit.legal_name, 'crt', emit.crt,
           'ie', emit.state_registration, 'uf', emit.state,
           'municipalityIbge', emit.municipality_ibge_code,
           'series', emit.nfe_series_number, 'environment', emit.nfe_environment_code),
         customer_snapshot = jsonb_build_object(
           'document', dest.cpf_cnpj, 'legalName', dest.legal_name,
           'indIEDest', dest.taxpayer_indicator, 'uf', dest.fiscal_state,
           'municipalityIbge', dest.fiscal_municipality_ibge_code,
           'finalConsumer', dest.final_consumer, 'icmsTaxpayer', dest.icms_taxpayer,
           'debtorPartnerId', debtor->>'debtorPartnerId'),
         updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.fiscal_calculation_runs (fiscal_invoice_id, idempotency_key, engine_version, result, created_by)
  VALUES (p_invoice_id, p_idempotency_key, 'F3.3', totals, auth.uid());

  RETURN totals || jsonb_build_object('idempotentReplay', false);
END $function$;

-- Reserva: aplica o mesmo gate de devedor/destinatário e o teto de ambiente.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_reserve_nfe_number_v1(p_invoice_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  s public.fiscal_document_series%ROWTYPE;
  existing public.fiscal_number_reservations%ROWTYPE;
  n int; cnf text; key43 text; dv int; full_key text; cuf text;
BEGIN
  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para reservar numeracao.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: documento nao informado.';
  END IF;

  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;

  IF EXISTS (SELECT 1 FROM public.fiscal_number_reservations r
              WHERE r.idempotency_key = p_idempotency_key
                AND r.fiscal_invoice_id <> p_invoice_id) THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave de idempotencia ja utilizada por outro documento fiscal.'
      USING HINT = 'Gere uma chave exclusiva por documento. Reservas nunca sao compartilhadas entre documentos.';
  END IF;

  SELECT * INTO existing FROM public.fiscal_number_reservations
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('reservationId', existing.id, 'number', existing.number,
      'series', (SELECT series FROM public.fiscal_document_series WHERE id = existing.series_id),
      'accessKey', existing.access_key, 'checkDigit', existing.check_digit,
      'tpEmis', existing.tp_emis, 'status', existing.status, 'idempotentReplay', true);
  END IF;

  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: reserva permitida apenas em rascunho (status=%)', inv.status;
  END IF;
  IF coalesce(inv.tp_emis,1) <> 1 THEN
    RAISE EXCEPTION 'FISCAL_TPEMIS_UNSUPPORTED: apenas emissao normal (tpEmis=1) esta habilitada nesta fase.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fiscal_number_reservations r
             WHERE r.fiscal_invoice_id = p_invoice_id AND r.status = 'RESERVED') THEN
    RAISE EXCEPTION 'FISCAL_NUMBER_ALREADY_RESERVED: documento ja possui reserva ativa.';
  END IF;
  IF inv.tax_snapshot IS NULL OR NOT (inv.tax_snapshot ? 'engineVersion') THEN
    RAISE EXCEPTION 'FISCAL_CALCULATION_REQUIRED: calcule os tributos antes de reservar numeracao.';
  END IF;

  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %',
      (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'reasons';
  END IF;

  -- F3.1: devedor B2B x destinatario reavaliado na reserva.
  PERFORM public.fn_fiscal_assert_debtor_recipient(p_invoice_id);

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao (tpAmb=1) bloqueado na fase F3; teto READY_HOMOLOGATION.';
  END IF;
  IF emit.nfe_readiness_status <> 'READY_HOMOLOGATION' THEN
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
    SELECT * INTO s FROM public.fiscal_document_series WHERE id = s.id FOR UPDATE;
  END IF;
  IF s.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FISCAL_SERIES_BLOCKED: serie % bloqueada.', s.series;
  END IF;

  n := s.current_number + 1;
  IF n > 999999999 THEN RAISE EXCEPTION 'FISCAL_SERIES_EXHAUSTED: serie % esgotada.', s.series; END IF;

  cnf := lpad(((get_byte(extensions.gen_random_bytes(4),0)::bigint << 24
              | get_byte(extensions.gen_random_bytes(4),0)::bigint << 16
              | get_byte(extensions.gen_random_bytes(4),0)::bigint << 8
              | get_byte(extensions.gen_random_bytes(4),0)::bigint) % 100000000)::text, 8, '0');

  cuf := public.fn_fiscal_uf_ibge_code(emit.state);
  key43 := cuf
        || to_char(coalesce(inv.issue_date, current_date), 'YYMM')
        || public.fn_fiscal_digits(emit.cnpj)
        || '55'
        || lpad(s.series::text, 3, '0')
        || lpad(n::text, 9, '0')
        || coalesce(inv.tp_emis,1)::text
        || cnf;
  dv := public.fn_fiscal_access_key_dv(key43);
  full_key := key43 || dv::text;

  UPDATE public.fiscal_document_series SET current_number = n, updated_at = now() WHERE id = s.id;

  INSERT INTO public.fiscal_number_reservations
    (series_id, number, cnf, access_key, check_digit, status, fiscal_invoice_id,
     idempotency_key, reserved_by, tp_emis)
  VALUES (s.id, n, cnf, full_key, dv, 'RESERVED', p_invoice_id,
          p_idempotency_key, auth.uid(), coalesce(inv.tp_emis,1));

  UPDATE public.fiscal_invoices
     SET series = s.series::text, invoice_number = n::text, access_key = full_key, updated_at = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('number', n, 'series', s.series, 'accessKey', full_key,
                            'checkDigit', dv, 'tpEmis', coalesce(inv.tp_emis,1),
                            'status','RESERVED', 'idempotentReplay', false);
END $function$;

-- ---------------------------------------------------------------------
-- 4) COBERTURA REAL — valida a regra no MOTOR, não apenas a resolução.
-- ---------------------------------------------------------------------

-- Valida uma regra publicada executando o motor canônico com contexto
-- sintético neutro. IMMUTABLE + sem persistência. Retorna o código de gap.
CREATE OR REPLACE FUNCTION public.fn_fiscal_rule_validate_synthetic(_tax_kind text, _rule fiscal_tax_rules, _ctx jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE msg text;
BEGIN
  PERFORM public.fn_fiscal_apply_tax_v2(_rule, _ctx);
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  msg := coalesce(SQLERRM,'');
  IF msg LIKE '%ENGINE_UNAVAILABLE%' THEN RETURN 'ENGINE_UNAVAILABLE'; END IF;
  IF msg LIKE '%AMBIGUOUS%'          THEN RETURN 'AMBIGUOUS'; END IF;
  IF msg LIKE '%NOT_FOUND%'          THEN RETURN 'NOT_FOUND'; END IF;
  RETURN 'INCOMPLETE';
END $function$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_scenario_coverage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  emit public.company_fiscal_settings%ROWTYPE;
  sc record; total int := 0; covered int := 0;
  gaps jsonb := '[]'::jsonb; ref_date date := current_date;
  ok boolean; k text; kinds text[]; code text; msg text;
  rule public.fiscal_tax_rules%ROWTYPE;
  ctx jsonb; res jsonb;
  v_icms numeric; v_ipi numeric; v_st numeric; v_base_st numeric;
  n_micro_active int; n_micro_ready int; n_micro_draft int;
  n_micro_blocked int; n_micro_inactive int;
  n_ncm int; n_recip int; n_channel int;
BEGIN
  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('total',0,'covered',0,'gaps',
      jsonb_build_array(jsonb_build_object('code','EMITTER_NOT_CONFIGURED','scope','EMITENTE')));
  END IF;

  -- Inventário de microrganismos: ativos, prontos, rascunhos, bloqueados, inativos.
  SELECT count(*) FILTER (WHERE coalesce(m.ativo,true)),
         count(*) FILTER (WHERE NOT coalesce(m.ativo,true))
    INTO n_micro_active, n_micro_inactive
    FROM public.microrganismos m;

  SELECT
    count(*) FILTER (WHERE coalesce(p.profile_status,'DRAFT') = 'VALIDATED'
                       AND p.accounting_validated_at IS NOT NULL
                       AND coalesce(p.is_active,false)),
    count(*) FILTER (WHERE coalesce(p.profile_status,'DRAFT') = 'BLOCKED')
    INTO n_micro_ready, n_micro_blocked
    FROM public.microorganism_fiscal_profiles p
    JOIN public.microrganismos m ON m.id = p.microorganism_id
   WHERE coalesce(m.ativo,true);

  n_micro_ready   := coalesce(n_micro_ready,0);
  n_micro_blocked := coalesce(n_micro_blocked,0);
  n_micro_draft   := greatest(coalesce(n_micro_active,0) - n_micro_ready - n_micro_blocked, 0);

  -- Cenários reais: destinatário pronto × canal realmente usado × NCM oficial vigente.
  -- Nenhum cenário artificial com NCM NULL; nenhum produto cartesiano irrelevante.
  FOR sc IN
    WITH recipients AS (
      SELECT DISTINCT
             p.customer_id,
             upper(coalesce(p.fiscal_state, emit.state)) AS dest_uf,
             coalesce(p.final_consumer,true) AS final_consumer,
             coalesce(p.taxpayer_indicator,'9') AS ind
        FROM public.customer_fiscal_profiles p
       WHERE p.nfe_readiness_status = 'READY'
    ),
    channels AS (
      SELECT DISTINCT coalesce(fi.sales_channel,'B2B_PARTNER') AS channel
        FROM public.fiscal_invoices fi
       WHERE fi.document_model = 'NFE'
      UNION
      SELECT 'B2B_PARTNER'
    ),
    ncms AS (
      SELECT DISTINCT public.fn_fiscal_digits(mp.ncm) AS ncm
        FROM public.microorganism_fiscal_profiles mp
        JOIN public.microrganismos m ON m.id = mp.microorganism_id
       WHERE coalesce(m.ativo,true)
         AND coalesce(mp.is_active,false)
         AND coalesce(mp.profile_status,'DRAFT') = 'VALIDATED'
         AND mp.accounting_validated_at IS NOT NULL
         AND nullif(btrim(coalesce(mp.ncm,'')),'') IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM public.microorganism_regulatory_dossiers d
            WHERE d.microorganism_id = m.id
              AND d.deleted_at IS NULL
              AND d.status = 'VALIDATED'
              AND coalesce(d.effective_from, current_date) <= current_date
              AND (d.effective_to IS NULL OR d.effective_to >= current_date)
              AND nullif(btrim(coalesce(d.published_ncm,'')),'') IS NOT NULL)
    )
    SELECT r.dest_uf, r.final_consumer, r.ind, c.channel, n.ncm
      FROM recipients r CROSS JOIN channels c CROSS JOIN ncms n
  LOOP
    total := total + 1;
    ok := true;

    -- Política de operação
    BEGIN
      PERFORM public.fn_fiscal_resolve_operation('OUT', emit.state, sc.dest_uf, emit.crt,
        sc.final_consumer, sc.ind, sc.ncm, null, sc.channel, ref_date);
    EXCEPTION WHEN OTHERS THEN
      msg := coalesce(SQLERRM,'');
      code := CASE WHEN msg LIKE '%AMBIGUOUS%' THEN 'AMBIGUOUS' ELSE 'NOT_FOUND' END;
      ok := false;
      gaps := gaps || jsonb_build_object('scope','OPERACAO','destUf',sc.dest_uf,
        'finalConsumer',sc.final_consumer,'indIEDest',sc.ind,'channel',sc.channel,
        'ncm',sc.ncm,'code',code);
    END;

    kinds := ARRAY['ICMS']::text[];
    IF coalesce(emit.ipi_taxpayer,false) THEN kinds := array_append(kinds,'IPI'); END IF;
    IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'ICMS_ST'); END IF;
    IF coalesce(emit.fcp_applicable,false) THEN
      kinds := array_append(kinds,'FCP');
      IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'FCP_ST'); END IF;
    END IF;
    IF coalesce(emit.difal_responsible,false) AND sc.dest_uf <> upper(coalesce(emit.state,''))
       AND sc.final_consumer THEN kinds := array_append(kinds,'DIFAL'); END IF;
    kinds := kinds || ARRAY['PIS','COFINS']::text[];

    -- Contexto sintético NEUTRO, encadeado como no motor real. Sem persistência.
    v_icms := 0; v_ipi := 0; v_st := 0; v_base_st := NULL;

    FOREACH k IN ARRAY kinds LOOP
      code := NULL;
      BEGIN
        rule := public.fn_fiscal_resolve_tax_rule(k, emit.crt, emit.state, sc.dest_uf,
          sc.ncm, null, sc.final_consumer, sc.ind, ref_date);
      EXCEPTION WHEN OTHERS THEN
        msg := coalesce(SQLERRM,'');
        code := CASE
          WHEN msg LIKE '%ENGINE_UNAVAILABLE%' THEN 'ENGINE_UNAVAILABLE'
          WHEN msg LIKE '%AMBIGUOUS%'          THEN 'AMBIGUOUS'
          WHEN msg LIKE '%NOT_FOUND%'          THEN 'NOT_FOUND'
          ELSE 'INCOMPLETE' END;
      END;

      IF code IS NULL THEN
        ctx := jsonb_build_object(
          'produto', 1000, 'frete', 0, 'seguro', 0, 'outras', 0, 'desconto', 0,
          'ipi', v_ipi, 'icmsSt', v_st, 'icmsOwnValue', v_icms, 'baseST', v_base_st);
        code := public.fn_fiscal_rule_validate_synthetic(k, rule, ctx);

        IF code = 'OK' THEN
          BEGIN
            res := public.fn_fiscal_apply_tax_v2(rule, ctx);
            IF k = 'ICMS'    THEN v_icms := (res->>'value')::numeric; END IF;
            IF k = 'IPI'     THEN v_ipi  := (res->>'value')::numeric; END IF;
            IF k = 'ICMS_ST' THEN
              v_st := (res->>'value')::numeric;
              v_base_st := (res->'params'->>'baseST')::numeric;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            code := 'INCOMPLETE';
          END;
        END IF;
      END IF;

      IF code <> 'OK' THEN
        ok := false;
        gaps := gaps || jsonb_build_object('scope','TRIBUTO','taxKind',k,'destUf',sc.dest_uf,
          'channel',sc.channel,'ncm',sc.ncm,'code',code);
      END IF;
    END LOOP;

    IF ok THEN covered := covered + 1; END IF;
  END LOOP;

  SELECT count(DISTINCT customer_id) INTO n_recip
    FROM public.customer_fiscal_profiles WHERE nfe_readiness_status = 'READY';

  n_channel := (SELECT count(*) FROM (
                  SELECT DISTINCT coalesce(fi.sales_channel,'B2B_PARTNER') ch
                    FROM public.fiscal_invoices fi WHERE fi.document_model='NFE'
                  UNION SELECT 'B2B_PARTNER') q);

  n_ncm := CASE WHEN coalesce(n_recip,0) = 0 OR coalesce(n_channel,0) = 0
                THEN 0 ELSE total / greatest(n_recip * n_channel, 1) END;

  RETURN jsonb_build_object(
    'total', total, 'covered', covered,
    'dimensions', jsonb_build_object(
      'readyRecipients', coalesce(n_recip,0),
      'activeChannels', coalesce(n_channel,0),
      'officialNcms', coalesce(n_ncm,0)),
    'microorganisms', jsonb_build_object(
      'active', coalesce(n_micro_active,0),
      'ready', n_micro_ready,
      'draft', n_micro_draft,
      'blocked', n_micro_blocked,
      'inactive', coalesce(n_micro_inactive,0)),
    'gapCodes', jsonb_build_array('NOT_FOUND','AMBIGUOUS','INCOMPLETE','ENGINE_UNAVAILABLE'),
    'gaps', (SELECT coalesce(jsonb_agg(DISTINCT g),'[]'::jsonb) FROM jsonb_array_elements(gaps) g));
END $function$;

-- ---------------------------------------------------------------------
-- 5) PAINEL — separa ativos/prontos/rascunhos/bloqueados/inativos.
--    Inativos NUNCA bloqueiam prontidão.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_nfe_readiness_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  emit public.company_fiscal_settings%ROWTYPE;
  rec_total int; rec_ready int; pol_pub int; rules_pub int; series_cnt int;
  cert_ok boolean; pend jsonb := '[]'::jsonb;
  cov jsonb; micro jsonb;
  m_active int; m_ready int; m_draft int; m_blocked int; m_inactive int;
  emitter_status text; overall text;
BEGIN
  IF NOT public.fn_fiscal_can_read_internal() THEN
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

  cov := public.fn_fiscal_scenario_coverage();
  micro := coalesce(cov->'microorganisms','{}'::jsonb);
  m_active   := coalesce((micro->>'active')::int,0);
  m_ready    := coalesce((micro->>'ready')::int,0);
  m_draft    := coalesce((micro->>'draft')::int,0);
  m_blocked  := coalesce((micro->>'blocked')::int,0);
  m_inactive := coalesce((micro->>'inactive')::int,0);

  -- Teto absoluto da F3: nunca READY_PRODUCTION.
  emitter_status := coalesce(emit.nfe_readiness_status,'NOT_READY');
  IF emitter_status = 'READY_PRODUCTION' THEN
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
    pend := pend || jsonb_build_object('section','CERTIFICADO','code','CERTIFICATE_MISSING','severity','BLOCK','message','Certificado digital nao vinculado (apenas referencia segura; nenhum segredo e armazenado).');
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
END $function$;

-- ---------------------------------------------------------------------
-- 6) RLS — remoção das SELECT policies redundantes que, por OR, liberavam
--    técnico/parceiro/produtor nas relações fiscais F3.
--    Nenhuma policy de escrita é afrouxada.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS fcr_select  ON public.fiscal_calculation_runs;
DROP POLICY IF EXISTS fds_select  ON public.fiscal_document_series;
DROP POLICY IF EXISTS fnr_select  ON public.fiscal_number_reservations;
DROP POLICY IF EXISTS ftr_select  ON public.fiscal_tax_rules;
DROP POLICY IF EXISTS frso_select ON public.fiscal_rule_sod_overrides;
DROP POLICY IF EXISTS fop_admin_read ON public.fiscal_operation_policies;

-- Garante a policy interna única em cada relação fiscal F3.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fiscal_calculation_runs','fiscal_document_series','fiscal_number_reservations',
    'fiscal_tax_rules','fiscal_rule_sod_overrides','fiscal_operation_policies']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname='public' AND tablename=t
                      AND policyname='f3_internal_read_'||t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.fn_fiscal_can_read_internal())',
        'f3_internal_read_'||t, t);
    END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 7) FONTES OFICIAIS — URLs específicas verificadas. Nenhum código ou
--    alíquota é semeado.
-- ---------------------------------------------------------------------
UPDATE public.fiscal_official_sources SET url =
  'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=ndIjl+iEFdE%3D', updated_at = now()
 WHERE source_key = 'MOC_NFE_70';

UPDATE public.fiscal_official_sources SET url =
  'https://www.nfe.fazenda.gov.br/POrtal/listaConteudo.aspx?AspxAutoDetectCookieSupport=1&tipoConteudo=BMPFMBoln3w%3D', updated_at = now()
 WHERE source_key = 'PORTAL_NFE_SCHEMAS_NT';

UPDATE public.fiscal_official_sources SET url =
  'https://www.nfe.fazenda.gov.br/portal/WebServices.aspx/download.aspx?AspxAutoDetectCookieSupport=1', updated_at = now()
 WHERE source_key = 'PORTAL_NFE_SERVICOS_UF';

UPDATE public.fiscal_official_sources SET url =
  'https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/classificacao-fiscal-de-mercadorias/download-ncm-nomenclatura-comum-do-mercosul', updated_at = now()
 WHERE source_key = 'RFB_NCM_TIPI';

UPDATE public.fiscal_official_sources SET url =
  'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/tipi.pdf', updated_at = now()
 WHERE source_key = 'TIPI';

UPDATE public.fiscal_official_sources SET url =
  'https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/efd-icms-ipi/manuais-e-documentos-tecnicos/guia-pratico-da-efd-icms-ipi-3-2.2', updated_at = now()
 WHERE source_key = 'GUIA_EFD_ICMS_IPI_322';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.fiscal_official_sources
   WHERE url IS NULL OR url !~ '^https://' OR url ~ '^https://[^/]+/?$';
  IF n > 0 THEN
    RAISE EXCEPTION 'FISCAL_SOURCE_URL_GENERIC: % fonte(s) oficial(is) apontam para pagina generica.', n;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 8) Grants mínimos das novas funções.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_fiscal_partner_fiscal_customer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fiscal_assert_debtor_recipient(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fiscal_rule_validate_synthetic(text, public.fiscal_tax_rules, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tg_fiscal_homologation_evidence_guard() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_fiscal_partner_fiscal_customer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_assert_debtor_recipient(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_rule_validate_synthetic(text, public.fiscal_tax_rules, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_fiscal_assert_debtor_recipient(uuid) IS
  'F3.1: exige que o destinatario da NF-e B2B seja o cliente fiscal do parceiro devedor. Produtor final nunca e devedor.';
COMMENT ON FUNCTION public.fn_fiscal_scenario_coverage() IS
  'F3.1: cobertura real por cenario (destinatario pronto x canal ativo x NCM oficial vigente) validada no motor com contexto sintetico neutro.';
