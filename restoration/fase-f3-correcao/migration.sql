-- =====================================================================
-- FASE F3 — CORREÇÃO DE AUDITORIA (incremental, idempotente, promovível)
-- Alvo: staging ikaauvsflpmamgxmkhoq. Produção navfzbwgwzruipouyfnk NÃO acessada.
-- Não altera as migrations já aplicadas (20260816000000 / 20260816010000).
-- Escopo: idempotência/numeração, elegibilidade fail-closed, motor tributário
-- canônico por tax_kind, prontidão real por cenário, segurança de menor
-- privilégio. NÃO implementa XML, assinatura, transmissão, DANFE nem produção.
-- =====================================================================

SET LOCAL statement_timeout = '600s';

-- =====================================================================
-- BLOCO 0 — Helpers de competência fiscal (menor privilégio)
-- =====================================================================

-- Leitura fiscal interna: exclui tecnico_agronomo, parceiro e produtor.
CREATE OR REPLACE FUNCTION public.fn_fiscal_can_read_internal(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid,'administrador'::app_role)
    OR public.has_role(_uid,'gestor'::app_role)
    OR public.has_role(_uid,'financeiro'::app_role));
$$;
COMMENT ON FUNCTION public.fn_fiscal_can_read_internal(uuid) IS
  'F3-correcao: leitura de objetos fiscais internos (regras, reservas, calculos, snapshots). Tecnico/parceiro/produtor NAO tem acesso.';

-- Operação fiscal (calcular / reservar numeração).
CREATE OR REPLACE FUNCTION public.fn_fiscal_can_operate(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid,'administrador'::app_role)
    OR public.has_role(_uid,'gestor'::app_role)
    OR public.has_role(_uid,'financeiro'::app_role));
$$;
COMMENT ON FUNCTION public.fn_fiscal_can_operate(uuid) IS
  'F3-correcao: competencia para calcular documento e reservar numeracao NF-e 55.';

REVOKE ALL ON FUNCTION public.fn_fiscal_can_read_internal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fiscal_can_operate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_can_read_internal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_can_operate(uuid) TO authenticated, service_role;

-- =====================================================================
-- BLOCO 1 — IDEMPOTÊNCIA E NUMERAÇÃO (escopo por documento + tpEmis)
-- =====================================================================

-- 1.1 A unicidade global de idempotency_key permitia devolver a reserva de
--     OUTRO documento. Escopo correto: (fiscal_invoice_id, idempotency_key).
ALTER TABLE public.fiscal_number_reservations
  DROP CONSTRAINT IF EXISTS fnr_unique_idempotency;
DROP INDEX IF EXISTS public.fnr_unique_idempotency;

ALTER TABLE public.fiscal_number_reservations
  ALTER COLUMN fiscal_invoice_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fnr_unique_idempotency_scoped
  ON public.fiscal_number_reservations (fiscal_invoice_id, idempotency_key);

-- Unicidades preservadas explicitamente (no-op se já existirem).
CREATE UNIQUE INDEX IF NOT EXISTS fnr_unique_number
  ON public.fiscal_number_reservations (series_id, number);
CREATE UNIQUE INDEX IF NOT EXISTS fnr_unique_access_key
  ON public.fiscal_number_reservations (access_key);
CREATE UNIQUE INDEX IF NOT EXISTS fnr_unique_active_per_invoice
  ON public.fiscal_number_reservations (fiscal_invoice_id)
  WHERE status = 'RESERVED';

-- 1.2 tpEmis explícito. Nesta fase só emissão normal (1) é suportada.
ALTER TABLE public.fiscal_number_reservations
  ADD COLUMN IF NOT EXISTS tp_emis smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.fiscal_number_reservations'::regclass
                   AND conname='fnr_tp_emis_chk') THEN
    ALTER TABLE public.fiscal_number_reservations
      ADD CONSTRAINT fnr_tp_emis_chk CHECK (tp_emis = 1);
  END IF;
END $$;

COMMENT ON COLUMN public.fiscal_number_reservations.tp_emis IS
  'tpEmis do leiaute NF-e. Fase F3: apenas 1 (normal). Contingencias (2,4,5,6,7,9) permanecem BLOQUEADAS ate implementacao especifica.';

ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS tp_emis smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.fiscal_invoices'::regclass
                   AND conname='fiscal_invoices_tp_emis_chk') THEN
    ALTER TABLE public.fiscal_invoices
      ADD CONSTRAINT fiscal_invoices_tp_emis_chk CHECK (tp_emis = 1);
  END IF;
END $$;

