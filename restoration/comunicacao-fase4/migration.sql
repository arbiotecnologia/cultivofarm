-- =============================================================================
-- Comunicação — Fase 4 · Recibos de entrega WhatsApp e observabilidade
-- Arquivo: restoration/comunicacao-fase4/migration.sql
-- Estado: NÃO APLICADO. Aditivo sobre Fase 2. Não altera enum outbox nem worker.
--
-- Princípio: outbox.status='sent' permanece como aceite do provedor (retorno
-- do send Meta com messages[].id). O ESTADO DE ENTREGA posterior (webhooks
-- Meta sent/delivered/read/failed/deleted) vive em colunas separadas do
-- outbox e é imutavelmente registrado em comunicacao_provider_receipts.
--
-- CORREÇÃO CRÍTICA v2:
--   * Arquivo é TRANSACTION-NEUTRAL: sem BEGIN/COMMIT externos. A transação
--     é imposta pelo caller (apply-staging.sh via psql --single-transaction),
--     agrupando precheck+migration+postcheck em UMA única transação.
--   * Índice de correlação é UNIQUE partial (canal='whatsapp' AND
--     provider_message_id IS NOT NULL) — não meramente auxiliar.
--   * Limite de provider_message_id alinhado a 200 caracteres em receipts e RPC.
--   * INSERT ... ON CONFLICT DO NOTHING RETURNING id — se não inseriu,
--     retorna { ok:true, duplicated:true } sem UPDATE e sem novo audit.
--   * Grants diretos reduzidos: service_role NÃO tem GRANT ALL na tabela.
--     Escrita ocorre exclusivamente via RPC SECURITY DEFINER (executada como
--     owner da função). authenticated tem SELECT apenas; RLS decide.
--   * Máquina fora de ordem: falhas não são substituídas por sent mais antigo;
--     delivered/read continuam monotônicos e preservam primeiro timestamp;
--     deleted nunca rebaixa.
-- =============================================================================

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

-- Índice UNIQUE parcial para correlação inequívoca por
-- (canal='whatsapp', provider_message_id). O precheck garante que não
-- existem duplicidades legadas antes de tentar aplicar este índice.
-- Um índice não-unique aqui deixaria buraco: retiramos qualquer versão
-- não-unique previamente aplicada antes de criar a UNIQUE.
DROP INDEX IF EXISTS public.ix_comunicacao_outbox_wa_provider_msgid;
CREATE UNIQUE INDEX IF NOT EXISTS ix_comunicacao_outbox_wa_provider_msgid
  ON public.comunicacao_outbox (provider_message_id)
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
    CHECK (length(provider_message_id) BETWEEN 1 AND 200),
  CONSTRAINT comunicacao_provider_receipts_error_code_chk
    CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_.:-]{1,80}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_provider_receipts_idem
  ON public.comunicacao_provider_receipts
  (provider, provider_message_id, status, provider_timestamp);

CREATE INDEX IF NOT EXISTS ix_comunicacao_provider_receipts_outbox
  ON public.comunicacao_provider_receipts (outbox_id, received_at DESC);

-- Grants mínimos. anon sem qualquer acesso. authenticated apenas SELECT
-- (RLS restringe a admin). service_role NÃO recebe GRANT ALL: escrita
-- é feita exclusivamente pela RPC SECURITY DEFINER (executa como owner
-- da função, que possui a tabela). Revogamos DML direto explicitamente.
REVOKE ALL ON public.comunicacao_provider_receipts FROM PUBLIC;
REVOKE ALL ON public.comunicacao_provider_receipts FROM anon;
REVOKE ALL ON public.comunicacao_provider_receipts FROM authenticated;
REVOKE ALL ON public.comunicacao_provider_receipts FROM service_role;
GRANT SELECT ON public.comunicacao_provider_receipts TO authenticated;

ALTER TABLE public.comunicacao_provider_receipts ENABLE ROW LEVEL SECURITY;

-- Apenas administrador lê; escrita SOMENTE via RPC SECURITY DEFINER.
DROP POLICY IF EXISTS "admins read receipts" ON public.comunicacao_provider_receipts;
CREATE POLICY "admins read receipts"
  ON public.comunicacao_provider_receipts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

-- Append-only: trigger bloqueia UPDATE/DELETE mesmo para o owner da tabela.
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
  v_error_code_norm  text;
  v_inserted_id      uuid;
  v_state_after      text;
  v_ts_after         timestamptz;
  v_delivered_after  timestamptz;
  v_read_after       timestamptz;
  v_failed_after     timestamptz;
  v_upgraded         boolean := false;
  v_current_state    text;
  v_current_ts       timestamptz;
