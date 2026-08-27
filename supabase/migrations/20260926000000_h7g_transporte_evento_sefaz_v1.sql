-- =============================================================================
-- FASE H7g (H7G-003) — Migration canonica incremental do transporte SEFAZ-MG.
--
-- Representa o estado final H7f + H7g ja aplicado no staging via
-- `restoration/homologacao-h7/83-h7g-transporte-evento-apply.sql`, sem editar
-- nenhuma migration historica. Idempotente/reexecutavel e fail-closed contra
-- qualquer ambiente com emissao fiscal produtiva habilitada.
-- =============================================================================
-- =============================================================================
-- FASE H7g — Estado final canônico do transporte SEFAZ-MG (H7f + H7g).
--
-- Reprodutibilidade (H7G-003): este é o artefato SQL canônico e reexecutável
-- que representa o estado final do transporte fiscal. Nenhuma migration
-- histórica foi editada. Guard rígido de staging enquanto durar a homologação.
--
-- Correções desta fase:
--   * H7G-001 — vínculo canônico run↔invoice na autorização (Edge + banco).
--   * H7G-002 — evento SEFAZ (cancelamento / CC-e) preparado e assinado
--     exclusivamente server-side sobre `fiscal_events`; XML bruto do cliente
--     deixa de ser autoridade de transporte.
--   * H7G-004 — semântica explícita de resultado (`outcome`), separando
--     "transporte concluído" de "NF-e autorizada".
--
-- Invariantes preservados: tpAmb=2, host `hnfe.fazenda.mg.gov.br`, append-only,
-- imutabilidade após estado terminal, idempotência por chave + fingerprint,
-- RPCs de escrita restritas a service_role, nenhum segredo persistido.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Guard duro de ambiente (staging autorizado desta fase)
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ref text; v_prod boolean;
BEGIN
  -- Guard rigido: esta fase e de HOMOLOGACAO. Qualquer ambiente com emissao
  -- produtiva habilitada aborta a migration.
  IF to_regclass('public.fiscal_environment_marker') IS NOT NULL THEN
    SELECT project_ref, production_emission_allowed INTO v_ref, v_prod
      FROM public.fiscal_environment_marker LIMIT 1;
    IF coalesce(v_prod, false) THEN
      RAISE EXCEPTION 'H7G ABORT: ambiente com emissao produtiva habilitada (ref=%)', v_ref;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Transmissões SEFAZ (H7f) — estrutura canônica
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_sefaz_transmissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_invoice_id   uuid REFERENCES public.fiscal_invoices(id) ON DELETE RESTRICT,
  xml_run_id          uuid REFERENCES public.fiscal_xml_runs(id) ON DELETE RESTRICT,
  service             text NOT NULL CHECK (service IN (
                        'NFeStatusServico4','NFeAutorizacao4','NFeRetAutorizacao4',
                        'NFeConsultaProtocolo4','NFeRecepcaoEvento4','NFeInutilizacao4')),
  environment_code    text NOT NULL DEFAULT '2' CHECK (environment_code = '2'),
  endpoint_host       text NOT NULL CHECK (endpoint_host = 'hnfe.fazenda.mg.gov.br'),
  endpoint_url        text NOT NULL CHECK (endpoint_url LIKE 'https://hnfe.fazenda.mg.gov.br/%'),
  correlation_id      uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key     text NOT NULL,
  request_fingerprint text NOT NULL,
  state               text NOT NULL DEFAULT 'PENDING'
                        CHECK (state IN ('PENDING','SENT','SUCCEEDED','FAILED','BLOCKED')),
  attempt             integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  c_stat              text,
  x_motivo            text,
  ch_nfe              text,
  n_prot              text,
  n_rec               text,
  dh_recbto           timestamptz,
  ambiente_retorno    text,
  response_summary    jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code          text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

-- H7G-002/004 — vínculo canônico de evento e semântica de resultado.
ALTER TABLE public.fiscal_sefaz_transmissions
  ADD COLUMN IF NOT EXISTS fiscal_event_id uuid
    REFERENCES public.fiscal_events(id) ON DELETE RESTRICT;
ALTER TABLE public.fiscal_sefaz_transmissions
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'PENDING';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fiscal_sefaz_tx_outcome') THEN
    ALTER TABLE public.fiscal_sefaz_transmissions
      ADD CONSTRAINT chk_fiscal_sefaz_tx_outcome CHECK (outcome IN (
        'PENDING','AUTHORIZED','REJECTED','PROCESSING','EVENT_REGISTERED',
        'SERVICE_INFO','TRANSPORT_ERROR'));
  END IF;
END $$;

COMMENT ON COLUMN public.fiscal_sefaz_transmissions.state IS
  'H7G-004: ciclo de vida do TRANSPORTE (PENDING/SENT/SUCCEEDED/FAILED/BLOCKED). '
  'SUCCEEDED significa exclusivamente "transporte concluido" e NUNCA "NF-e autorizada".';
COMMENT ON COLUMN public.fiscal_sefaz_transmissions.outcome IS
  'H7G-004: resultado fiscal derivado server-side do cStat/protocolo. '
  'Autorizacao fiscal exige outcome = AUTHORIZED com n_prot presente.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_sefaz_tx_idem
  ON public.fiscal_sefaz_transmissions (idempotency_key);