-- 1.3 Reserva com escopo, lock determinístico e replay seguro.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_reserve_nfe_number_v1(
  p_invoice_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
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

  -- Lock do documento ANTES de qualquer efeito ou leitura de replay.
  SELECT * INTO inv FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;

  -- Chave usada em OUTRO documento => bloqueio, jamais dados alheios.
  IF EXISTS (SELECT 1 FROM public.fiscal_number_reservations r
              WHERE r.idempotency_key = p_idempotency_key
                AND r.fiscal_invoice_id <> p_invoice_id) THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave de idempotencia ja utilizada por outro documento fiscal.'
      USING HINT = 'Gere uma chave exclusiva por documento. Reservas nunca sao compartilhadas entre documentos.';
  END IF;

  -- Replay legítimo: mesma invoice + mesma chave.
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

  -- Elegibilidade reavaliada no momento da reserva (fail-closed).
  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %',
      (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'reasons';
  END IF;

  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF emit.nfe_readiness_status NOT IN ('READY_HOMOLOGATION','READY_PRODUCTION') THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_READY: emitente com pendencias %', emit.nfe_readiness_pendencies;
  END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1'
     AND emit.nfe_readiness_status <> 'READY_PRODUCTION' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao exige homologacao SEFAZ registrada.';
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

-- Imutabilidade da reserva após criação (só liberação controlada).
CREATE OR REPLACE FUNCTION public.tg_fiscal_reservation_immutable()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FISCAL_RESERVATION_IMMUTABLE: reservas de numeracao nao podem ser excluidas.';
  END IF;
  IF NEW.series_id IS DISTINCT FROM OLD.series_id
     OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.cnf IS DISTINCT FROM OLD.cnf
     OR NEW.access_key IS DISTINCT FROM OLD.access_key
     OR NEW.check_digit IS DISTINCT FROM OLD.check_digit
     OR NEW.fiscal_invoice_id IS DISTINCT FROM OLD.fiscal_invoice_id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.tp_emis IS DISTINCT FROM OLD.tp_emis THEN
    RAISE EXCEPTION 'FISCAL_RESERVATION_IMMUTABLE: numero, chave de acesso e vinculo do documento sao imutaveis.';
  END IF;
  IF OLD.status = 'RELEASED' AND NEW.status <> 'RELEASED' THEN
    RAISE EXCEPTION 'FISCAL_RESERVATION_IMMUTABLE: reserva liberada nao retorna ao estado reservado.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fiscal_reservation_immutable ON public.fiscal_number_reservations;
CREATE TRIGGER trg_fiscal_reservation_immutable
  BEFORE UPDATE OR DELETE ON public.fiscal_number_reservations
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_reservation_immutable();

-- =====================================================================
-- BLOCO 2 — ELEGIBILIDADE FISCAL FAIL-CLOSED (allowlist)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_fiscal_billing_allowed_order_status()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  -- Allowlist comprovada contra o dominio real partner_order_status.
  -- Fora desta lista NADA e elegivel (inclusive status desconhecido/novo).
  SELECT ARRAY['aprovado','em_producao','produzido','aguardando_entrega',
               'confirmado','em_separacao','enviado','entregue']::text[];
$$;
COMMENT ON FUNCTION public.fn_fiscal_billing_allowed_order_status() IS
  'F3-correcao: allowlist de status de pedido B2B que podem originar NF-e. Omissao = bloqueio.';

CREATE OR REPLACE FUNCTION public.fn_fiscal_billing_allowed_delivery_status()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$ SELECT ARRAY['entregue','confirmado']::text[]; $$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_invoice_eligibility(_source_type text, _source_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  reasons jsonb := '[]'::jsonb;
  po public.partner_orders%ROWTYPE;
  ent public.entregas%ROWTYPE;
  st text;
  v_order_id uuid;
  v_debtor uuid;
  n_items int := 0; n_quote int := 0; n_no_snapshot int := 0;
  canceled boolean := false;
  allowed text[];
BEGIN
  IF _source_type IS NULL OR _source_id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reasons',
      jsonb_build_array(jsonb_build_object('code','FISCAL_SOURCE_MISSING','severity','BLOCK',
        'message','Origem fiscal (pedido/entrega) obrigatoria.')));
  END IF;

  IF _source_type = 'PARTNER_ORDER' THEN
    SELECT * INTO po FROM public.partner_orders WHERE id = _source_id;
    IF NOT FOUND THEN
      reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_NOT_FOUND','severity','BLOCK','message','Pedido inexistente.');
    ELSE
      v_order_id := po.id;
      st := po.status::text;
      allowed := public.fn_fiscal_billing_allowed_order_status();

      IF st = 'cancelado' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_CANCELED','severity','BLOCK','message','Pedido cancelado; emissao bloqueada.');
      ELSIF st IN ('reprovado','reprovado_sem_itens') THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_REJECTED','severity','BLOCK','message','Pedido reprovado; emissao bloqueada.');
      ELSIF st = 'aguardando_cotacao' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_QUOTE_PENDING','severity','BLOCK','message','Pedido aguardando cotacao; emissao bloqueada.');
      ELSIF st = 'faturado' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_ALREADY_INVOICED','severity','BLOCK','message','Pedido ja faturado.');
      ELSIF NOT (st = ANY (allowed)) THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_STATUS_NOT_BILLABLE','severity','BLOCK',
          'message','Status do pedido nao habilitado para faturamento: '||st);
      END IF;

      -- Aprovacao comercial obrigatoria.
      IF po.approved_at IS NULL OR po.approved_by IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_COMMERCIAL_APPROVAL_MISSING','severity','BLOCK',
          'message','Pedido sem aprovacao comercial registrada.');
      END IF;

      -- Aprovacao financeira quando exigida.
      IF coalesce(po.requires_financial_approval,false)
         AND coalesce(po.financial_approval_status,'pending') <> 'approved' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_FINANCIAL_APPROVAL_MISSING','severity','BLOCK',
          'message','Pedido exige aprovacao financeira e ela nao foi concedida.');
      END IF;

      -- Condicao de pagamento aceita/definida.
      IF coalesce(po.payment_condition_status,'') NOT IN ('defined','accepted','aceita') THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_PAYMENT_CONDITION_NOT_ACCEPTED','severity','BLOCK',
          'message','Condicao de pagamento nao aceita/definida.');
      END IF;

      -- Devedor correto: parceiro B2B, nunca o produtor final vinculado.
      IF po.partner_id IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DEBTOR_UNRESOLVED','severity','BLOCK',
          'message','Parceiro devedor do pedido nao identificado.');
      ELSE
        v_debtor := po.partner_id;
      END IF;

      -- Snapshot de preco/condicao e ausencia de itens sob consulta.
      SELECT count(*),
             count(*) FILTER (WHERE coalesce(pricing_mode_snapshot,'') = 'quote_only'),
             count(*) FILTER (WHERE preco_unitario_final_snapshot IS NULL
                                 OR price_source_snapshot IS NULL)
        INTO n_items, n_quote, n_no_snapshot
        FROM public.partner_order_items WHERE order_id = _source_id;

      IF n_items = 0 THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_NO_ITEMS','severity','BLOCK','message','Pedido sem itens.');
      END IF;
      IF n_quote > 0 THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_QUOTE_ONLY_BLOCKED','severity','BLOCK',
          'message','Pedido possui itens sob consulta (quote_only); emissao bloqueada sem efeito colateral.');
      END IF;
      IF n_no_snapshot > 0 THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_PRICE_SNAPSHOT_MISSING','severity','BLOCK',
          'message','Itens sem snapshot de preco/condicao comercial.');
      END IF;
    END IF;

  ELSIF _source_type = 'ENTREGA' THEN
    SELECT * INTO ent FROM public.entregas WHERE id = _source_id;
    IF NOT FOUND THEN
      reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_NOT_FOUND','severity','BLOCK','message','Entrega inexistente.');
    ELSE
      IF ent.cancelada_em IS NOT NULL OR coalesce(ent.status,'') = 'cancelada'
         OR coalesce(ent.financial_status,'') = 'CANCELED' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_CANCELED','severity','BLOCK','message','Entrega cancelada.');
      END IF;
      IF NOT (coalesce(ent.status,'') = ANY (public.fn_fiscal_billing_allowed_delivery_status())) THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_NOT_COMPLETED','severity','BLOCK',
          'message','Entrega nao concluida/aceita. Status atual: '||coalesce(ent.status,'-'));
      END IF;
      IF ent.recebimento_confirmado_em IS NULL AND ent.confirmada_em IS NULL AND ent.entregue_em IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_RECEIPT_MISSING','severity','BLOCK',
          'message','Entrega sem aceite/recebimento registrado.');
      END IF;
      IF ent.partner_order_id IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_ORDER_LINK_MISSING','severity','BLOCK',
          'message','Entrega sem vinculo inequivoco a pedido B2B.');
      ELSE
        v_order_id := ent.partner_order_id;
        SELECT partner_id, status::text INTO v_debtor, st FROM public.partner_orders WHERE id = ent.partner_order_id;
        IF v_debtor IS NULL THEN
          reasons := reasons || jsonb_build_object('code','FISCAL_DEBTOR_UNRESOLVED','severity','BLOCK',
            'message','Parceiro devedor da entrega nao identificado.');
        END IF;
        IF st IS NULL OR NOT (st = ANY (public.fn_fiscal_billing_allowed_order_status())) THEN
          reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_STATUS_NOT_BILLABLE','severity','BLOCK',
            'message','Pedido vinculado a entrega nao esta habilitado para faturamento: '||coalesce(st,'-'));
        END IF;
      END IF;
    END IF;

  ELSE
    reasons := reasons || jsonb_build_object('code','FISCAL_SOURCE_TYPE_UNSUPPORTED','severity','BLOCK',
      'message','Escopo fiscal nao suportado nesta fase: '||_source_type);
  END IF;

  -- Duplicidade fiscal: documento vivo para a mesma origem.
  IF EXISTS (SELECT 1 FROM public.fiscal_invoices fi
             WHERE fi.source_type = _source_type AND fi.source_id = _source_id
               AND fi.document_model = 'NFE'
               AND fi.status NOT IN ('CANCELED','REJECTED')
               AND fi.access_key IS NOT NULL) THEN
    reasons := reasons || jsonb_build_object('code','FISCAL_DUPLICATE_DOCUMENT','severity','BLOCK',
      'message','Ja existe documento fiscal vigente para esta origem.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_invoices fi
    WHERE fi.source_type = _source_type AND fi.source_id = _source_id
      AND fi.document_model = 'NFE' AND fi.status = 'CANCELED') INTO canceled;

  RETURN jsonb_build_object(
    'eligible', jsonb_array_length(reasons) = 0,
    'reasons', reasons,
    'sourceType', _source_type,
    'orderId', v_order_id,
    'debtorPartnerId', v_debtor,
    'has_canceled_history', canceled);
