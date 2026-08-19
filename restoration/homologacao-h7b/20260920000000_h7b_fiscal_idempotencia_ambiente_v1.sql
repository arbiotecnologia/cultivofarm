-- =====================================================================
-- FASE H7b — Correção focada pós-auditoria independente do H7.
-- Ambiente autorizado: STAGING ikaauvsflpmamgxmkhoq.
-- A produção permanece intacta: o bloco de ambiente
-- (H7B-002) só executa quando o marcador fiscal comprova STAGING.
-- Emissão produtiva continua DESLIGADA.
--
-- H7B-001  P1  idempotência OBRIGATÓRIA em rpc_fiscal_event_manual
-- H7B-002       tpAmb='2' explícito no emitente ativo (guarda forte)
-- H7B-005  P1  rpc_upsert_fiscal_invoice_manual: registro externo explícito
-- H6-P2         REVOKE das trigger functions H6c para PUBLIC/anon
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- H7B-001 — fingerprint do payload material no próprio fiscal_events
-- ---------------------------------------------------------------------
ALTER TABLE public.fiscal_events
  ADD COLUMN IF NOT EXISTS payload_fingerprint text;

COMMENT ON COLUMN public.fiscal_events.payload_fingerprint IS
  'H7b: md5 do payload material (event_type + notes normalizadas). Distingue replay identico (mesmo event_id) de conflito de idempotencia.';

