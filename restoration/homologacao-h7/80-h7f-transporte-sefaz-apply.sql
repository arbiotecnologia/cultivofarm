-- FASE H7f — Transporte NF-e 4.00 SEFAZ-MG HOMOLOGAÇÃO (staging ikaauvsflpmamgxmkhoq).
--
-- Cria a camada de persistência do transporte SOAP, desacoplada do
-- `fiscal-xml-engine` (que continua com teto SIGNED). NÃO altera
-- `fiscal_invoices`, `fiscal_events`, `fiscal_xml_runs` nem qualquer
-- estrutura histórica: o transporte é append-only em tabela própria.
--
-- Invariantes:
--   * somente tpAmb=2 e host de homologação MG;
--   * qualquer tentativa produtiva => FISCAL_PRODUCTION_ENDPOINT_BLOCKED;
--   * idempotência por chave + fingerprint (replay estável / mismatch duro);
--   * nunca persiste segredo (senha, chave privada, master key, JWT).
BEGIN;

-- Guard duro: esta migration só roda no staging autorizado.
DO $$
DECLARE v_ref text; v_prod boolean;
BEGIN
  SELECT project_ref, production_emission_allowed
    INTO v_ref, v_prod
    FROM public.fiscal_environment_marker
   LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' OR coalesce(v_prod, true) THEN
    RAISE EXCEPTION 'H7F ABORT: ambiente nao autorizado (ref=%, prod=%)', v_ref, v_prod;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Tabela canônica de transmissões
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_sefaz_tx_idem
  ON public.fiscal_sefaz_transmissions (idempotency_key);
CREATE INDEX IF NOT EXISTS ix_fiscal_sefaz_tx_invoice
  ON public.fiscal_sefaz_transmissions (fiscal_invoice_id, service, created_at DESC);

-- 2. GRANTS (Data API): leitura interna via RLS; escrita só server-side.
REVOKE ALL ON public.fiscal_sefaz_transmissions FROM PUBLIC;
GRANT SELECT ON public.fiscal_sefaz_transmissions TO authenticated;
GRANT ALL    ON public.fiscal_sefaz_transmissions TO service_role;

-- 3. RLS
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

-- 4. Append-only + imutabilidade após estado terminal (vale para TODOS os papéis)
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
-- 5. RPC de abertura (service_role): guard de ambiente + idempotência
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_sefaz_transmit_begin_v1(
  _service             text,
  _idempotency_key     text,
  _request_fingerprint text,
  _endpoint_url        text,
  _invoice_id          uuid DEFAULT NULL,
  _xml_run_id          uuid DEFAULT NULL,
  _actor               uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ref      text;
  v_prod     boolean;
  v_tpamb    text;
  v_host     text;
  v_existing public.fiscal_sefaz_transmissions;
  v_row      public.fiscal_sefaz_transmissions;
BEGIN
  IF coalesce(btrim(_idempotency_key), '') = '' OR length(_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_IDEMPOTENCY_INVALID';
  END IF;
  IF coalesce(btrim(_request_fingerprint), '') = '' THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_FINGERPRINT_REQUIRED';
  END IF;

  -- Guard de ambiente (defesa server-side, independente da Edge Function).
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

  -- Serializa a mesma chave: concorrência real não duplica transmissão.
  PERFORM pg_advisory_xact_lock(hashtextextended('fiscal_sefaz_tx:' || _idempotency_key, 0));

  SELECT * INTO v_existing FROM public.fiscal_sefaz_transmissions
   WHERE idempotency_key = _idempotency_key;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM _request_fingerprint THEN
      RAISE EXCEPTION 'FISCAL_TRANSMISSION_IDEMPOTENCY_MISMATCH';
    END IF;
    RETURN jsonb_build_object(
      'transmissionId', v_existing.id, 'state', v_existing.state,
      'service', v_existing.service, 'correlationId', v_existing.correlation_id,
      'cStat', v_existing.c_stat, 'xMotivo', v_existing.x_motivo,
      'chNFe', v_existing.ch_nfe, 'nProt', v_existing.n_prot,
      'idempotentReplay', true);
  END IF;

  -- Nunca reenviar documento já autorizado: replay do resultado existente.
  IF _invoice_id IS NOT NULL AND _service IN ('NFeAutorizacao4','NFeRetAutorizacao4') THEN
    SELECT * INTO v_existing FROM public.fiscal_sefaz_transmissions
     WHERE fiscal_invoice_id = _invoice_id
       AND state = 'SUCCEEDED'
       AND c_stat IN ('100','150')
     ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'transmissionId', v_existing.id, 'state', v_existing.state,
        'service', v_existing.service, 'correlationId', v_existing.correlation_id,
        'cStat', v_existing.c_stat, 'xMotivo', v_existing.x_motivo,
        'chNFe', v_existing.ch_nfe, 'nProt', v_existing.n_prot,
        'alreadyAuthorized', true, 'idempotentReplay', true);
    END IF;
  END IF;

  INSERT INTO public.fiscal_sefaz_transmissions (
    fiscal_invoice_id, xml_run_id, service, environment_code,
    endpoint_host, endpoint_url, idempotency_key, request_fingerprint,
    state, attempt, created_by)
  VALUES (_invoice_id, _xml_run_id, _service, '2',
          v_host, _endpoint_url, _idempotency_key, _request_fingerprint,
          'PENDING', 1, _actor)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'transmissionId', v_row.id, 'state', v_row.state, 'service', v_row.service,
    'correlationId', v_row.correlation_id, 'idempotentReplay', false);
END $$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6. RPC de registro do retorno (service_role)
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
DECLARE v_row public.fiscal_sefaz_transmissions;
BEGIN
  IF _state NOT IN ('SENT','SUCCEEDED','FAILED','BLOCKED') THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_STATE_INVALID';
  END IF;

  UPDATE public.fiscal_sefaz_transmissions SET
    state            = _state,
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_NOT_FOUND';
  END IF;

  -- Retorno do ambiente jamais pode indicar produção.
  IF v_row.ambiente_retorno IS NOT NULL AND v_row.ambiente_retorno <> '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  RETURN jsonb_build_object(
    'transmissionId', v_row.id, 'state', v_row.state,
    'cStat', v_row.c_stat, 'xMotivo', v_row.x_motivo,
    'chNFe', v_row.ch_nfe, 'nProt', v_row.n_prot, 'nRec', v_row.n_rec);
END $$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Leitura sanitizada para a UI interna
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

  RETURN jsonb_build_object('ceiling', 'HOMOLOGATION', 'environmentCode', '2', 'items', v_items);
END $$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_sefaz_transmission_status_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_sefaz_transmission_status_v1(uuid)
  TO authenticated, service_role;

COMMIT;