END $function$;

COMMENT ON FUNCTION public.fn_fiscal_invoice_eligibility(text,uuid) IS
  'F3-correcao: elegibilidade fiscal fail-closed por allowlist. Status desconhecido, cancelado, reprovado, em cotacao, quote_only, sem aprovacao ou entrega nao concluida sao SEMPRE bloqueados, sem efeito colateral.';

-- =====================================================================
-- BLOCO 3 — MOTOR TRIBUTÁRIO CANÔNICO POR TAX_KIND
-- =====================================================================

-- 3.1 Parâmetros que faltavam para ST / FCP / DIFAL e componentes de base.
ALTER TABLE public.fiscal_tax_rules
  ADD COLUMN IF NOT EXISTS st_modality text,
  ADD COLUMN IF NOT EXISTS internal_rate_pct numeric,
  ADD COLUMN IF NOT EXISTS interstate_rate_pct numeric,
  ADD COLUMN IF NOT EXISTS fcp_st_rate numeric,
  ADD COLUMN IF NOT EXISTS credit_own_icms boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS base_components jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.fiscal_tax_rules.base_components IS
  'F3-correcao: componentes da base explicitos por regra. Valores aceitos: PRODUTO, FRETE, SEGURO, OUTRAS_DESPESAS, DESCONTO, IPI, ICMS_ST. Nada e presumido.';
COMMENT ON COLUMN public.fiscal_tax_rules.st_modality IS
  'Modalidade de determinacao da BC ST (modBCST): MVA, PAUTA, PRECO_TABELADO, VALOR_OPERACAO. Fase F3 calcula MVA.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.fiscal_tax_rules'::regclass AND conname='ftr_base_components_chk') THEN
    ALTER TABLE public.fiscal_tax_rules ADD CONSTRAINT ftr_base_components_chk
      CHECK (jsonb_typeof(base_components) = 'array'
             AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(base_components) c
               WHERE c NOT IN ('PRODUTO','FRETE','SEGURO','OUTRAS_DESPESAS','DESCONTO','IPI','ICMS_ST')));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.fiscal_tax_rules'::regclass AND conname='ftr_st_modality_chk') THEN
    ALTER TABLE public.fiscal_tax_rules ADD CONSTRAINT ftr_st_modality_chk
      CHECK (st_modality IS NULL OR st_modality IN ('MVA','PAUTA','PRECO_TABELADO','VALOR_OPERACAO'));
  END IF;

  -- Coerencia CRT: 1/2 (Simples) usam CSOSN; 3/4 (Normal) usam CST de ICMS.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.fiscal_tax_rules'::regclass AND conname='ftr_crt_cst_csosn_chk') THEN
    ALTER TABLE public.fiscal_tax_rules ADD CONSTRAINT ftr_crt_cst_csosn_chk CHECK (
      tax_kind NOT IN ('ICMS','ICMS_ST')
      OR crt IS NULL
      OR (crt IN ('1','2') AND csosn IS NOT NULL AND cst IS NULL)
      OR (crt IN ('3','4') AND cst IS NOT NULL AND csosn IS NULL));
  END IF;

  -- PIS/COFINS/IPI nunca usam CSOSN.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.fiscal_tax_rules'::regclass AND conname='ftr_non_icms_csosn_chk') THEN
    ALTER TABLE public.fiscal_tax_rules ADD CONSTRAINT ftr_non_icms_csosn_chk
      CHECK (tax_kind NOT IN ('PIS','COFINS','IPI') OR csosn IS NULL);
  END IF;

  -- Tributos da reforma permanecem scaffolding bloqueado.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.fiscal_tax_rules'::regclass AND conname='ftr_rtc_not_publishable_chk') THEN
    ALTER TABLE public.fiscal_tax_rules ADD CONSTRAINT ftr_rtc_not_publishable_chk
      CHECK (tax_kind NOT IN ('IBS','CBS','IS') OR status <> 'PUBLISHED');
  END IF;
