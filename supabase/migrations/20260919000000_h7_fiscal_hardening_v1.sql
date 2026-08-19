-- ============================================================================
-- FASE H7 — Homologação do Módulo Fiscal AR BIO
-- Correções P0/P1 encontradas na auditoria H7.0 (staging ikaauvsflpmamgxmkhoq).
--
-- H7-001 (P1) Gate de ambiente fiscal sem códigos estáveis e sem cobertura
--             nas RPCs manuais. => fn_fiscal_environment_gate_v1 (fonte única).
-- H7-002 (P0) `rpc_upsert_fiscal_invoice_manual` podia sobrescrever número,
--             série, chave de acesso, total e status de documento já
--             AUTORIZADO/CANCELADO. => guarda server-side + trigger.
-- H7-003 (P1) `status='ISSUED'` normalizava para DRAFT, reabrindo itens de um
--             documento emitido. => mapeamento canônico ISSUED->AUTHORIZED.
-- H7-004 (P1) `rpc_fiscal_event_manual` sem idempotência: retry duplicava
--             evento. => idempotency_key + replay estável.
-- H7-005 (P2) `fiscal_events` sem append-only. => guarda de imutabilidade.
-- H7-006 (P2) `anon` com EXECUTE em helpers fiscais. => REVOKE.
--
-- Produção fiscal permanece DESLIGADA (tpAmb=1 bloqueado).
-- Nenhum segredo, certificado ou endpoint é tocado por esta migration.
-- ============================================================================