CREATE INDEX IF NOT EXISTS ix_fiscal_sefaz_tx_invoice
  ON public.fiscal_sefaz_transmissions (fiscal_invoice_id, service, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_fiscal_sefaz_tx_event
  ON public.fiscal_sefaz_transmissions (fiscal_event_id, created_at DESC);

REVOKE ALL ON public.fiscal_sefaz_transmissions FROM PUBLIC;
REVOKE ALL ON public.fiscal_sefaz_transmissions FROM anon;
REVOKE ALL ON public.fiscal_sefaz_transmissions FROM authenticated;
GRANT SELECT ON public.fiscal_sefaz_transmissions TO authenticated;
GRANT ALL    ON public.fiscal_sefaz_transmissions TO service_role;

ALTER TABLE public.fiscal_sefaz_transmissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_sefaz_tx_read      ON public.fiscal_sefaz_transmissions;
DROP POLICY IF EXISTS fiscal_sefaz_tx_no_insert ON public.fiscal_sefaz_transmissions;
DROP POLICY IF EXISTS fiscal_sefaz_tx_no_update ON public.fiscal_sefaz_transmissions;
DROP POLICY IF EXISTS fiscal_sefaz_tx_no_delete ON public.fiscal_sefaz_transmissions;

CREATE POLICY fiscal_sefaz_tx_read ON public.fiscal_sefaz_transmissions
  FOR SELECT TO authenticated
  USING (public.fn_fiscal_can_read_internal(auth.uid()));
CREATE POLICY fiscal_sefaz_tx_no_insert ON public.fiscal_sefaz_transmissions
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY fiscal_sefaz_tx_no_update ON public.fiscal_sefaz_transmissions
  FOR UPDATE TO authenticated USING (false);
CREATE POLICY fiscal_sefaz_tx_no_delete ON public.fiscal_sefaz_transmissions
  FOR DELETE TO authenticated USING (false);

-- ---------------------------------------------------------------------------
-- 2. Eventos SEFAZ canônicos sobre `fiscal_events` (H7G-002)
--    Sem motor paralelo: apenas colunas mínimas + tipos de evento oficiais.
--    A tabela continua append-only; o ciclo de vida é representado por linhas
--    sucessivas ligadas por `related_event_id`.
-- ---------------------------------------------------------------------------
ALTER TABLE public.fiscal_events
  ADD COLUMN IF NOT EXISTS related_event_id  uuid REFERENCES public.fiscal_events(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS sefaz_event_code  text,
  ADD COLUMN IF NOT EXISTS sefaz_seq_evento  integer,
  ADD COLUMN IF NOT EXISTS sefaz_access_key  text,
  ADD COLUMN IF NOT EXISTS sefaz_reason      text,
  ADD COLUMN IF NOT EXISTS signed_xml_path   text,
  ADD COLUMN IF NOT EXISTS signed_xml_sha256 text,
  ADD COLUMN IF NOT EXISTS sefaz_c_stat      text,
  ADD COLUMN IF NOT EXISTS sefaz_n_prot      text,
  ADD COLUMN IF NOT EXISTS sefaz_transmission_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fiscal_events_sefaz_code') THEN
    ALTER TABLE public.fiscal_events
      ADD CONSTRAINT chk_fiscal_events_sefaz_code
      CHECK (sefaz_event_code IS NULL OR sefaz_event_code IN ('110110','110111'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fiscal_events_sefaz_key') THEN
    ALTER TABLE public.fiscal_events
      ADD CONSTRAINT chk_fiscal_events_sefaz_key
      CHECK (sefaz_access_key IS NULL OR sefaz_access_key ~ '^[0-9]{44}$');
  END IF;
END $$;

-- Amplia os tipos oficiais suportados sem remover nenhum tipo histórico.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint WHERE conname = 'fiscal_events_event_type_check';
  IF v_def IS NULL OR position('SEFAZ_CANCELLATION_PREPARED' in v_def) = 0 THEN
    ALTER TABLE public.fiscal_events DROP CONSTRAINT IF EXISTS fiscal_events_event_type_check;
    ALTER TABLE public.fiscal_events ADD CONSTRAINT fiscal_events_event_type_check
      CHECK (event_type = ANY (ARRAY[
        'CREATED','MANUAL_UPDATED','DOCUMENT_ATTACHED','VALIDATION_REQUESTED',
        'VALIDATION_FAILED','READY_FOR_FUTURE_INTEGRATION','RECONCILIATION_REQUIRED',
        'RECONCILIATION_COMPLETED','DOCUMENT_CANCELED_FINANCIAL_REVIEW_REQUIRED',
        'TOTAL_MISMATCH','CUSTOMER_MISMATCH','SOURCE_MISMATCH','REPLACEMENT_REQUIRED',
        'SINIEF_ADVANCE_PAYMENT_ISSUED','SINIEF_EFFECTIVE_SALE_ISSUED',
        'SINIEF_STOCK_LOSS_ISSUED','SINIEF_VALUE_QUANTITY_REDUCTION_ISSUED',
        'SINIEF_DELIVERY_REFUSAL_TOTAL_ISSUED','SINIEF_DELIVERY_REFUSAL_PARTIAL_ISSUED',
        'SINIEF_RECIPIENT_NOT_FOUND_ISSUED','SINIEF20_ICMS_EVALUATED',
        'SINIEF20_RECIPIENT_SNAPSHOT_CAPTURED',
        'SEFAZ_CANCELLATION_PREPARED','SEFAZ_CORRECTION_PREPARED',
        'SEFAZ_EVENT_SIGNED','SEFAZ_EVENT_REGISTERED','SEFAZ_EVENT_REJECTED'
      ]::text[]));
  END IF;
END $$;

-- Estado derivado (append-only): PREPARED -> SIGNED -> REGISTERED|REJECTED.
CREATE OR REPLACE VIEW public.v_fiscal_sefaz_event_state
WITH (security_invoker = true) AS
SELECT
  p.id                              AS event_id,
  p.fiscal_invoice_id,
  p.event_type,
  p.sefaz_event_code,
  p.sefaz_seq_evento,
  p.sefaz_access_key,
  p.sefaz_reason,
  p.idempotency_key,
  p.payload_fingerprint,
  p.performed_by,
  p.created_at,
  s.signed_xml_path,
  s.signed_xml_sha256,
  r.sefaz_c_stat,
  r.sefaz_n_prot,
  CASE
    WHEN r.event_type = 'SEFAZ_EVENT_REGISTERED' THEN 'REGISTERED'
    WHEN r.event_type = 'SEFAZ_EVENT_REJECTED'   THEN 'REJECTED'
    WHEN s.id IS NOT NULL                        THEN 'SIGNED'
    ELSE 'PREPARED'
  END AS state
FROM public.fiscal_events p
LEFT JOIN LATERAL (
  SELECT e.* FROM public.fiscal_events e
   WHERE e.related_event_id = p.id AND e.event_type = 'SEFAZ_EVENT_SIGNED'
   ORDER BY e.created_at DESC LIMIT 1) s ON true
LEFT JOIN LATERAL (
  SELECT e.* FROM public.fiscal_events e
   WHERE e.related_event_id = p.id
     AND e.event_type IN ('SEFAZ_EVENT_REGISTERED','SEFAZ_EVENT_REJECTED')
   ORDER BY e.created_at DESC LIMIT 1) r ON true
WHERE p.event_type IN ('SEFAZ_CANCELLATION_PREPARED','SEFAZ_CORRECTION_PREPARED');

REVOKE ALL ON public.v_fiscal_sefaz_event_state FROM PUBLIC, anon;
GRANT SELECT ON public.v_fiscal_sefaz_event_state TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Defense-in-depth: coerência de vínculo direto no banco (H7G-001/002)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_fiscal_sefaz_tx_link_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_run_invoice   uuid;
  v_run_state     text;
  v_event_invoice uuid;
  v_event_state   text;
BEGIN
  -- H7G-001: autorização sempre amarrada ao invoice do próprio XML run.
  IF NEW.service = 'NFeAutorizacao4' THEN
    IF NEW.xml_run_id IS NULL THEN
      RAISE EXCEPTION 'SEFAZ_RUN_REQUIRED';
    END IF;
    SELECT fiscal_invoice_id, state INTO v_run_invoice, v_run_state
      FROM public.fiscal_xml_runs WHERE id = NEW.xml_run_id;
    IF v_run_invoice IS NULL THEN
      RAISE EXCEPTION 'SEFAZ_RUN_NOT_FOUND';
    END IF;
    IF v_run_state IS DISTINCT FROM 'SIGNED' THEN
      RAISE EXCEPTION 'SEFAZ_DOCUMENT_NOT_SIGNED';
    END IF;
    IF NEW.fiscal_invoice_id IS DISTINCT FROM v_run_invoice THEN
      RAISE EXCEPTION 'SEFAZ_INVOICE_RUN_MISMATCH';
    END IF;
  END IF;

  IF NEW.xml_run_id IS NOT NULL AND NEW.service <> 'NFeAutorizacao4' THEN
    SELECT fiscal_invoice_id INTO v_run_invoice
      FROM public.fiscal_xml_runs WHERE id = NEW.xml_run_id;
    IF NEW.fiscal_invoice_id IS DISTINCT FROM v_run_invoice THEN
      RAISE EXCEPTION 'SEFAZ_INVOICE_RUN_MISMATCH';
    END IF;
  END IF;

  -- H7G-002: evento sempre amarrado a um evento fiscal preparado e assinado.
  IF NEW.service = 'NFeRecepcaoEvento4' THEN
    IF NEW.fiscal_event_id IS NULL THEN
      RAISE EXCEPTION 'SEFAZ_EVENT_REQUIRED';
    END IF;
    SELECT fiscal_invoice_id, state INTO v_event_invoice, v_event_state
      FROM public.v_fiscal_sefaz_event_state WHERE event_id = NEW.fiscal_event_id;
    IF v_event_invoice IS NULL THEN
      RAISE EXCEPTION 'SEFAZ_EVENT_NOT_FOUND';
    END IF;
    IF v_event_state NOT IN ('SIGNED','REJECTED') THEN
      RAISE EXCEPTION 'SEFAZ_EVENT_NOT_SIGNED';
    END IF;
    IF NEW.fiscal_invoice_id IS DISTINCT FROM v_event_invoice THEN
      RAISE EXCEPTION 'SEFAZ_EVENT_INVOICE_MISMATCH';
    END IF;
  ELSIF NEW.fiscal_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'SEFAZ_EVENT_SERVICE_MISMATCH';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.fn_fiscal_sefaz_tx_link_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fiscal_sefaz_tx_link_guard ON public.fiscal_sefaz_transmissions;
CREATE TRIGGER trg_fiscal_sefaz_tx_link_guard
  BEFORE INSERT ON public.fiscal_sefaz_transmissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_fiscal_sefaz_tx_link_guard();

-- Append-only + imutabilidade de campos de vínculo (inclui fiscal_event_id).
CREATE OR REPLACE FUNCTION public.fn_fiscal_sefaz_tx_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_APPEND_ONLY';
  END IF;

  IF OLD.state IN ('SUCCEEDED','FAILED','BLOCKED') THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_IMMUTABLE';
  END IF;

  IF NEW.id                  IS DISTINCT FROM OLD.id
     OR NEW.service           IS DISTINCT FROM OLD.service
     OR NEW.fiscal_invoice_id IS DISTINCT FROM OLD.fiscal_invoice_id
     OR NEW.xml_run_id        IS DISTINCT FROM OLD.xml_run_id
     OR NEW.fiscal_event_id   IS DISTINCT FROM OLD.fiscal_event_id
     OR NEW.idempotency_key   IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint
     OR NEW.environment_code  IS DISTINCT FROM OLD.environment_code
     OR NEW.endpoint_url      IS DISTINCT FROM OLD.endpoint_url
     OR NEW.correlation_id    IS DISTINCT FROM OLD.correlation_id
     OR NEW.created_at        IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_FIELDS_IMMUTABLE';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.fn_fiscal_sefaz_tx_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fiscal_sefaz_tx_guard ON public.fiscal_sefaz_transmissions;
CREATE TRIGGER trg_fiscal_sefaz_tx_guard
  BEFORE UPDATE OR DELETE ON public.fiscal_sefaz_transmissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_fiscal_sefaz_tx_guard();

-- ---------------------------------------------------------------------------
-- 4. Preparo canônico de evento SEFAZ (cancelamento / CC-e)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1(
  _invoice_id      uuid,
  _event_kind      text,
  _reason          text,
  _idempotency_key text,
  _actor           uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ref     text;
  v_prod    boolean;
  v_tpamb   text;
  v_inv     public.fiscal_invoices;
  v_code    text;
  v_type    text;
  v_reason  text := btrim(coalesce(_reason, ''));
  v_fp      text;
  v_prev    public.fiscal_events;
  v_seq     integer;
  v_id      uuid;
  v_prot    text;
BEGIN
  IF _actor IS NULL OR NOT public.fn_fiscal_can_operate(_actor) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN';
  END IF;
  IF coalesce(btrim(_idempotency_key), '') = '' OR length(_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'FISCAL_EVENT_IDEMPOTENCY_INVALID';
  END IF;

  SELECT project_ref, production_emission_allowed INTO v_ref, v_prod
    FROM public.fiscal_environment_marker LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' OR coalesce(v_prod, true) THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;
  SELECT coalesce(nfe_environment_code, '') INTO v_tpamb
    FROM public.company_fiscal_settings WHERE is_active LIMIT 1;
  IF v_tpamb IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  IF _event_kind = 'CANCELLATION' THEN
    v_code := '110111'; v_type := 'SEFAZ_CANCELLATION_PREPARED';
  ELSIF _event_kind = 'CORRECTION' THEN
    v_code := '110110'; v_type := 'SEFAZ_CORRECTION_PREPARED';
  ELSE
    RAISE EXCEPTION 'FISCAL_EVENT_TYPE_UNSUPPORTED';
  END IF;

  SELECT * INTO v_inv FROM public.fiscal_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EVENT_INVOICE_NOT_FOUND'; END IF;
  IF coalesce(v_inv.access_key, '') !~ '^[0-9]{44}$' THEN
    RAISE EXCEPTION 'FISCAL_EVENT_ACCESS_KEY_INVALID';
  END IF;
  IF coalesce(v_inv.environment, 'HOMOLOGATION') <> 'HOMOLOGATION' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  -- Autorização canônica obrigatória: protocolo válido na própria chave.
  SELECT n_prot INTO v_prot
    FROM public.fiscal_sefaz_transmissions
   WHERE fiscal_invoice_id = _invoice_id
     AND service IN ('NFeAutorizacao4','NFeRetAutorizacao4')
     AND state = 'SUCCEEDED'
     AND outcome = 'AUTHORIZED'
     AND n_prot IS NOT NULL
     AND ch_nfe = v_inv.access_key
   ORDER BY created_at DESC LIMIT 1;
  IF v_prot IS NULL THEN
    RAISE EXCEPTION 'FISCAL_EVENT_INVOICE_NOT_AUTHORIZED';
  END IF;

  IF _event_kind = 'CANCELLATION' THEN
    IF length(v_reason) < 15 OR length(v_reason) > 255 THEN
      RAISE EXCEPTION 'FISCAL_EVENT_REASON_INVALID';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.v_fiscal_sefaz_event_state
       WHERE fiscal_invoice_id = _invoice_id
         AND sefaz_event_code = '110111' AND state = 'REGISTERED') THEN
      RAISE EXCEPTION 'FISCAL_EVENT_ALREADY_REGISTERED';
    END IF;
  ELSE
    IF length(v_reason) < 15 OR length(v_reason) > 1000 THEN
      RAISE EXCEPTION 'FISCAL_EVENT_REASON_INVALID';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.v_fiscal_sefaz_event_state
       WHERE fiscal_invoice_id = _invoice_id
         AND sefaz_event_code = '110111' AND state = 'REGISTERED') THEN
      RAISE EXCEPTION 'FISCAL_EVENT_INVOICE_CANCELED';
    END IF;
  END IF;

  v_fp := encode(extensions.digest(
    v_code || '|' || v_inv.access_key || '|' || v_reason, 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(
    hashtextextended('fiscal_sefaz_event:' || _invoice_id::text || ':' || _idempotency_key, 0));

  SELECT * INTO v_prev FROM public.fiscal_events
   WHERE fiscal_invoice_id = _invoice_id
     AND event_type = v_type
     AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF v_prev.payload_fingerprint IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION 'FISCAL_EVENT_IDEMPOTENCY_MISMATCH';
    END IF;
    RETURN jsonb_build_object(
      'eventId', v_prev.id, 'eventCode', v_prev.sefaz_event_code,
      'seqEvento', v_prev.sefaz_seq_evento, 'accessKey', v_prev.sefaz_access_key,
      'reason', v_prev.sefaz_reason, 'protocol', v_prot,
      'idempotentReplay', true);
  END IF;

  SELECT coalesce(max(sefaz_seq_evento), 0) + 1 INTO v_seq
    FROM public.fiscal_events
   WHERE fiscal_invoice_id = _invoice_id AND sefaz_event_code = v_code;
  IF v_seq > 20 THEN RAISE EXCEPTION 'FISCAL_EVENT_SEQUENCE_EXHAUSTED'; END IF;

  INSERT INTO public.fiscal_events (
    fiscal_invoice_id, event_type, event_source, performed_by,
    idempotency_key, payload_fingerprint, notes,
    sefaz_event_code, sefaz_seq_evento, sefaz_access_key, sefaz_reason,
    request_snapshot)
  VALUES (
    _invoice_id, v_type, 'INTERNAL', _actor,
    _idempotency_key, v_fp, left(v_reason, 2000),
    v_code, v_seq, v_inv.access_key, v_reason,
    jsonb_build_object('eventKind', _event_kind, 'protocol', v_prot,
                       'environmentCode', '2'))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'eventId', v_id, 'eventCode', v_code, 'seqEvento', v_seq,
    'accessKey', v_inv.access_key, 'reason', v_reason, 'protocol', v_prot,
    'idempotentReplay', false);
END $$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Registro do XML assinado do evento (server-side, cofre A1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_sefaz_mark_signed_v1(
  _event_id      uuid,
  _signed_path   text,
  _signed_sha256 text,
  _actor         uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_state record; v_id uuid;
BEGIN
  IF coalesce(btrim(_signed_path), '') = '' OR _signed_path NOT LIKE 'eventos/%' THEN
    RAISE EXCEPTION 'FISCAL_EVENT_SIGNED_PATH_INVALID';
  END IF;
  IF coalesce(_signed_sha256, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'FISCAL_EVENT_SIGNED_HASH_INVALID';
  END IF;

  SELECT * INTO v_state FROM public.v_fiscal_sefaz_event_state WHERE event_id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EVENT_NOT_FOUND'; END IF;

  IF v_state.state = 'SIGNED' THEN
    IF v_state.signed_xml_sha256 IS DISTINCT FROM _signed_sha256 THEN
      RAISE EXCEPTION 'FISCAL_EVENT_SIGNATURE_MISMATCH';
    END IF;
    RETURN jsonb_build_object('eventId', _event_id, 'state', 'SIGNED', 'idempotentReplay', true);
  END IF;
  IF v_state.state <> 'PREPARED' THEN
    RAISE EXCEPTION 'FISCAL_EVENT_STATE_INVALID';
  END IF;

  INSERT INTO public.fiscal_events (
    fiscal_invoice_id, event_type, event_source, performed_by, related_event_id,
    sefaz_event_code, sefaz_seq_evento, sefaz_access_key,
    signed_xml_path, signed_xml_sha256, idempotency_key, payload_fingerprint)
  VALUES (
    v_state.fiscal_invoice_id, 'SEFAZ_EVENT_SIGNED', 'INTERNAL', _actor, _event_id,
    v_state.sefaz_event_code, v_state.sefaz_seq_evento, v_state.sefaz_access_key,
    _signed_path, _signed_sha256,
    'SIGNED:' || _event_id::text, _signed_sha256)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('eventId', _event_id, 'signatureEventId', v_id,
                            'state', 'SIGNED', 'idempotentReplay', false);
END $$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_event_sefaz_mark_signed_v1(uuid,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_mark_signed_v1(uuid,text,text,uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Reconciliação append-only do retorno SEFAZ do evento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_sefaz_reconcile_v1(
  _event_id        uuid,
  _transmission_id uuid,
  _c_stat          text,
  _x_motivo        text,
  _n_prot          text DEFAULT NULL,
  _dh_registro     timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_state record; v_type text; v_key text; v_id uuid;
BEGIN
  SELECT * INTO v_state FROM public.v_fiscal_sefaz_event_state WHERE event_id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EVENT_NOT_FOUND'; END IF;
  IF coalesce(_c_stat, '') = '' THEN RAISE EXCEPTION 'FISCAL_EVENT_CSTAT_REQUIRED'; END IF;

  v_type := CASE WHEN _c_stat IN ('135','136','155')
                 THEN 'SEFAZ_EVENT_REGISTERED' ELSE 'SEFAZ_EVENT_REJECTED' END;
  v_key := 'RECONCILE:' || _event_id::text || ':' || _c_stat || ':' || coalesce(_n_prot, '-');

  IF EXISTS (
    SELECT 1 FROM public.fiscal_events
     WHERE related_event_id = _event_id AND idempotency_key = v_key) THEN
    RETURN jsonb_build_object('eventId', _event_id, 'state',
      CASE WHEN v_type = 'SEFAZ_EVENT_REGISTERED' THEN 'REGISTERED' ELSE 'REJECTED' END,
      'idempotentReplay', true);
  END IF;

  INSERT INTO public.fiscal_events (
    fiscal_invoice_id, event_type, event_source, related_event_id,
    sefaz_event_code, sefaz_seq_evento, sefaz_access_key,
    sefaz_c_stat, sefaz_n_prot, sefaz_transmission_id,
    idempotency_key, payload_fingerprint, response_snapshot, notes)
  VALUES (
    v_state.fiscal_invoice_id, v_type, 'SEFAZ_HOMOLOGATION', _event_id,
    v_state.sefaz_event_code, v_state.sefaz_seq_evento, v_state.sefaz_access_key,
    _c_stat, _n_prot, _transmission_id,
    v_key, encode(extensions.digest(v_key, 'sha256'), 'hex'),
    jsonb_build_object('cStat', _c_stat, 'xMotivo', left(coalesce(_x_motivo, ''), 200),
                       'nProt', _n_prot, 'dhRegistro', _dh_registro,
                       'environmentCode', '2'),
    left(coalesce(_x_motivo, ''), 2000))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('eventId', _event_id, 'reconciliationEventId', v_id,
    'state', CASE WHEN v_type = 'SEFAZ_EVENT_REGISTERED' THEN 'REGISTERED' ELSE 'REJECTED' END,
    'idempotentReplay', false);
END $$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_event_sefaz_reconcile_v1(uuid,uuid,text,text,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_reconcile_v1(uuid,uuid,text,text,text,timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Abertura de transmissão (v2 com vínculo canônico)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid);

CREATE OR REPLACE FUNCTION public.rpc_fiscal_sefaz_transmit_begin_v1(
  _service             text,
  _idempotency_key     text,
  _request_fingerprint text,
  _endpoint_url        text,
  _invoice_id          uuid DEFAULT NULL,
  _xml_run_id          uuid DEFAULT NULL,
  _actor               uuid DEFAULT NULL,
  _event_id            uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ref       text;
  v_prod      boolean;
  v_tpamb     text;
  v_host      text;
  v_run       public.fiscal_xml_runs;
  v_ev        record;
  v_invoice   uuid := _invoice_id;
  v_existing  public.fiscal_sefaz_transmissions;
  v_row       public.fiscal_sefaz_transmissions;
BEGIN
  IF coalesce(btrim(_idempotency_key), '') = '' OR length(_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_IDEMPOTENCY_INVALID';
  END IF;
  IF coalesce(btrim(_request_fingerprint), '') = '' THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_FINGERPRINT_REQUIRED';
  END IF;

  SELECT project_ref, production_emission_allowed INTO v_ref, v_prod
    FROM public.fiscal_environment_marker LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' OR coalesce(v_prod, true) THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  SELECT coalesce(nfe_environment_code, '') INTO v_tpamb
    FROM public.company_fiscal_settings WHERE is_active LIMIT 1;
  IF v_tpamb IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  v_host := split_part(split_part(_endpoint_url, '://', 2), '/', 1);
  IF _endpoint_url NOT LIKE 'https://hnfe.fazenda.mg.gov.br/%'
     OR v_host <> 'hnfe.fazenda.mg.gov.br' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  -- H7G-001: na autorização, o invoice é DERIVADO do XML run. O parâmetro do
  -- chamador nunca é autoridade; divergência é bloqueio duro.
  IF _service = 'NFeAutorizacao4' THEN
    IF _xml_run_id IS NULL THEN RAISE EXCEPTION 'SEFAZ_RUN_REQUIRED'; END IF;
    SELECT * INTO v_run FROM public.fiscal_xml_runs WHERE id = _xml_run_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'SEFAZ_RUN_NOT_FOUND'; END IF;
    IF v_run.state IS DISTINCT FROM 'SIGNED' OR coalesce(v_run.signed_path, '') = '' THEN
      RAISE EXCEPTION 'SEFAZ_DOCUMENT_NOT_SIGNED';
    END IF;
    IF coalesce(v_run.environment_code, '') <> '2' THEN
      RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
    END IF;
    IF coalesce(v_run.access_key, '') !~ '^[0-9]{44}$' THEN
      RAISE EXCEPTION 'SEFAZ_ACCESS_KEY_INVALID';
    END IF;
    IF v_run.fiscal_invoice_id IS NULL THEN RAISE EXCEPTION 'SEFAZ_RUN_INVOICE_MISSING'; END IF;
    IF _invoice_id IS NOT NULL AND _invoice_id IS DISTINCT FROM v_run.fiscal_invoice_id THEN
      RAISE EXCEPTION 'SEFAZ_INVOICE_RUN_MISMATCH';
    END IF;
    v_invoice := v_run.fiscal_invoice_id;
  END IF;

  -- H7G-002: no evento, invoice e chave vêm do evento fiscal canônico.
  IF _service = 'NFeRecepcaoEvento4' THEN
    IF _event_id IS NULL THEN RAISE EXCEPTION 'SEFAZ_EVENT_REQUIRED'; END IF;
    SELECT * INTO v_ev FROM public.v_fiscal_sefaz_event_state WHERE event_id = _event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'SEFAZ_EVENT_NOT_FOUND'; END IF;
    IF v_ev.state <> 'SIGNED' THEN RAISE EXCEPTION 'SEFAZ_EVENT_NOT_SIGNED'; END IF;
    IF _invoice_id IS NOT NULL AND _invoice_id IS DISTINCT FROM v_ev.fiscal_invoice_id THEN
      RAISE EXCEPTION 'SEFAZ_EVENT_INVOICE_MISMATCH';
    END IF;
    v_invoice := v_ev.fiscal_invoice_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('fiscal_sefaz_tx:' || _idempotency_key, 0));

  SELECT * INTO v_existing FROM public.fiscal_sefaz_transmissions
   WHERE idempotency_key = _idempotency_key;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM _request_fingerprint THEN
      RAISE EXCEPTION 'FISCAL_TRANSMISSION_IDEMPOTENCY_MISMATCH';
    END IF;
    RETURN jsonb_build_object(
      'transmissionId', v_existing.id, 'state', v_existing.state,
      'outcome', v_existing.outcome,
      'service', v_existing.service, 'correlationId', v_existing.correlation_id,
      'invoiceId', v_existing.fiscal_invoice_id, 'eventId', v_existing.fiscal_event_id,
      'cStat', v_existing.c_stat, 'xMotivo', v_existing.x_motivo,
      'chNFe', v_existing.ch_nfe, 'nProt', v_existing.n_prot,
      'idempotentReplay', true);
  END IF;

  -- Documento já autorizado nunca é reenviado (invoice canônico).
  IF v_invoice IS NOT NULL AND _service IN ('NFeAutorizacao4','NFeRetAutorizacao4') THEN
    SELECT * INTO v_existing FROM public.fiscal_sefaz_transmissions
     WHERE fiscal_invoice_id = v_invoice
       AND state = 'SUCCEEDED'
       AND outcome = 'AUTHORIZED'
     ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'transmissionId', v_existing.id, 'state', v_existing.state,
        'outcome', v_existing.outcome,
        'service', v_existing.service, 'correlationId', v_existing.correlation_id,
        'invoiceId', v_existing.fiscal_invoice_id,
        'cStat', v_existing.c_stat, 'xMotivo', v_existing.x_motivo,
        'chNFe', v_existing.ch_nfe, 'nProt', v_existing.n_prot,
        'alreadyAuthorized', true, 'idempotentReplay', true);
    END IF;
  END IF;

  INSERT INTO public.fiscal_sefaz_transmissions (
    fiscal_invoice_id, xml_run_id, fiscal_event_id, service, environment_code,
    endpoint_host, endpoint_url, idempotency_key, request_fingerprint,
    state, outcome, attempt, created_by)
  VALUES (v_invoice, _xml_run_id, _event_id, _service, '2',
          v_host, _endpoint_url, _idempotency_key, _request_fingerprint,
          'PENDING', 'PENDING', 1, _actor)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'transmissionId', v_row.id, 'state', v_row.state, 'outcome', v_row.outcome,
    'service', v_row.service, 'correlationId', v_row.correlation_id,
    'invoiceId', v_row.fiscal_invoice_id, 'eventId', v_row.fiscal_event_id,
    'idempotentReplay', false);
END $$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid,uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Registro do retorno + semântica de resultado (H7G-004)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_sefaz_transmit_record_v1(
  _transmission_id uuid,
  _state           text,
  _patch           jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row     public.fiscal_sefaz_transmissions;
  v_cur     public.fiscal_sefaz_transmissions;
  v_cstat   text;
  v_prot    text;
  v_outcome text;
BEGIN
  IF _state NOT IN ('SENT','SUCCEEDED','FAILED','BLOCKED') THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_STATE_INVALID';
  END IF;

  SELECT * INTO v_cur FROM public.fiscal_sefaz_transmissions WHERE id = _transmission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_TRANSMISSION_NOT_FOUND'; END IF;

  v_cstat := coalesce(_patch->>'protocolCStat', _patch->>'cStat', v_cur.c_stat);
  v_prot  := coalesce(_patch->>'nProt', v_cur.n_prot);

  IF _state IN ('FAILED','BLOCKED') THEN
    v_outcome := 'TRANSPORT_ERROR';
  ELSIF _state = 'SENT' THEN
    v_outcome := 'PENDING';
  ELSIF v_cstat IN ('100','150') AND v_prot IS NOT NULL THEN
    v_outcome := 'AUTHORIZED';
  ELSIF v_cstat IN ('135','136','155') THEN
    v_outcome := 'EVENT_REGISTERED';
  ELSIF v_cstat IN ('103','105','104','106','107','108','109','111','128') THEN
    v_outcome := CASE WHEN v_cur.service = 'NFeStatusServico4'
                      THEN 'SERVICE_INFO' ELSE 'PROCESSING' END;
  ELSE
    v_outcome := 'REJECTED';
  END IF;

  UPDATE public.fiscal_sefaz_transmissions SET
    state            = _state,
    outcome          = v_outcome,
    c_stat           = coalesce(_patch->>'cStat', c_stat),
    x_motivo         = coalesce(_patch->>'xMotivo', x_motivo),
    ch_nfe           = coalesce(_patch->>'chNFe', ch_nfe),
    n_prot           = coalesce(_patch->>'nProt', n_prot),
    n_rec            = coalesce(_patch->>'nRec', n_rec),
    ambiente_retorno = coalesce(_patch->>'tpAmb', ambiente_retorno),
    dh_recbto        = coalesce((_patch->>'dhRecbto')::timestamptz, dh_recbto),
    error_code       = coalesce(_patch->>'errorCode', error_code),
    response_summary = coalesce(_patch->'responseSummary', response_summary),
    completed_at     = CASE WHEN _state IN ('SUCCEEDED','FAILED','BLOCKED')
                            THEN now() ELSE completed_at END
  WHERE id = _transmission_id
  RETURNING * INTO v_row;

  IF v_row.ambiente_retorno IS NOT NULL AND v_row.ambiente_retorno <> '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  -- Reconciliação append-only do evento, sem sobrescrever histórico fiscal.
  IF v_row.service = 'NFeRecepcaoEvento4' AND v_row.fiscal_event_id IS NOT NULL
     AND _state = 'SUCCEEDED' AND v_cstat IS NOT NULL THEN
    PERFORM public.rpc_fiscal_event_sefaz_reconcile_v1(
      v_row.fiscal_event_id, v_row.id, v_cstat,
      coalesce(_patch->>'xMotivo', ''), v_row.n_prot, v_row.dh_recbto);
  END IF;

  RETURN jsonb_build_object(
    'transmissionId', v_row.id, 'state', v_row.state, 'outcome', v_row.outcome,
    'cStat', v_row.c_stat, 'xMotivo', v_row.x_motivo,
    'chNFe', v_row.ch_nfe, 'nProt', v_row.n_prot, 'nRec', v_row.n_rec);
END $$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Leitura sanitizada para a UI interna (inclui outcome e vínculos)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_sefaz_transmission_status_v1(
  _invoice_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_items jsonb;
BEGIN
  IF NOT public.fn_fiscal_can_read_internal(auth.uid()) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'createdAt' DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'transmissionId', t.id, 'service', t.service, 'state', t.state,
      'outcome', t.outcome,
      'invoiceId', t.fiscal_invoice_id, 'xmlRunId', t.xml_run_id,
      'eventId', t.fiscal_event_id,
      'environmentCode', t.environment_code, 'endpointHost', t.endpoint_host,
      'cStat', t.c_stat, 'xMotivo', t.x_motivo, 'chNFe', t.ch_nfe,
      'nProt', t.n_prot, 'nRec', t.n_rec, 'dhRecbto', t.dh_recbto,
      'errorCode', t.error_code, 'attempt', t.attempt,
      'correlationId', t.correlation_id,
      'createdAt', t.created_at, 'completedAt', t.completed_at) AS x
    FROM public.fiscal_sefaz_transmissions t
    WHERE (_invoice_id IS NULL OR t.fiscal_invoice_id = _invoice_id)
    ORDER BY t.created_at DESC
    LIMIT 50
  ) s;

  RETURN jsonb_build_object('ceiling', 'HOMOLOGATION', 'environmentCode', '2',
                            'items', v_items);
END $$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_sefaz_transmission_status_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_sefaz_transmission_status_v1(uuid)
  TO authenticated, service_role;

COMMIT;