END $$;

-- 3.2 Base do item por componentes declarados na regra.
CREATE OR REPLACE FUNCTION public.fn_fiscal_item_base(_components jsonb, _ctx jsonb)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE v numeric := 0; c text;
BEGIN
  IF _components IS NULL OR jsonb_array_length(_components) = 0 THEN
    RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: regra sem componentes de base declarados (base_components).'
      USING HINT = 'Declare explicitamente PRODUTO/FRETE/SEGURO/OUTRAS_DESPESAS/DESCONTO/IPI/ICMS_ST conforme base legal publicada.';
  END IF;
  FOR c IN SELECT jsonb_array_elements_text(_components) LOOP
    v := v + CASE c
      WHEN 'PRODUTO'          THEN coalesce((_ctx->>'produto')::numeric,0)
      WHEN 'FRETE'            THEN coalesce((_ctx->>'frete')::numeric,0)
      WHEN 'SEGURO'           THEN coalesce((_ctx->>'seguro')::numeric,0)
      WHEN 'OUTRAS_DESPESAS'  THEN coalesce((_ctx->>'outras')::numeric,0)
      WHEN 'DESCONTO'         THEN -coalesce((_ctx->>'desconto')::numeric,0)
      WHEN 'IPI'              THEN coalesce((_ctx->>'ipi')::numeric,0)
      WHEN 'ICMS_ST'          THEN coalesce((_ctx->>'icmsSt')::numeric,0)
      ELSE 0 END;
  END LOOP;
  RETURN public.fn_fiscal_round(v);
END $$;

