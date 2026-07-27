-- =============================================================================
-- Comunicação — Fase 4 · Recibos de entrega WhatsApp e observabilidade
-- Arquivo: restoration/comunicacao-fase4/migration.sql
-- Estado: NÃO APLICADO. Aditivo sobre Fase 2. Não altera enum outbox nem worker.
--
-- Princípio: outbox.status='sent' permanece como aceite do provedor (retorno
-- do send Meta com messages[].id). O ESTADO DE ENTREGA posterior (webhooks
-- Meta sent/delivered/read/failed/deleted) vive em colunas separadas do
-- outbox e é imutavelmente registrado em comunicacao_provider_receipts.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Campos de recibo na outbox (aditivo)
-- -----------------------------------------------------------------------------
ALTER TABLE public.comunicacao_outbox
  ADD COLUMN IF NOT EXISTS provider_delivery_status text,
  ADD COLUMN IF NOT EXISTS provider_status_at       timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at             timestamptz,
  ADD COLUMN IF NOT EXISTS read_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS provider_failed_at       timestamptz;

ALTER TABLE public.comunicacao_outbox
  DROP CONSTRAINT IF EXISTS comunicacao_outbox_provider_delivery_status_chk;

ALTER TABLE public.comunicacao_outbox
  ADD CONSTRAINT comunicacao_outbox_provider_delivery_status_chk
  CHECK (
    provider_delivery_status IS NULL
    OR provider_delivery_status IN ('sent','delivered','read','failed','deleted')
  );

-- Índice parcial para correlação por canal + provider_message_id.
-- Não unique: linhas legadas podem coexistir; precheck aborta se houver
-- colisão que impeça correlação inequívoca em produção.
CREATE INDEX IF NOT EXISTS ix_comunicacao_outbox_wa_provider_msgid
  ON public.comunicacao_outbox (canal, provider_message_id)
  WHERE canal = 'whatsapp' AND provider_message_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Tabela append-only comunicacao_provider_receipts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comunicacao_provider_receipts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id           uuid REFERENCES public.comunicacao_outbox(id) ON DELETE CASCADE,
  provider            text        NOT NULL,
  provider_message_id text        NOT NULL,
  status              text        NOT NULL,
  provider_timestamp  timestamptz NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),
  error_code          text,
  CONSTRAINT comunicacao_provider_receipts_provider_chk
    CHECK (provider IN ('whatsapp')),
  CONSTRAINT comunicacao_provider_receipts_status_chk
    CHECK (status IN ('sent','delivered','read','failed','deleted')),
  CONSTRAINT comunicacao_provider_receipts_msgid_chk
    CHECK (length(provider_message_id) BETWEEN 1 AND 255),
  CONSTRAINT comunicacao_provider_receipts_error_code_chk
    CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_.:-]{1,80}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_provider_receipts_idem
  ON public.comunicacao_provider_receipts
  (provider, provider_message_id, status, provider_timestamp);

CREATE INDEX IF NOT EXISTS ix_comunicacao_provider_receipts_outbox
  ON public.comunicacao_provider_receipts (outbox_id, received_at DESC);

-- Grants explícitos. anon sem acesso; authenticated apenas SELECT (RLS decide).
REVOKE ALL ON public.comunicacao_provider_receipts FROM PUBLIC;
REVOKE ALL ON public.comunicacao_provider_receipts FROM anon;
GRANT SELECT ON public.comunicacao_provider_receipts TO authenticated;
GRANT ALL    ON public.comunicacao_provider_receipts TO service_role;

ALTER TABLE public.comunicacao_provider_receipts ENABLE ROW LEVEL SECURITY;

-- Apenas administrador lê; escrita SOMENTE via service_role (bypassa RLS).
DROP POLICY IF EXISTS "admins read receipts" ON public.comunicacao_provider_receipts;
CREATE POLICY "admins read receipts"
  ON public.comunicacao_provider_receipts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

-- Append-only: trigger bloqueia UPDATE/DELETE mesmo para service_role.
CREATE OR REPLACE FUNCTION public.comunicacao_provider_receipts_no_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'comunicacao_provider_receipts é append-only'
    USING ERRCODE = 'insufficient_privilege';
END$$;

DROP TRIGGER IF EXISTS trg_comunicacao_provider_receipts_noupd
  ON public.comunicacao_provider_receipts;
CREATE TRIGGER trg_comunicacao_provider_receipts_noupd
  BEFORE UPDATE OR DELETE ON public.comunicacao_provider_receipts
  FOR EACH ROW EXECUTE FUNCTION public.comunicacao_provider_receipts_no_mutation();

