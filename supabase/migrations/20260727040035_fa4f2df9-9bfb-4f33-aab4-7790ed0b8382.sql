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
  CHECK (provider_delivery_status IS NULL
         OR provider_delivery_status IN ('sent','delivered','read','failed','deleted'));

DROP INDEX IF EXISTS public.ix_comunicacao_outbox_wa_provider_msgid;
CREATE UNIQUE INDEX IF NOT EXISTS ix_comunicacao_outbox_wa_provider_msgid
  ON public.comunicacao_outbox (provider_message_id)
  WHERE canal = 'whatsapp' AND provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.comunicacao_provider_receipts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id           uuid NOT NULL REFERENCES public.comunicacao_outbox(id) ON DELETE RESTRICT,
  provider            text NOT NULL,
  provider_message_id text NOT NULL,
  status              text NOT NULL,
  provider_timestamp  timestamptz NOT NULL,
  received_at         timestamptz NOT NULL DEFAULT now(),
  error_code          text,
  CONSTRAINT comunicacao_provider_receipts_provider_chk CHECK (provider IN ('whatsapp')),
  CONSTRAINT comunicacao_provider_receipts_status_chk CHECK (status IN ('sent','delivered','read','failed','deleted')),
  CONSTRAINT comunicacao_provider_receipts_msgid_chk CHECK (length(provider_message_id) BETWEEN 1 AND 200),
  CONSTRAINT comunicacao_provider_receipts_error_code_chk CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_.:-]{1,80}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_provider_receipts_idem
  ON public.comunicacao_provider_receipts (provider, provider_message_id, status, provider_timestamp);
CREATE INDEX IF NOT EXISTS ix_comunicacao_provider_receipts_outbox
  ON public.comunicacao_provider_receipts (outbox_id, received_at DESC);

REVOKE ALL ON public.comunicacao_provider_receipts FROM PUBLIC;
REVOKE ALL ON public.comunicacao_provider_receipts FROM anon;
REVOKE ALL ON public.comunicacao_provider_receipts FROM authenticated;
REVOKE ALL ON public.comunicacao_provider_receipts FROM service_role;
GRANT SELECT ON public.comunicacao_provider_receipts TO authenticated;

ALTER TABLE public.comunicacao_provider_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read receipts" ON public.comunicacao_provider_receipts;
CREATE POLICY "admins read receipts"
  ON public.comunicacao_provider_receipts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

CREATE OR REPLACE FUNCTION public.comunicacao_provider_receipts_no_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN RAISE EXCEPTION 'comunicacao_provider_receipts é append-only' USING ERRCODE='insufficient_privilege'; END$fn$;

DROP TRIGGER IF EXISTS trg_comunicacao_provider_receipts_noupd ON public.comunicacao_provider_receipts;
CREATE TRIGGER trg_comunicacao_provider_receipts_noupd
  BEFORE UPDATE OR DELETE ON public.comunicacao_provider_receipts
  FOR EACH ROW EXECUTE FUNCTION public.comunicacao_provider_receipts_no_mutation();