-- 3.3 Cálculo canônico por tributo. Parâmetro ausente => bloqueio explícito.
CREATE OR REPLACE FUNCTION public.fn_fiscal_apply_tax_v2(
  r public.fiscal_tax_rules, _ctx jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  base_raw numeric; base_eff numeric; val numeric := 0;
  extra jsonb := '{}'::jsonb;
  icms_own numeric; base_st numeric; v_st numeric;
  r_int numeric; r_inter numeric; share numeric;
  v_difal_dest numeric; v_difal_orig numeric; v_fcp numeric;
BEGIN
  IF r.tax_kind IN ('IBS','CBS','IS') THEN
    RAISE EXCEPTION 'FISCAL_RTC_ENGINE_UNAVAILABLE: IBS/CBS/IS permanecem em scaffolding bloqueado ate regra e leiaute oficiais.'
      USING HINT = 'Nao simule tributos da reforma como se fossem vigentes.';
  END IF;

  base_raw := public.fn_fiscal_item_base(r.base_components, _ctx);
  IF base_raw < 0 THEN
    RAISE EXCEPTION 'FISCAL_TAX_BASE_NEGATIVE: base negativa para tributo %.', r.tax_kind;
  END IF;
  base_eff := public.fn_fiscal_round(base_raw * (1 - coalesce(r.base_reduction_pct,0)/100));

  IF r.calc_mode = 'EXEMPT' OR r.calc_mode = 'NOT_TAXED' THEN
    -- Modo documentado: preserva base/CST/motivo; nao apaga informacao exigida no leiaute.
    IF nullif(btrim(coalesce(r.justification,'')),'') IS NULL
       OR nullif(btrim(coalesce(r.legal_basis,'')),'') IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: modo % exige motivo e base legal documentados.', r.calc_mode;
    END IF;
    val := 0;

  ELSIF r.calc_mode <> 'PERCENT' THEN
    RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: calc_mode % nao suportado pelo motor F3.', r.calc_mode;

  ELSIF r.tax_kind IN ('ICMS','PIS','COFINS','IPI') THEN
    IF r.rate IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: aliquota ausente para tributo %.', r.tax_kind;
    END IF;
    val := public.fn_fiscal_round(base_eff * r.rate / 100);
    IF coalesce(r.deferral_pct,0) > 0 THEN
      extra := extra || jsonb_build_object('deferredValue',
        public.fn_fiscal_round(val * r.deferral_pct / 100));
      val := public.fn_fiscal_round(val * (1 - r.deferral_pct/100));
    END IF;

  ELSIF r.tax_kind = 'ICMS_ST' THEN
    IF coalesce(r.st_modality,'MVA') <> 'MVA' THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: modalidade de BC ST % nao implementada nesta fase.', r.st_modality;
    END IF;
    IF r.mva_pct IS NULL OR r.internal_rate_pct IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: ICMS-ST exige mva_pct e internal_rate_pct.';
    END IF;
    icms_own := coalesce((_ctx->>'icmsOwnValue')::numeric, 0);
    base_st := public.fn_fiscal_round(base_eff * (1 + r.mva_pct/100));
    v_st := public.fn_fiscal_round(base_st * r.internal_rate_pct / 100);
    IF coalesce(r.credit_own_icms,true) THEN
      v_st := public.fn_fiscal_round(v_st - icms_own);
    END IF;
    IF v_st < 0 THEN v_st := 0; END IF;
    val := v_st;
    extra := extra || jsonb_build_object('modBCST', r.st_modality, 'baseST', base_st,
      'internalRatePct', r.internal_rate_pct, 'mvaPct', r.mva_pct,
      'creditedOwnIcms', coalesce(r.credit_own_icms,true), 'ownIcmsValue', icms_own);

  ELSIF r.tax_kind IN ('FCP','FCP_ST') THEN
    IF r.fcp_rate IS NULL AND r.fcp_st_rate IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: FCP exige aliquota propria (fcp_rate/fcp_st_rate).';
    END IF;
    IF r.tax_kind = 'FCP' THEN
      IF r.fcp_rate IS NULL THEN
        RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: FCP exige fcp_rate.';
      END IF;
      val := public.fn_fiscal_round(base_eff * r.fcp_rate / 100);
      extra := extra || jsonb_build_object('fcpBase', base_eff, 'fcpRate', r.fcp_rate);
    ELSE
      IF r.fcp_st_rate IS NULL THEN
        RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: FCP-ST exige fcp_st_rate.';
      END IF;
      base_st := coalesce((_ctx->>'baseST')::numeric, null);
      IF base_st IS NULL THEN
        RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: FCP-ST exige base de ST previamente apurada.';
      END IF;
      val := public.fn_fiscal_round(base_st * r.fcp_st_rate / 100);
      extra := extra || jsonb_build_object('fcpStBase', base_st, 'fcpStRate', r.fcp_st_rate);
    END IF;

  ELSIF r.tax_kind = 'DIFAL' THEN
    r_int := r.internal_rate_pct; r_inter := r.interstate_rate_pct;
    share := r.difal_dest_share_pct;
    IF r_int IS NULL OR r_inter IS NULL OR share IS NULL THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: DIFAL exige internal_rate_pct, interstate_rate_pct e difal_dest_share_pct.';
    END IF;
    IF r_int < r_inter THEN
      RAISE EXCEPTION 'FISCAL_TAX_RULE_INCOMPLETE: aliquota interna do destino menor que a interestadual; parametros incoerentes.';
    END IF;
    val := public.fn_fiscal_round(base_eff * (r_int - r_inter) / 100);
    v_difal_dest := public.fn_fiscal_round(val * share / 100);
    v_difal_orig := public.fn_fiscal_round(val - v_difal_dest);
    v_fcp := CASE WHEN r.fcp_rate IS NULL THEN NULL
                  ELSE public.fn_fiscal_round(base_eff * r.fcp_rate / 100) END;
    extra := extra || jsonb_build_object(
      'internalRatePct', r_int, 'interstateRatePct', r_inter,
      'destSharePct', share, 'valueDestination', v_difal_dest,
      'valueOrigin', v_difal_orig, 'fcpValue', v_fcp);

  ELSE
    RAISE EXCEPTION 'FISCAL_TAX_KIND_UNSUPPORTED: tributo % sem formula canonica implementada.', r.tax_kind;
  END IF;

  RETURN jsonb_build_object(
    'taxKind', r.tax_kind, 'calcMode', r.calc_mode, 'formula', 'F3.2/'||r.tax_kind,
    'ruleId', r.id, 'ruleKey', r.rule_key, 'ruleVersion', r.version,
    'sourceId', r.source_id, 'legalBasis', r.legal_basis, 'legalVersion', r.legal_version,
    'justification', r.justification,
    'cst', r.cst, 'csosn', r.csosn, 'crt', r.crt,
    'rate', r.rate, 'baseReductionPct', r.base_reduction_pct, 'deferralPct', r.deferral_pct,
    'baseComponents', r.base_components,
    'baseOriginal', base_raw, 'base', base_eff, 'value', val,
    'params', extra);
END $function$;

-- 3.4 Resolvedores com bloqueio de ambiguidade.
CREATE OR REPLACE FUNCTION public.fn_fiscal_resolve_tax_rule(
  _tax_kind text, _crt text, _origin_uf text, _destination_uf text, _ncm text,
  _product_category text, _final_consumer boolean, _taxpayer_indicator text,
  _ref_date date DEFAULT CURRENT_DATE)
RETURNS public.fiscal_tax_rules
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE r public.fiscal_tax_rules%ROWTYPE; n_tie int;
BEGIN
  IF _tax_kind IN ('IBS','CBS','IS') THEN
    RAISE EXCEPTION 'FISCAL_RTC_ENGINE_UNAVAILABLE: tributo % nao possui engine compativel nesta fase.', _tax_kind;
  END IF;

  WITH cand AS (
    SELECT t.*,
           row_number() OVER (ORDER BY t.priority ASC,
             (t.ncm_prefix IS NOT NULL) DESC, (t.destination_uf IS NOT NULL) DESC,
             (t.origin_uf IS NOT NULL) DESC, t.valid_from DESC, t.version DESC) AS rn,
           t.priority AS p_ord,
           (t.ncm_prefix IS NOT NULL) AS s_ncm,
           (t.destination_uf IS NOT NULL) AS s_dest,
           (t.origin_uf IS NOT NULL) AS s_orig
      FROM public.fiscal_tax_rules t
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
  )
  SELECT count(*) INTO n_tie
    FROM cand
   WHERE (p_ord, s_ncm, s_dest, s_orig, valid_from)
       = (SELECT p_ord, s_ncm, s_dest, s_orig, valid_from FROM cand WHERE rn = 1);

  IF n_tie IS NULL OR n_tie = 0 THEN
    RAISE EXCEPTION 'FISCAL_TAX_RULE_NOT_FOUND: sem regra publicada para tributo=% crt=% origem=% destino=% ncm=%',
      _tax_kind, _crt, _origin_uf, _destination_uf, coalesce(_ncm,'-')
      USING HINT = 'Cadastre a regra com CST/CSOSN, parametros do tributo, base legal e fonte oficial, e publique-a. Ausencia de regra nunca e isencao.';
  END IF;
  IF n_tie > 1 THEN
    RAISE EXCEPTION 'FISCAL_TAX_RULE_AMBIGUOUS: % regras publicadas com a mesma precedencia efetiva para tributo=% origem=% destino=%.',
      n_tie, _tax_kind, _origin_uf, _destination_uf
      USING HINT = 'Ajuste priority/vigencia/especificidade. O motor nunca escolhe silenciosamente.';
  END IF;

  SELECT * INTO r FROM public.fiscal_tax_rules t
   WHERE t.status = 'PUBLISHED' AND t.tax_kind = _tax_kind
     AND (t.crt IS NULL OR t.crt = _crt)
     AND (t.origin_uf IS NULL OR t.origin_uf = upper(_origin_uf))
     AND (t.destination_uf IS NULL OR t.destination_uf = upper(_destination_uf))
     AND (t.ncm_prefix IS NULL OR public.fn_fiscal_digits(_ncm) LIKE t.ncm_prefix || '%')
     AND (t.product_category IS NULL OR t.product_category = _product_category)
     AND (t.final_consumer IS NULL OR t.final_consumer = _final_consumer)
     AND (t.taxpayer_indicator IS NULL OR t.taxpayer_indicator = _taxpayer_indicator)
     AND t.valid_from <= _ref_date
     AND (t.valid_until IS NULL OR t.valid_until >= _ref_date)
   ORDER BY t.priority ASC, (t.ncm_prefix IS NOT NULL) DESC,
            (t.destination_uf IS NOT NULL) DESC, (t.origin_uf IS NOT NULL) DESC,
            t.valid_from DESC, t.version DESC
   LIMIT 1;

  -- Coerencia CRT em tempo de resolucao (defesa adicional a constraint).
  IF r.tax_kind IN ('ICMS','ICMS_ST') AND _crt IS NOT NULL THEN
    IF _crt IN ('1','2') AND r.csosn IS NULL THEN
      RAISE EXCEPTION 'FISCAL_CRT_INCOHERENT: emitente CRT % exige CSOSN na regra de %.', _crt, r.tax_kind;
    END IF;
    IF _crt IN ('3','4') AND r.cst IS NULL THEN
      RAISE EXCEPTION 'FISCAL_CRT_INCOHERENT: emitente CRT % exige CST de ICMS na regra de %.', _crt, r.tax_kind;
    END IF;
  END IF;

  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_resolve_operation(
  _direction text, _origin_uf text, _destination_uf text, _crt text,
  _final_consumer boolean, _taxpayer_indicator text, _ncm text,
  _product_category text, _sales_channel text, _ref_date date DEFAULT CURRENT_DATE)
RETURNS public.fiscal_operation_policies
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE p public.fiscal_operation_policies%ROWTYPE; n_tie int;
BEGIN
  WITH cand AS (
    SELECT f.*,
           row_number() OVER (ORDER BY f.priority ASC,
             (f.ncm_prefix IS NOT NULL) DESC, (f.destination_uf IS NOT NULL) DESC,
             (f.origin_uf IS NOT NULL) DESC, (f.taxpayer_indicator IS NOT NULL) DESC,
             (f.final_consumer IS NOT NULL) DESC, f.valid_from DESC) AS rn,
           f.priority AS p_ord,
           (f.ncm_prefix IS NOT NULL) AS s_ncm,
           (f.destination_uf IS NOT NULL) AS s_dest,
           (f.origin_uf IS NOT NULL) AS s_orig,
           (f.taxpayer_indicator IS NOT NULL) AS s_ind,
           (f.final_consumer IS NOT NULL) AS s_fc
      FROM public.fiscal_operation_policies f
     WHERE f.policy_status = 'PUBLISHED' AND f.document_model = '55' AND f.active IS TRUE
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
  )
  SELECT count(*) INTO n_tie
    FROM cand
   WHERE (p_ord, s_ncm, s_dest, s_orig, s_ind, s_fc, valid_from)
       = (SELECT p_ord, s_ncm, s_dest, s_orig, s_ind, s_fc, valid_from FROM cand WHERE rn = 1);

  IF n_tie IS NULL OR n_tie = 0 THEN
    RAISE EXCEPTION 'FISCAL_OPERATION_POLICY_NOT_FOUND: sem politica publicada para direcao=% origem=% destino=% crt=% consumidorFinal=% indIEDest=% ncm=%',
      _direction, _origin_uf, _destination_uf, _crt, _final_consumer, _taxpayer_indicator, coalesce(_ncm,'-')
      USING HINT = 'Cadastre e publique a politica de operacao com CFOP, natureza, base legal e fonte oficial.';
  END IF;
  IF n_tie > 1 THEN
    RAISE EXCEPTION 'FISCAL_OPERATION_POLICY_AMBIGUOUS: % politicas publicadas com a mesma precedencia efetiva (origem=%, destino=%).',
      n_tie, _origin_uf, _destination_uf
      USING HINT = 'Resolva a ambiguidade por priority/vigencia/especificidade antes de emitir.';
  END IF;

  SELECT * INTO p FROM public.fiscal_operation_policies f
   WHERE f.policy_status = 'PUBLISHED' AND f.document_model = '55' AND f.active IS TRUE
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
   ORDER BY f.priority ASC, (f.ncm_prefix IS NOT NULL) DESC,
            (f.destination_uf IS NOT NULL) DESC, (f.origin_uf IS NOT NULL) DESC,
            (f.taxpayer_indicator IS NOT NULL) DESC, (f.final_consumer IS NOT NULL) DESC,
            f.valid_from DESC
   LIMIT 1;
  RETURN p;
END $function$;

-- 3.5 Motor de cálculo do documento (ordem canônica e snapshots completos).
CREATE OR REPLACE FUNCTION public.rpc_fiscal_calculate_invoice_v1(
  p_invoice_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  it record; pol public.fiscal_operation_policies%ROWTYPE; rule public.fiscal_tax_rules%ROWTYPE;
  item_taxes jsonb; item_snapshot jsonb; ctx jsonb; res jsonb;
  totals jsonb; existing jsonb;
  t_icms numeric := 0; t_st numeric := 0; t_fcp numeric := 0; t_difal numeric := 0;
  t_pis numeric := 0; t_cofins numeric := 0; t_ipi numeric := 0;
  t_prod numeric := 0; t_desc numeric := 0; t_frete numeric := 0; t_seg numeric := 0; t_outros numeric := 0;
  t_nf numeric := 0; n_items int := 0; ref_date date; kinds text[]; k text;
  v_prod numeric; v_icms_own numeric; v_ipi numeric; v_base_st numeric;
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

    v_prod := public.fn_fiscal_round(coalesce(it.gross_value, it.quantity * it.unit_value));

    pol := public.fn_fiscal_resolve_operation(
      coalesce(inv.direction,'OUT'), emit.state, coalesce(dest.fiscal_state, emit.state), emit.crt,
      dest.final_consumer, dest.taxpayer_indicator, it.ncm_snapshot, null, inv.sales_channel, ref_date);

    -- Ordem canonica: ICMS -> IPI -> ICMS_ST -> FCP/FCP_ST -> DIFAL -> PIS/COFINS.
    kinds := ARRAY['ICMS']::text[];
    IF coalesce(emit.ipi_taxpayer,false) THEN kinds := array_append(kinds,'IPI'); END IF;
    IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'ICMS_ST'); END IF;
    IF coalesce(emit.fcp_applicable,false) THEN kinds := array_append(kinds,'FCP'); END IF;
    IF coalesce(emit.difal_responsible,false)
       AND upper(coalesce(dest.fiscal_state,'')) <> upper(coalesce(emit.state,''))
       AND coalesce(dest.final_consumer,true) THEN
      kinds := array_append(kinds,'DIFAL');
    END IF;
    kinds := kinds || ARRAY['PIS','COFINS']::text[];

    item_taxes := '{}'::jsonb;
    v_icms_own := 0; v_ipi := 0; v_base_st := NULL;

    FOREACH k IN ARRAY kinds LOOP
      ctx := jsonb_build_object(
        'produto', v_prod,
        'frete', public.fn_fiscal_round(coalesce(it.freight_value,0)),
        'seguro', public.fn_fiscal_round(coalesce(it.insurance_value,0)),
        'outras', public.fn_fiscal_round(coalesce(it.other_value,0)),
        'desconto', public.fn_fiscal_round(coalesce(it.discount_value,0)),
        'ipi', v_ipi,
        'icmsSt', 0,
        'icmsOwnValue', v_icms_own,
        'baseST', v_base_st);

      rule := public.fn_fiscal_resolve_tax_rule(k, emit.crt, emit.state,
        coalesce(dest.fiscal_state, emit.state), it.ncm_snapshot, null,
        dest.final_consumer, dest.taxpayer_indicator, ref_date);
      res := public.fn_fiscal_apply_tax_v2(rule, ctx);
      item_taxes := item_taxes || jsonb_build_object(k, res);

      IF k = 'ICMS'    THEN v_icms_own := (res->>'value')::numeric; END IF;
      IF k = 'IPI'     THEN v_ipi := (res->>'value')::numeric; END IF;
      IF k = 'ICMS_ST' THEN v_base_st := (res->'params'->>'baseST')::numeric; END IF;
    END LOOP;

    t_prod   := t_prod + v_prod;
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
      'engineVersion','F3.2',
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

  t_nf := public.fn_fiscal_round(t_prod - t_desc + t_frete + t_seg + t_outros + t_st + t_ipi);

  IF inv.total_amount IS NOT NULL AND abs(inv.total_amount - t_nf) > 0.01 THEN
    RAISE EXCEPTION 'FISCAL_TOTAL_MISMATCH: total informado % difere do total calculado %', inv.total_amount, t_nf;
  END IF;

  totals := jsonb_build_object(
    'engineVersion','F3.2', 'roundingMode','HALF_UP_2',
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

  INSERT INTO public.fiscal_calculation_runs (fiscal_invoice_id, idempotency_key, engine_version, result, created_by)
  VALUES (p_invoice_id, p_idempotency_key, 'F3.2', totals, auth.uid());

  RETURN totals || jsonb_build_object('idempotentReplay', false);
END $function$;

-- fn_fiscal_apply_tax legado deixa de ser utilizável (evita fórmula genérica).
CREATE OR REPLACE FUNCTION public.fn_fiscal_apply_tax(r public.fiscal_tax_rules, _base numeric)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RAISE EXCEPTION 'FISCAL_ENGINE_DEPRECATED: fn_fiscal_apply_tax foi substituida por fn_fiscal_apply_tax_v2 (formulas canonicas por tributo).';
END $$;

-- =====================================================================
-- BLOCO 4 — PRONTIDÃO REAL (cobertura por cenário + teto de homologação)
-- =====================================================================

ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS sefaz_homologation_at timestamptz,
  ADD COLUMN IF NOT EXISTS sefaz_homologation_evidence jsonb;

COMMENT ON COLUMN public.company_fiscal_settings.sefaz_homologation_at IS
  'F3-correcao: data do aceite de homologacao SEFAZ registrado. Sem este registro o maximo permitido e READY_HOMOLOGATION.';

-- Nunca aceitar segredo em metadados de certificado/homologacao.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.company_fiscal_settings'::regclass
                   AND conname='cfs_homologation_no_secret_chk') THEN
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_homologation_no_secret_chk
      CHECK (sefaz_homologation_evidence IS NULL
             OR NOT public.fiscal_json_has_sensitive_key(sefaz_homologation_evidence));
  END IF;
END $$;

-- Cobertura efetiva de cenários (origem/destino, CRT, NCM, consumidor, canal).
CREATE OR REPLACE FUNCTION public.fn_fiscal_scenario_coverage()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  emit public.company_fiscal_settings%ROWTYPE;
  sc record; total int := 0; covered int := 0;
  gaps jsonb := '[]'::jsonb; ref_date date := current_date;
  ok boolean; k text; kinds text[];
BEGIN
  SELECT * INTO emit FROM public.company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('total',0,'covered',0,'gaps',
      jsonb_build_array(jsonb_build_object('code','EMITTER_NOT_CONFIGURED')));
  END IF;

  FOR sc IN
    SELECT DISTINCT
           upper(coalesce(p.fiscal_state, emit.state)) AS dest_uf,
           coalesce(p.final_consumer,true) AS final_consumer,
           coalesce(p.taxpayer_indicator,'9') AS ind,
           coalesce(fi.sales_channel,'B2B_PARTNER') AS channel,
           mp.ncm AS ncm
      FROM public.customer_fiscal_profiles p
      LEFT JOIN public.fiscal_invoices fi ON fi.customer_id = p.customer_id
      CROSS JOIN LATERAL (
        SELECT ncm FROM public.microorganism_fiscal_profiles WHERE ncm IS NOT NULL
        UNION ALL SELECT NULL::text
        LIMIT 25) mp
     WHERE p.nfe_readiness_status = 'READY'
  LOOP
    total := total + 1;
    ok := true;
    BEGIN
      PERFORM public.fn_fiscal_resolve_operation('OUT', emit.state, sc.dest_uf, emit.crt,
        sc.final_consumer, sc.ind, sc.ncm, null, sc.channel, ref_date);
    EXCEPTION WHEN OTHERS THEN
      ok := false;
      gaps := gaps || jsonb_build_object('scope','OPERACAO','destUf',sc.dest_uf,
        'finalConsumer',sc.final_consumer,'indIEDest',sc.ind,'channel',sc.channel,
        'ncm',sc.ncm,'code','OPERATION_POLICY_MISSING');
    END;

    kinds := ARRAY['ICMS','PIS','COFINS']::text[];
    IF coalesce(emit.ipi_taxpayer,false) THEN kinds := array_append(kinds,'IPI'); END IF;
    IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'ICMS_ST'); END IF;
    IF coalesce(emit.fcp_applicable,false) THEN kinds := array_append(kinds,'FCP'); END IF;
    IF coalesce(emit.difal_responsible,false) AND sc.dest_uf <> upper(coalesce(emit.state,''))
       AND sc.final_consumer THEN kinds := array_append(kinds,'DIFAL'); END IF;

    FOREACH k IN ARRAY kinds LOOP
      BEGIN
        PERFORM public.fn_fiscal_resolve_tax_rule(k, emit.crt, emit.state, sc.dest_uf,
          sc.ncm, null, sc.final_consumer, sc.ind, ref_date);
      EXCEPTION WHEN OTHERS THEN
        ok := false;
        gaps := gaps || jsonb_build_object('scope','TRIBUTO','taxKind',k,'destUf',sc.dest_uf,
          'ncm',sc.ncm,'code','TAX_RULE_MISSING_OR_AMBIGUOUS');
      END;
    END LOOP;

    IF ok THEN covered := covered + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('total', total, 'covered', covered,
    'gaps', (SELECT coalesce(jsonb_agg(DISTINCT g),'[]'::jsonb) FROM jsonb_array_elements(gaps) g));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_nfe_readiness_v1()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  emit public.company_fiscal_settings%ROWTYPE;
  rec_total int; rec_ready int; pol_pub int; rules_pub int; series_cnt int;
  cert_ok boolean; pend jsonb := '[]'::jsonb;
  cov jsonb; micro_total int; micro_ready int; micro_draft int;
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

  SELECT count(*) INTO micro_total FROM public.microrganismos;
  SELECT count(*) FILTER (WHERE coalesce(p.profile_status,'DRAFT') = 'APPROVED'
                            AND p.accounting_validated_at IS NOT NULL)
    INTO micro_ready FROM public.microorganism_fiscal_profiles p;
  micro_ready := coalesce(micro_ready,0);
  micro_draft := micro_total - micro_ready;

  cov := public.fn_fiscal_scenario_coverage();

  -- Emitente: teto READY_HOMOLOGATION enquanto nao houver homologacao SEFAZ registrada.
  emitter_status := coalesce(emit.nfe_readiness_status,'NOT_READY');
  IF emitter_status = 'READY_PRODUCTION' AND emit.sefaz_homologation_at IS NULL THEN
    emitter_status := 'READY_HOMOLOGATION';
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','SEFAZ_HOMOLOGATION_NOT_RECORDED',
      'severity','BLOCK','message','Producao bloqueada: homologacao SEFAZ nao registrada. Maximo permitido nesta fase: READY_HOMOLOGATION.');
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

  -- Cobertura efetiva substitui a checagem "existe alguma regra generica".
  IF coalesce((cov->>'total')::int,0) = 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','COVERAGE_NO_SCENARIOS','severity','BLOCK',
      'message','Nao ha cenarios reais (destinatario pronto x item) para aferir cobertura tributaria.');
  ELSIF (cov->>'covered')::int < (cov->>'total')::int THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','COVERAGE_INCOMPLETE','severity','BLOCK',
      'message','Cobertura tributaria incompleta: '||(cov->>'covered')||' de '||(cov->>'total')||' cenarios resolvidos.');
  END IF;

  IF micro_ready < micro_total THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','MICROORGANISMS_NOT_READY','severity','BLOCK',
      'message', micro_draft||' de '||micro_total||' microrganismos sem dossie aprovado e validacao contabil.');
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
      'accountingValidated', emit.accounting_validated_at IS NOT NULL),
    'recipients', jsonb_build_object('total', rec_total, 'ready', rec_ready),
    'operations', jsonb_build_object('publishedPolicies', pol_pub),
    'taxes', jsonb_build_object('publishedRules', rules_pub, 'missingMandatoryKinds', '[]'::jsonb),
    'coverage', cov,
    'microorganisms', jsonb_build_object('total', micro_total, 'ready', micro_ready, 'draft', micro_draft),
    'numbering', jsonb_build_object('activeSeries', series_cnt),
    'pendencies', pend,
    'overallStatus', overall);