-- -----------------------------------------------------------------------------
-- 3. RPC service_role-only rpc_record_whatsapp_delivery_status
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_record_whatsapp_delivery_status(
  p_provider_message_id text,
  p_status              text,
  p_timestamp           timestamptz,
  p_error_code          text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outbox           public.comunicacao_outbox;
  v_current_rank     int;
  v_new_rank         int;
  v_error_code_norm  text;
  v_status_upgrades  boolean;
  v_state_after      text;
  v_ts_after         timestamptz;
  v_delivered_after  timestamptz;
  v_read_after       timestamptz;
  v_failed_after     timestamptz;
BEGIN
  -- Validações de contrato (sem PII em mensagens).
  IF p_provider_message_id IS NULL OR length(p_provider_message_id) < 1
     OR length(p_provider_message_id) > 255 THEN
    RAISE EXCEPTION 'invalid_provider_message_id' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('sent','delivered','read','failed','deleted') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF p_timestamp IS NULL THEN
    RAISE EXCEPTION 'invalid_timestamp' USING ERRCODE = '22023';
  END IF;
  IF p_timestamp < timestamptz '2020-01-01'
     OR p_timestamp > now() + interval '1 day' THEN
    RAISE EXCEPTION 'timestamp_out_of_range' USING ERRCODE = '22023';
  END IF;

  v_error_code_norm := NULL;
  IF p_error_code IS NOT NULL AND length(p_error_code) > 0 THEN
    IF length(p_error_code) > 80 OR p_error_code !~ '^[a-z0-9_.:-]{1,80}$' THEN
      RAISE EXCEPTION 'invalid_error_code' USING ERRCODE = '22023';
    END IF;
    v_error_code_norm := p_error_code;
  END IF;

  -- Localiza a linha WhatsApp com FOR UPDATE (correlação inequívoca).
  SELECT *
    INTO v_outbox
    FROM public.comunicacao_outbox
   WHERE canal = 'whatsapp'
     AND provider_message_id = p_provider_message_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'ignored', true, 'reason', 'unmatched');
  END IF;

  -- Registro imutável (idempotente por índice único).
  INSERT INTO public.comunicacao_provider_receipts
    (outbox_id, provider, provider_message_id, status, provider_timestamp, error_code)
  VALUES
    (v_outbox.id, 'whatsapp', p_provider_message_id, p_status, p_timestamp, v_error_code_norm)
  ON CONFLICT (provider, provider_message_id, status, provider_timestamp) DO NOTHING;

  -- Máquina monotônica tolerante a fora de ordem:
  --   sent=1 < delivered=2 < read=3. failed é lateral: só define
  --   provider_delivery_status quando ainda não há delivered/read; um
  --   delivered/read posterior supera failed. deleted é registrado como
  --   evento mas nunca rebaixa o estado atual.
  v_current_rank := CASE v_outbox.provider_delivery_status
                      WHEN 'sent'      THEN 1
                      WHEN 'delivered' THEN 2
                      WHEN 'read'      THEN 3
                      WHEN 'failed'    THEN 1  -- lateral; permite promoção posterior
                      WHEN 'deleted'   THEN COALESCE(
                        CASE WHEN v_outbox.read_at      IS NOT NULL THEN 3
                             WHEN v_outbox.delivered_at IS NOT NULL THEN 2
                             ELSE 1 END, 1)
                      ELSE 0
                    END;

  v_new_rank := CASE p_status
                  WHEN 'sent'      THEN 1
                  WHEN 'delivered' THEN 2
                  WHEN 'read'      THEN 3
                  ELSE 0
                END;

  v_status_upgrades := false;
  v_state_after     := v_outbox.provider_delivery_status;
  v_ts_after        := v_outbox.provider_status_at;
  v_delivered_after := v_outbox.delivered_at;
  v_read_after      := v_outbox.read_at;
  v_failed_after    := v_outbox.provider_failed_at;

  IF p_status IN ('sent','delivered','read') THEN
    IF v_new_rank > v_current_rank
       OR (v_new_rank = v_current_rank AND v_outbox.provider_delivery_status IS DISTINCT FROM p_status) THEN
      v_status_upgrades := true;
      v_state_after     := p_status;
      v_ts_after        := p_timestamp;
    END IF;
    IF p_status = 'delivered' THEN
      v_delivered_after := LEAST(COALESCE(v_outbox.delivered_at, p_timestamp), p_timestamp);
    ELSIF p_status = 'read' THEN
      v_read_after := LEAST(COALESCE(v_outbox.read_at, p_timestamp), p_timestamp);
    END IF;
  ELSIF p_status = 'failed' THEN
    v_failed_after := LEAST(COALESCE(v_outbox.provider_failed_at, p_timestamp), p_timestamp);
    -- Só grava failed no estado se ainda não houve delivered/read
    IF COALESCE(v_outbox.delivered_at, v_outbox.read_at) IS NULL THEN
      v_status_upgrades := true;
      v_state_after     := 'failed';
      v_ts_after        := p_timestamp;
    END IF;
  ELSIF p_status = 'deleted' THEN
    -- Registro do evento não rebaixa; apenas atualiza provider_status_at
    -- se o estado atual já for 'deleted' ou nulo.
    IF v_outbox.provider_delivery_status IS NULL THEN
      v_status_upgrades := true;
      v_state_after     := 'deleted';
      v_ts_after        := p_timestamp;
    END IF;
  END IF;

  UPDATE public.comunicacao_outbox
     SET provider_delivery_status = v_state_after,
         provider_status_at       = v_ts_after,
         delivered_at             = v_delivered_after,
         read_at                  = v_read_after,
         provider_failed_at       = v_failed_after,
         updated_at               = now()
   WHERE id = v_outbox.id;

  INSERT INTO public.comunicacao_audit_log (acao, entidade, entity_id, actor_id, after_state)
  VALUES (
    'whatsapp_receipt',
    'comunicacao_outbox',
    v_outbox.id,
    NULL,
    jsonb_build_object(
      'status', p_status,
      'error_code', v_error_code_norm,
      'upgraded', v_status_upgrades
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outbox_id', v_outbox.id,
    'status', p_status,
    'state', v_state_after,
    'upgraded', v_status_upgrades
  );
END$$;

REVOKE ALL ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) TO service_role;

COMMIT;