CREATE OR REPLACE FUNCTION public.rpc_record_whatsapp_delivery_status(
  p_provider_message_id text, p_status text, p_timestamp timestamptz, p_error_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_outbox public.comunicacao_outbox; v_error_code_norm text; v_inserted_id uuid;
  v_state_after text; v_ts_after timestamptz;
  v_delivered_after timestamptz; v_read_after timestamptz; v_failed_after timestamptz;
  v_upgraded boolean := false; v_current_state text; v_current_ts timestamptz;
BEGIN
  IF p_provider_message_id IS NULL OR length(p_provider_message_id) < 1
     OR length(p_provider_message_id) > 200 THEN
    RAISE EXCEPTION 'invalid_provider_message_id' USING ERRCODE='22023'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('sent','delivered','read','failed','deleted') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE='22023'; END IF;
  IF p_timestamp IS NULL THEN RAISE EXCEPTION 'invalid_timestamp' USING ERRCODE='22023'; END IF;
  IF p_timestamp < timestamptz '2020-01-01' OR p_timestamp > now() + interval '1 day' THEN
    RAISE EXCEPTION 'timestamp_out_of_range' USING ERRCODE='22023'; END IF;

  v_error_code_norm := NULL;
  IF p_error_code IS NOT NULL AND length(p_error_code) > 0 THEN
    IF length(p_error_code) > 80 OR p_error_code !~ '^[a-z0-9_.:-]{1,80}$' THEN
      RAISE EXCEPTION 'invalid_error_code' USING ERRCODE='22023'; END IF;
    v_error_code_norm := p_error_code;
  END IF;

  SELECT * INTO v_outbox FROM public.comunicacao_outbox
   WHERE canal = 'whatsapp' AND provider_message_id = p_provider_message_id
   ORDER BY id FOR UPDATE LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',true,'ignored',true,'reason','unmatched');
  END IF;

  INSERT INTO public.comunicacao_provider_receipts
    (outbox_id, provider, provider_message_id, status, provider_timestamp, error_code)
  VALUES (v_outbox.id,'whatsapp',p_provider_message_id,p_status,p_timestamp,v_error_code_norm)
  ON CONFLICT (provider, provider_message_id, status, provider_timestamp) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN jsonb_build_object('ok',true,'duplicated',true,'outbox_id',v_outbox.id);
  END IF;

  v_current_state := v_outbox.provider_delivery_status;
  v_current_ts := v_outbox.provider_status_at;
  v_state_after := v_current_state; v_ts_after := v_current_ts;
  v_delivered_after := v_outbox.delivered_at;
  v_read_after := v_outbox.read_at;
  v_failed_after := v_outbox.provider_failed_at;

  IF p_status = 'read' THEN
    v_read_after := LEAST(COALESCE(v_outbox.read_at, p_timestamp), p_timestamp);
    IF v_current_state IS DISTINCT FROM 'read' THEN
      v_state_after := 'read'; v_ts_after := p_timestamp; v_upgraded := true;
    END IF;
  ELSIF p_status = 'delivered' THEN
    v_delivered_after := LEAST(COALESCE(v_outbox.delivered_at, p_timestamp), p_timestamp);
    IF v_current_state NOT IN ('read','delivered') OR v_current_state IS NULL THEN
      v_state_after := 'delivered'; v_ts_after := p_timestamp; v_upgraded := true;
    END IF;
  ELSIF p_status = 'sent' THEN
    IF v_current_state IS NULL THEN
      v_state_after := 'sent'; v_ts_after := p_timestamp; v_upgraded := true;
    ELSIF v_current_state = 'sent'
          AND (v_current_ts IS NULL OR p_timestamp > v_current_ts) THEN
      v_ts_after := p_timestamp; v_upgraded := true;
    END IF;
  ELSIF p_status = 'failed' THEN
    v_failed_after := LEAST(COALESCE(v_outbox.provider_failed_at, p_timestamp), p_timestamp);
    IF v_outbox.delivered_at IS NULL AND v_outbox.read_at IS NULL
       AND v_current_state IS DISTINCT FROM 'deleted' THEN
      IF v_current_state IS NULL THEN
        v_state_after := 'failed'; v_ts_after := p_timestamp; v_upgraded := true;
      ELSIF v_current_state = 'sent' THEN
        IF v_current_ts IS NULL OR p_timestamp >= v_current_ts THEN
          v_state_after := 'failed'; v_ts_after := p_timestamp; v_upgraded := true;
        END IF;
      ELSIF v_current_state = 'failed' THEN NULL;
      END IF;
    END IF;
  ELSIF p_status = 'deleted' THEN
    IF v_current_state IS NULL THEN
      v_state_after := 'deleted'; v_ts_after := p_timestamp; v_upgraded := true;
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
  VALUES ('whatsapp_receipt','comunicacao_outbox',v_outbox.id,NULL,
    jsonb_build_object('status',p_status,'error_code',v_error_code_norm,'upgraded',v_upgraded));

  RETURN jsonb_build_object('ok',true,'outbox_id',v_outbox.id,
    'status',p_status,'state',v_state_after,'upgraded',v_upgraded);
END$fn$;

REVOKE ALL ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) TO service_role;