END $function$;

-- =====================================================================
-- BLOCO 5 — FONTES OFICIAIS (URLs específicas aprovadas)
-- =====================================================================

UPDATE public.fiscal_official_sources SET url = v.url, updated_at = now()
FROM (VALUES
  ('MOC_NFE_70',            'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=33ol5hhSYZk='),
  ('PORTAL_NFE_SCHEMAS_NT', 'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/fwLvLUSmU8='),
  ('PORTAL_NFE_SERVICOS_UF','https://www.nfe.fazenda.gov.br/portal/webServices.aspx'),
  ('RFB_NCM_TIPI',          'https://www.gov.br/receitafederal/pt-br/assuntos/aduana-e-comercio-exterior/classificacao-fiscal-de-mercadorias'),
  ('TIPI',                  'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/ipi/tabela-de-incidencia-do-imposto-sobre-produtos-industrializados-tipi'),
  ('GUIA_EFD_ICMS_IPI_322', 'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/sped-sistema-publico-de-escrituracao-digital/escrituracao-fiscal-digital-efd'),
  ('CONFAZ_CEST',           'https://www.confaz.fazenda.gov.br/legislacao/convenios/2015/CV052_15')
) AS v(source_key, url)
WHERE fiscal_official_sources.source_key = v.source_key;

-- =====================================================================
-- BLOCO 6 — SEGURANÇA (menor privilégio, sem PUBLIC/anon)
-- =====================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fiscal_number_reservations','fiscal_tax_rules','fiscal_operation_policies',
    'fiscal_calculation_runs','fiscal_document_series','fiscal_official_sources',
    'fiscal_rule_sod_overrides','fiscal_invoices','fiscal_invoice_items','fiscal_audit_log']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- RLS: somente competência fiscal interna lê regras/reservas/cálculos.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fiscal_number_reservations','fiscal_tax_rules','fiscal_operation_policies',
    'fiscal_calculation_runs','fiscal_document_series','fiscal_rule_sod_overrides']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'f3_internal_read_'||t, t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                      USING (public.fn_fiscal_can_read_internal())$p$, 'f3_internal_read_'||t, t);
  END LOOP;
END $$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'rpc_fiscal_reserve_nfe_number_v1','rpc_fiscal_calculate_invoice_v1',
         'rpc_fiscal_nfe_readiness_v1','fn_fiscal_invoice_eligibility',
         'fn_fiscal_resolve_tax_rule','fn_fiscal_resolve_operation',
         'fn_fiscal_apply_tax_v2','fn_fiscal_apply_tax','fn_fiscal_item_base',
         'fn_fiscal_scenario_coverage','fn_fiscal_billing_allowed_order_status',
         'fn_fiscal_billing_allowed_delivery_status','tg_fiscal_reservation_immutable')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;

-- Gatilhos de trilha de auditoria (sem credenciais) nas relações F3.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fiscal_tax_rules','fiscal_operation_policies','fiscal_number_reservations']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_f3_audit_'||t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.fiscal_audit_trigger()',
                   'trg_f3_audit_'||t, t);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.rpc_fiscal_nfe_readiness_v1() IS
  'F3-correcao: prontidao NF-e 55 por cobertura real de cenarios e dossies de microrganismos. Teto READY_HOMOLOGATION sem homologacao SEFAZ registrada.';