BEGIN
  -- Validações de contrato (sem PII em mensagens).
  IF p_provider_message_id IS NULL OR length(p_provider_message_id) < 1
     OR length(p_provider_message_id) > 200 THEN
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

  -- Localiza UNIVOCAMENTE a linha WhatsApp com FOR UPDATE.
  -- O índice UNIQUE parcial garante 0 ou 1 linha. LIMIT 1 é defesa em
  -- profundidade caso o índice seja removido acidentalmente.
  SELECT *
    INTO v_outbox
    FROM public.comunicacao_outbox
   WHERE canal = 'whatsapp'
     AND provider_message_id = p_provider_message_id
   ORDER BY id
   FOR UPDATE
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'ignored', true, 'reason', 'unmatched');
  END IF;

  -- Registro append-only idempotente. Se já existe (mesmo provider+id+status+ts),
  -- retorna duplicated=true SEM tocar em outbox e SEM emitir novo audit.
  INSERT INTO public.comunicacao_provider_receipts
    (outbox_id, provider, provider_message_id, status, provider_timestamp, error_code)
  VALUES
    (v_outbox.id, 'whatsapp', p_provider_message_id, p_status, p_timestamp, v_error_code_norm)
  ON CONFLICT (provider, provider_message_id, status, provider_timestamp) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'duplicated', true,
      'outbox_id', v_outbox.id
    );
  END IF;

  -- Máquina fora de ordem (tolerante a atrasos de rede).
  -- Regras:
  --   * delivered/read: monotônicos por rank; preserva PRIMEIRO timestamp válido
  --     em delivered_at/read_at (LEAST). Estado do provider avança e ts avança.
  --   * sent: só define estado se ainda não houver estado; nunca rebaixa failed
  --     (usa comparação de rank + timestamp).
  --   * failed: lateral. Só grava no estado se ainda não houver delivered/read.
  --     Sent MAIS ANTIGO chegando depois de failed(t2>t1) NÃO substitui failed.
  --     Failed mais antigo chegando após sent também não rebaixa se timestamp
  --     do failed for anterior ao provider_status_at atual.
  --   * deleted: registra evento e provider_failed_at pertinente ao histórico;
  --     nunca rebaixa. Só define estado se ainda for NULL.
  v_current_state   := v_outbox.provider_delivery_status;
  v_current_ts      := v_outbox.provider_status_at;
  v_state_after     := v_current_state;
  v_ts_after        := v_current_ts;
  v_delivered_after := v_outbox.delivered_at;
  v_read_after      := v_outbox.read_at;
  v_failed_after    := v_outbox.provider_failed_at;

  IF p_status = 'read' THEN
    v_read_after := LEAST(COALESCE(v_outbox.read_at, p_timestamp), p_timestamp);
    IF v_current_state IS DISTINCT FROM 'read' THEN
      v_state_after := 'read';
      v_ts_after    := p_timestamp;
      v_upgraded    := true;
    END IF;
  ELSIF p_status = 'delivered' THEN
    v_delivered_after := LEAST(COALESCE(v_outbox.delivered_at, p_timestamp), p_timestamp);
    IF v_current_state NOT IN ('read','delivered') OR v_current_state IS NULL THEN
      v_state_after := 'delivered';
      v_ts_after    := p_timestamp;
      v_upgraded    := true;
    END IF;
  ELSIF p_status = 'sent' THEN
    -- Só define 'sent' se não há estado ou o estado atual também é 'sent'
    -- com timestamp mais antigo. Nunca rebaixa delivered/read/failed.
    IF v_current_state IS NULL THEN
      v_state_after := 'sent';
      v_ts_after    := p_timestamp;
      v_upgraded    := true;
    ELSIF v_current_state = 'sent'
          AND (v_current_ts IS NULL OR p_timestamp > v_current_ts) THEN
      v_ts_after := p_timestamp;
      v_upgraded := true;
    END IF;
    -- 'failed'/'delivered'/'read'/'deleted' presentes → sent é ignorado
    -- (registro imutável já ficou em receipts).
  ELSIF p_status = 'failed' THEN
    v_failed_after := LEAST(COALESCE(v_outbox.provider_failed_at, p_timestamp), p_timestamp);
    -- failed é lateral: só grava estado se ainda não houve delivered/read.
    IF v_outbox.delivered_at IS NULL AND v_outbox.read_at IS NULL
       AND v_current_state IS DISTINCT FROM 'deleted' THEN
      -- Se já é failed, mantém timestamp mais antigo (não avança).
      IF v_current_state IS DISTINCT FROM 'failed' THEN
        v_state_after := 'failed';
        v_ts_after    := p_timestamp;
        v_upgraded    := true;
      END IF;
    END IF;
  ELSIF p_status = 'deleted' THEN
    -- Nunca rebaixa. Só grava estado se ainda for NULL.
    IF v_current_state IS NULL THEN
      v_state_after := 'deleted';
      v_ts_after    := p_timestamp;
      v_upgraded    := true;
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
      'upgraded', v_upgraded
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'outbox_id', v_outbox.id,
    'status', p_status,
    'state', v_state_after,
    'upgraded', v_upgraded
  );
END$$;

REVOKE ALL ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text) TO service_role;