CREATE OR REPLACE FUNCTION public.fn_fiscal_event_fingerprint_v1(
  _event_type text,
  _notes text
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT md5(
    coalesce(upper(btrim(_event_type)), '') || '|' ||
    coalesce(btrim(_notes), '')
  );
$$;

REVOKE ALL ON FUNCTION public.fn_fiscal_event_fingerprint_v1(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_event_fingerprint_v1(text, text)
  TO authenticated, service_role;

-- RPC canônica: chave obrigatória + replay estável + conflito detectado.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_manual(
  p_invoice_id uuid,
  p_event_type text,
  p_notes text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_fp_existing text;
  v_notes text := NULLIF(btrim(coalesce(p_notes,'')), '');
  v_key text := NULLIF(btrim(coalesce(p_idempotency_key,'')), '');
  v_fp text;
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

  -- H7B-001: sem chave de idempotencia nao existe INSERT. Fail-closed.
  IF v_key IS NULL THEN
    RAISE EXCEPTION
      'FISCAL_IDEMPOTENCY_REQUIRED: informe p_idempotency_key nao vazia para registrar evento fiscal.'
      USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_TOO_LONG' USING ERRCODE = 'P0001';
  END IF;

  v_fp := public.fn_fiscal_event_fingerprint_v1(p_event_type, v_notes);

  -- Lock logico por documento: serializa retries concorrentes.
  PERFORM pg_advisory_xact_lock(hashtext('fiscal_event_manual:' || p_invoice_id::text));

  SELECT id, payload_fingerprint INTO v_id, v_fp_existing
    FROM public.fiscal_events
   WHERE fiscal_invoice_id = p_invoice_id
     AND event_type = p_event_type
     AND idempotency_key = v_key;

  IF v_id IS NOT NULL THEN
    IF v_fp_existing IS NOT NULL AND v_fp_existing IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION
        'FISCAL_IDEMPOTENCY_CONFLICT: chave % ja registrada para o documento % com payload diferente.',
        v_key, p_invoice_id
        USING ERRCODE = 'P0001';
    END IF;
    RETURN v_id; -- replay estavel: mesmo evento, sem duplicar
  END IF;

  INSERT INTO public.fiscal_events(
    fiscal_invoice_id, event_type, event_source, notes, performed_by,
    idempotency_key, payload_fingerprint
  ) VALUES (
    p_invoice_id, p_event_type, 'USER', v_notes, v_actor, v_key, v_fp
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_event_manual(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_manual(uuid, text, text, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- H7B-005 — rpc_upsert_fiscal_invoice_manual: registro EXTERNO explicito.
-- Classificacao: a RPC NAO transmite para a SEFAZ; registra documento
-- emitido fora do sistema. Nao passa pelo gate de transmissao, mas passa a
-- (a) marcar origem/provedor manual e (b) exigir evidencia (chave de acesso
-- de 44 digitos + numero) antes de assumir estado equivalente a emitido.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_upsert_fiscal_invoice_manual(
  p_receivable_id uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_key      := NULLIF(btrim(coalesce(p_payload->>'access_key','')),'');
  v_issue    := NULLIF(p_payload->>'issue_date','')::date;
  v_type     := COALESCE(NULLIF(p_payload->>'invoice_type',''), 'NFE');
  v_total    := COALESCE((p_payload->>'total_amount')::numeric, v_ar.total_amount);
  v_delivery := NULLIF(p_payload->>'delivery_id','')::uuid;

  IF v_status NOT IN ('PENDING','ISSUED','CANCELED','ERROR') THEN
    RAISE EXCEPTION 'Status fiscal inválido: %', v_status USING ERRCODE='check_violation';
  END IF;

  -- H7B-005: nenhum registro manual assume "emitido" sem evidencia externa.
  IF v_status = 'ISSUED' THEN
    IF v_key IS NULL OR v_key !~ '^[0-9]{44}$' THEN
      RAISE EXCEPTION
        'FISCAL_MANUAL_EVIDENCE_REQUIRED: registro manual como emitido exige chave de acesso de 44 digitos do documento externo.'
        USING ERRCODE='check_violation';
    END IF;
    IF v_number IS NULL THEN
      RAISE EXCEPTION
        'FISCAL_MANUAL_EVIDENCE_REQUIRED: registro manual como emitido exige o numero do documento externo.'
        USING ERRCODE='check_violation';
    END IF;
  END IF;

  SELECT * INTO v_existing FROM fiscal_invoices WHERE receivable_id = p_receivable_id
   FOR UPDATE;

  IF FOUND THEN
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
      delivery_id = COALESCE(v_delivery, v_existing.delivery_id),
      document_origin = 'MANUAL_RECORD',
      provider = COALESCE(v_existing.provider, 'NONE')
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
    v_action := 'FISCAL_INVOICE_UPDATED';
  ELSE
    INSERT INTO fiscal_invoices(
      receivable_id, delivery_id, invoice_type, invoice_number, series, access_key,
      issue_date, total_amount, status, created_by, document_origin, provider
    ) VALUES (
      p_receivable_id, v_delivery, v_type, v_number, v_series, v_key,
      v_issue, v_total, v_status, v_uid, 'MANUAL_RECORD', 'NONE'
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
          jsonb_build_object('status', v_status, 'invoice_number', v_number,
                             'delivery_id', v_delivery,
                             'document_origin', 'MANUAL_RECORD'),
          v_uid);

  RETURN jsonb_build_object('invoice_id', v_id, 'status', v_status,
                            'document_origin', 'MANUAL_RECORD');
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_upsert_fiscal_invoice_manual(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_fiscal_invoice_manual(uuid, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- H6-P2 — menor privilegio nas trigger functions H6c (sem mudar logica).
-- ---------------------------------------------------------------------
DO $h6$
BEGIN
  IF to_regprocedure('public.fn_h6c_entrega_ar_b2b_link()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_h6c_entrega_ar_b2b_link() FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.fn_h6c_set_canonical_payment_terms()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_h6c_set_canonical_payment_terms() FROM PUBLIC, anon, authenticated';
  END IF;
END
$h6$;

-- ---------------------------------------------------------------------
-- H7B-002 — ambiente de homologacao explicito (tpAmb='2') SOMENTE staging.
-- ---------------------------------------------------------------------
DO $env$
DECLARE
  v_ok boolean := false;
  v_n integer;
  v_before text;
BEGIN
  IF to_regclass('public.fiscal_environment_marker') IS NULL THEN
    RAISE NOTICE 'H7B-002: marcador de ambiente ausente — tpAmb NAO alterado.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_environment_marker
     WHERE project_ref = 'ikaauvsflpmamgxmkhoq'
       AND environment_label = 'STAGING'
       AND production_emission_allowed = false
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE NOTICE 'H7B-002: ambiente nao e o staging autorizado — tpAmb NAO alterado.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_n FROM public.company_fiscal_settings WHERE is_active;
  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'H7B-002 FAIL-CLOSED: esperado exatamente 1 emitente ativo, encontrado %.', v_n;
  END IF;

  SELECT coalesce(nfe_environment_code, '<null>') INTO v_before
    FROM public.company_fiscal_settings WHERE is_active;

  UPDATE public.company_fiscal_settings
     SET nfe_environment_code = '2'
   WHERE is_active
     AND coalesce(nfe_environment_code,'') IS DISTINCT FROM '2';

  RAISE NOTICE 'H7B-002: tpAmb staging antes=% depois=2 (homologacao).', v_before;
END
$env$;

COMMIT;