-- ---------------------------------------------------------------- H7-001 ----
CREATE OR REPLACE FUNCTION public.fn_fiscal_environment_gate_v1(
  p_operation text DEFAULT 'GENERIC'
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_env   text;
BEGIN
  SELECT count(*) INTO v_count FROM public.company_fiscal_settings WHERE is_active;

  IF v_count = 0 THEN
    RAISE EXCEPTION
      'FISCAL_ENV_NOT_READY: FISCAL_EMITTER_NOT_CONFIGURED — nenhum emitente fiscal ativo (operacao=%).', p_operation;
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION
      'FISCAL_ENV_NOT_READY: FISCAL_EMITTER_AMBIGUOUS — % emitentes ativos (operacao=%).', v_count, p_operation;
  END IF;

  SELECT btrim(coalesce(nfe_environment_code, '')) INTO v_env
    FROM public.company_fiscal_settings WHERE is_active LIMIT 1;

  IF v_env IS NULL OR v_env NOT IN ('1', '2') THEN
    RAISE EXCEPTION
      'FISCAL_ENV_NOT_READY: FISCAL_ENVIRONMENT_INVALID — tpAmb ausente/invalido (operacao=%).', p_operation;
  END IF;

  IF v_env = '1' THEN
    RAISE EXCEPTION
      'FISCAL_PRODUCTION_DISABLED: FISCAL_PRODUCTION_BLOCKED — emissao em producao desabilitada (operacao=%).', p_operation;
  END IF;

  RETURN v_env; -- somente '2' (HOMOLOGACAO) prossegue
END;
$$;

-- O assert legado passa a delegar ao gate único (mensagens preservam os
-- tokens antigos, então harnesses e testes existentes continuam válidos).
CREATE OR REPLACE FUNCTION public.fn_fiscal_assert_environment_homologation()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.fn_fiscal_environment_gate_v1('ASSERT_HOMOLOGATION');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_fiscal_environment_gate_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_environment_gate_v1(text) TO authenticated, service_role;

-- ---------------------------------------------------------------- H7-003 ----
CREATE OR REPLACE FUNCTION public.tg_fiscal_invoice_sync_normalized_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE v_norm text;
BEGIN
  v_norm := upper(btrim(coalesce(NEW.status, '')));
  v_norm := CASE v_norm
    WHEN 'PENDING'   THEN 'DRAFT'
    WHEN 'RASCUNHO'  THEN 'DRAFT'
    WHEN 'ISSUED'    THEN 'AUTHORIZED'   -- H7-003: emitida == autorizada
    WHEN 'EMITIDA'   THEN 'AUTHORIZED'
    WHEN 'AUTORIZADA' THEN 'AUTHORIZED'
    WHEN 'CANCELADA' THEN 'CANCELED'
    WHEN 'REJEITADA' THEN 'REJECTED'
    WHEN 'ERRO'      THEN 'ERROR'
    ELSE v_norm
  END;
  IF v_norm NOT IN ('LEGACY_RECORDED','DRAFT','VALIDATING','READY','QUEUED','PROCESSING',
                    'AUTHORIZED','REJECTED','ERROR','CANCEL_REQUESTED','CANCELED','SUBSTITUTED') THEN
    v_norm := COALESCE(NEW.normalized_status, 'DRAFT');
  END IF;
  NEW.normalized_status := v_norm;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- H7-002 ----
-- Estados terminais: snapshot fiscal/econômico imutável fora de evento formal.
CREATE OR REPLACE FUNCTION public.fn_fiscal_status_is_terminal(_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(btrim(coalesce(_status, ''))) IN ('AUTHORIZED','CANCELED','SUBSTITUTED');
$$;

CREATE OR REPLACE FUNCTION public.tg_h7_fiscal_invoice_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.fn_fiscal_status_is_terminal(OLD.normalized_status) THEN
    RETURN NEW;
  END IF;

  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.series        IS DISTINCT FROM OLD.series
     OR NEW.access_key    IS DISTINCT FROM OLD.access_key
     OR NEW.total_amount  IS DISTINCT FROM OLD.total_amount
     OR NEW.issue_date    IS DISTINCT FROM OLD.issue_date
     OR NEW.invoice_type  IS DISTINCT FROM OLD.invoice_type
     OR NEW.receivable_id IS DISTINCT FROM OLD.receivable_id
  THEN
    RAISE EXCEPTION
      'FISCAL_DOCUMENT_LOCKED: documento em estado % nao aceita alteracao economica/fiscal informal.',
      OLD.normalized_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Transições de estado permitidas a partir de um estado terminal.
  IF NEW.normalized_status IS DISTINCT FROM OLD.normalized_status THEN
    IF NOT (OLD.normalized_status = 'AUTHORIZED'
            AND NEW.normalized_status IN ('CANCEL_REQUESTED','CANCELED','SUBSTITUTED')) THEN
      RAISE EXCEPTION
        'FISCAL_STATE_TRANSITION_INVALID: % -> % nao permitida.',
        OLD.normalized_status, NEW.normalized_status
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_h7_fiscal_invoice_immutable ON public.fiscal_invoices;
CREATE TRIGGER trg_h7_fiscal_invoice_immutable
  BEFORE UPDATE ON public.fiscal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_h7_fiscal_invoice_immutable_v1();

-- Guarda explícita também na RPC manual (menor privilégio + erro acionável).
CREATE OR REPLACE FUNCTION public.rpc_upsert_fiscal_invoice_manual(
  p_receivable_id uuid, p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ar  record;
  v_existing record;
  v_id uuid;
  v_status text;
  v_number text;
  v_series text;
  v_key text;
  v_issue date;
  v_type text;
  v_total numeric(14,2);
  v_delivery uuid;
  v_old jsonb;
  v_action text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para alterar dados fiscais.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_ar FROM accounts_receivable WHERE id = p_receivable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a receber não encontrada.'; END IF;

  v_status   := COALESCE(NULLIF(p_payload->>'status',''), 'PENDING');
  v_number   := NULLIF(p_payload->>'invoice_number','');
  v_series   := NULLIF(p_payload->>'series','');
  v_key      := NULLIF(p_payload->>'access_key','');
  v_issue    := NULLIF(p_payload->>'issue_date','')::date;
  v_type     := COALESCE(NULLIF(p_payload->>'invoice_type',''), 'NFE');
  v_total    := COALESCE((p_payload->>'total_amount')::numeric, v_ar.total_amount);
  v_delivery := NULLIF(p_payload->>'delivery_id','')::uuid;

  IF v_status NOT IN ('PENDING','ISSUED','CANCELED','ERROR') THEN
    RAISE EXCEPTION 'Status fiscal inválido: %', v_status USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_existing FROM fiscal_invoices WHERE receivable_id = p_receivable_id
   FOR UPDATE;

  IF FOUND THEN
    -- H7-002: registro manual jamais altera documento em estado terminal nem
    -- documento gerenciado pelo motor NF-e (com número reservado/chave).
    IF public.fn_fiscal_status_is_terminal(v_existing.normalized_status) THEN
      RAISE EXCEPTION
        'FISCAL_DOCUMENT_LOCKED: documento fiscal % esta em % e nao aceita registro manual.',
        v_existing.id, v_existing.normalized_status
        USING ERRCODE='insufficient_privilege';
    END IF;
    IF EXISTS (SELECT 1 FROM public.fiscal_number_reservations r
                WHERE r.fiscal_invoice_id = v_existing.id) THEN
      RAISE EXCEPTION
        'FISCAL_DOCUMENT_ENGINE_MANAGED: documento % pertence ao motor NF-e; use o fluxo de emissao.',
        v_existing.id
        USING ERRCODE='insufficient_privilege';
    END IF;

    v_old := to_jsonb(v_existing);
    UPDATE fiscal_invoices SET
      status = v_status,
      invoice_number = v_number,
      series = v_series,
      access_key = v_key,
      issue_date = v_issue,
      invoice_type = v_type,
      total_amount = v_total,
      delivery_id = COALESCE(v_delivery, v_existing.delivery_id)
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
    v_action := 'FISCAL_INVOICE_UPDATED';
  ELSE
    INSERT INTO fiscal_invoices(
      receivable_id, delivery_id, invoice_type, invoice_number, series, access_key,
      issue_date, total_amount, status, created_by
    ) VALUES (
      p_receivable_id, v_delivery, v_type, v_number, v_series, v_key,
      v_issue, v_total, v_status, v_uid
    ) RETURNING id INTO v_id;
    v_action := 'FISCAL_INVOICE_CREATED';
  END IF;

  UPDATE accounts_receivable SET
    fiscal_invoice_status = CASE
      WHEN v_status = 'ISSUED' THEN 'ISSUED'
      WHEN v_status = 'CANCELED' THEN 'CANCELED'
      WHEN v_status = 'PENDING' THEN 'PENDING'
      ELSE accounts_receivable.fiscal_invoice_status
    END,
    fiscal_invoice_number = COALESCE(v_number, fiscal_invoice_number),
    fiscal_access_key     = COALESCE(v_key, fiscal_access_key),
    fiscal_issue_date     = COALESCE(v_issue, fiscal_issue_date)
  WHERE id = p_receivable_id;

  INSERT INTO financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES ('fiscal_invoices', v_id, v_action, v_old,
          jsonb_build_object('status', v_status, 'invoice_number', v_number, 'delivery_id', v_delivery),
          v_uid);

  RETURN jsonb_build_object('invoice_id', v_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_upsert_fiscal_invoice_manual(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_fiscal_invoice_manual(uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------- H7-004 ----
ALTER TABLE public.fiscal_events
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_events_idempotency
  ON public.fiscal_events (fiscal_invoice_id, event_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_manual(
  p_invoice_id uuid,
  p_event_type text,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_notes text := NULLIF(btrim(coalesce(p_notes,'')), '');
  v_key text := NULLIF(btrim(coalesce(p_idempotency_key,'')), '');
  v_allowed text[] := ARRAY['MANUAL_UPDATED','RECONCILIATION_REQUIRED','RECONCILIATION_COMPLETED'];
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_role(v_actor,'administrador'::app_role)
       OR public.has_role(v_actor,'financeiro'::app_role)
       OR public.has_role(v_actor,'gestor'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_invoice_id IS NULL THEN RAISE EXCEPTION 'invoice_id_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_invoices WHERE id = p_invoice_id) THEN
    RAISE EXCEPTION 'invoice_not_found: %', p_invoice_id;
  END IF;
  IF NOT (p_event_type = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'event_type_not_allowed_for_manual: %', p_event_type;
  END IF;
  IF v_notes IS NOT NULL AND char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'notes_too_long';
  END IF;

  -- H7-004: lock lógico por documento evita corrida entre dois retries.
  PERFORM pg_advisory_xact_lock(hashtext('fiscal_event_manual:' || p_invoice_id::text));

  IF v_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.fiscal_events
     WHERE fiscal_invoice_id = p_invoice_id
       AND event_type = p_event_type
       AND idempotency_key = v_key;
    IF v_id IS NOT NULL THEN
      RETURN v_id; -- replay estável: mesmo evento, sem duplicar
    END IF;
  END IF;

  INSERT INTO public.fiscal_events(
    fiscal_invoice_id, event_type, event_source, notes, performed_by, idempotency_key
  ) VALUES (
    p_invoice_id, p_event_type, 'USER', v_notes, v_actor, v_key
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_event_manual(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_manual(uuid, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------- H7-005 ----
CREATE OR REPLACE FUNCTION public.tg_h7_fiscal_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'FISCAL_EVENTS_APPEND_ONLY: eventos fiscais nao podem ser alterados ou removidos.'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_h7_fiscal_events_append_only ON public.fiscal_events;
CREATE TRIGGER trg_h7_fiscal_events_append_only
  BEFORE UPDATE OR DELETE ON public.fiscal_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_h7_fiscal_events_append_only();

-- ---------------------------------------------------------------- H7-006 ----
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE '%fiscal%' OR p.proname LIKE '%nfe%')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, PUBLIC;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', r.sig);
  END LOOP;
END $$;
