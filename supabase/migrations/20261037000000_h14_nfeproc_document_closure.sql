-- =====================================================================
-- H14 — Fechamento documental da NF-e autorizada (nfeProc).
--   1. Bucket privado `fiscal-xml` garantido (artefatos assinados/protocolados).
--   2. Registro append-only do artefato protocolado, idempotente por
--      nota/chave/protocolo, com hash SHA-256 e vinculo com a transmissao.
--   3. RPC service_role-only que so fecha a reconciliacao quando o artefato
--      esta persistido; autorizacao ja recebida NUNCA e rebaixada.
-- Projeto canonico: swzpzcwiasxmjutrmvkm. Producao permanece bloqueada.
-- =====================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker
                  WHERE project_ref = 'swzpzcwiasxmjutrmvkm'
                    AND coalesce(production_emission_allowed,true) = false) THEN
    RAISE EXCEPTION 'FISCAL_CANONICAL_TARGET_REQUIRED';
  END IF;
END $guard$;

-- 1. Bucket privado dos XML fiscais (assinado e protocolado).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fiscal-xml', 'fiscal-xml', false, 10485760, ARRAY['application/xml','text/xml'])
ON CONFLICT (id) DO NOTHING;

-- 2. Artefato protocolado. Append-only: sem UPDATE/DELETE para clientes.
CREATE TABLE IF NOT EXISTS public.fiscal_protocoled_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_invoice_id  uuid NOT NULL REFERENCES public.fiscal_invoices(id) ON DELETE RESTRICT,
  transmission_id    uuid REFERENCES public.fiscal_sefaz_transmissions(id) ON DELETE SET NULL,
  xml_run_id         uuid REFERENCES public.fiscal_xml_runs(id) ON DELETE SET NULL,
  document_model     text NOT NULL DEFAULT 'NFE',
  environment_code   text NOT NULL DEFAULT '2',
  access_key         text NOT NULL,
  protocol           text NOT NULL,
  storage_bucket     text NOT NULL DEFAULT 'fiscal-xml',
  storage_path       text NOT NULL,
  content_sha256     text NOT NULL,
  content_bytes      integer NOT NULL,
  authorized_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_protocoled_documents_key_chk CHECK (access_key ~ '^[0-9]{44}$'),
  CONSTRAINT fiscal_protocoled_documents_prot_chk CHECK (protocol ~ '^[0-9]{1,20}$'),
  CONSTRAINT fiscal_protocoled_documents_sha_chk CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT fiscal_protocoled_documents_bytes_chk CHECK (content_bytes > 0),
  CONSTRAINT fiscal_protocoled_documents_env_chk CHECK (environment_code = '2')
);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_protocoled_documents_unq
  ON public.fiscal_protocoled_documents (fiscal_invoice_id, access_key, protocol);
CREATE INDEX IF NOT EXISTS fiscal_protocoled_documents_invoice_idx
  ON public.fiscal_protocoled_documents (fiscal_invoice_id, created_at DESC);

GRANT SELECT ON public.fiscal_protocoled_documents TO authenticated;
GRANT ALL ON public.fiscal_protocoled_documents TO service_role;

ALTER TABLE public.fiscal_protocoled_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_protocoled_documents_read ON public.fiscal_protocoled_documents;
CREATE POLICY fiscal_protocoled_documents_read
  ON public.fiscal_protocoled_documents
  FOR SELECT TO authenticated
  USING (public.fn_fiscal_can_operate(auth.uid()));

-- 3. Fechamento documental idempotente.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_invoice_store_protocoled_xml_v1(
  _invoice_id uuid, _transmission_id uuid, _access_key text, _protocol text,
  _storage_path text, _content_sha256 text, _content_bytes integer,
  _xml_run_id uuid DEFAULT NULL, _storage_bucket text DEFAULT 'fiscal-xml')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_inv public.fiscal_invoices%ROWTYPE;
  v_doc public.fiscal_protocoled_documents%ROWTYPE;
  v_tx  public.fiscal_sefaz_transmissions%ROWTYPE;
  v_run uuid := _xml_run_id;
BEGIN
  IF coalesce(_access_key,'') !~ '^[0-9]{44}$'
     OR coalesce(_protocol,'') !~ '^[0-9]{1,20}$'
     OR lower(coalesce(_content_sha256,'')) !~ '^[0-9a-f]{64}$'
     OR coalesce(_content_bytes,0) <= 0
     OR nullif(btrim(coalesce(_storage_path,'')),'') IS NULL
     OR coalesce(_storage_bucket,'') <> 'fiscal-xml' THEN
    RAISE EXCEPTION 'FISCAL_PROTOCOLED_PAYLOAD_INVALID';
  END IF;

  SELECT * INTO v_inv FROM public.fiscal_invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND'; END IF;
  IF coalesce(v_inv.environment,'HOMOLOGATION') = 'PRODUCTION' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;
  IF v_inv.normalized_status <> 'AUTHORIZED' THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENT_NOT_AUTHORIZED';
  END IF;
  IF coalesce(v_inv.access_key,'') <> _access_key THEN
    RAISE EXCEPTION 'FISCAL_AUTHORIZATION_CONFLICT: chave divergente da nota autorizada.';
  END IF;

  -- O protocolo tem de vir de uma transmissao autorizada ja persistida.
  IF _transmission_id IS NOT NULL THEN
    SELECT * INTO v_tx FROM public.fiscal_sefaz_transmissions WHERE id = _transmission_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_TRANSMISSION_NOT_FOUND'; END IF;
    IF v_tx.fiscal_invoice_id IS DISTINCT FROM _invoice_id
       OR coalesce(v_tx.ch_nfe,'') <> _access_key
       OR coalesce(v_tx.n_prot,'') <> _protocol
       OR coalesce(v_tx.outcome,'') <> 'AUTHORIZED'
       OR coalesce(v_tx.ambiente_retorno,'2') <> '2' THEN
      RAISE EXCEPTION 'FISCAL_AUTHORIZATION_CONFLICT: retorno divergente do protocolo informado.';
    END IF;
    v_run := coalesce(v_run, v_tx.xml_run_id);
  END IF;

  -- Replay idempotente: mesmo artefato => no-op.
  SELECT * INTO v_doc FROM public.fiscal_protocoled_documents
   WHERE fiscal_invoice_id = _invoice_id AND access_key = _access_key AND protocol = _protocol;
  IF FOUND THEN
    IF v_doc.content_sha256 <> lower(_content_sha256) OR v_doc.storage_path <> _storage_path THEN
      INSERT INTO public.fiscal_audit_log (table_name, record_id, action, old_values, new_values, changed_by)
      VALUES ('fiscal_protocoled_documents', v_doc.id, 'CONFLICT',
              jsonb_build_object('sha256', v_doc.content_sha256, 'path', v_doc.storage_path),
              jsonb_build_object('sha256', lower(_content_sha256), 'path', _storage_path), NULL);
      RAISE EXCEPTION 'FISCAL_PROTOCOLED_DOCUMENT_CONFLICT';
    END IF;
    RETURN jsonb_build_object('invoiceId', _invoice_id, 'documentId', v_doc.id,
      'stored', false, 'replay', true, 'protocoledXmlStored', true,
      'reconciliationStatus', (SELECT reconciliation_status FROM public.fiscal_invoices WHERE id = _invoice_id));
  END IF;

  -- Conflito duro: outro protocolo ja fechou a mesma chave.
  IF EXISTS (SELECT 1 FROM public.fiscal_protocoled_documents
              WHERE fiscal_invoice_id = _invoice_id AND access_key = _access_key
                AND protocol <> _protocol) THEN
    RAISE EXCEPTION 'FISCAL_PROTOCOLED_DOCUMENT_CONFLICT';
  END IF;

  INSERT INTO public.fiscal_protocoled_documents
    (fiscal_invoice_id, transmission_id, xml_run_id, access_key, protocol,
     storage_bucket, storage_path, content_sha256, content_bytes, authorized_at)
  VALUES (_invoice_id, _transmission_id, v_run, _access_key, _protocol,
          _storage_bucket, _storage_path, lower(_content_sha256), _content_bytes,
          coalesce(v_inv.authorized_at, now()))
  RETURNING * INTO v_doc;

  UPDATE public.fiscal_invoices
     SET reconciliation_status = 'RECONCILED', updated_at = now()
   WHERE id = _invoice_id;

  INSERT INTO public.fiscal_audit_log (table_name, record_id, action, old_values, new_values, changed_by)
  VALUES ('fiscal_invoices', _invoice_id, 'UPDATE',
          jsonb_build_object('reconciliationStatus', v_inv.reconciliation_status,
                             'protocoledXmlStored', false),
          jsonb_build_object('reconciliationStatus', 'RECONCILED',
                             'protocoledXmlStored', true,
                             'protocoledDocumentId', v_doc.id,
                             'accessKey', _access_key, 'protocol', _protocol,
                             'storagePath', _storage_path,
                             'contentSha256', lower(_content_sha256)), NULL);

  RETURN jsonb_build_object('invoiceId', _invoice_id, 'documentId', v_doc.id,
    'stored', true, 'replay', false, 'protocoledXmlStored', true,
    'reconciliationStatus', 'RECONCILED');
END $$;

REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_invoice_store_protocoled_xml_v1(uuid,uuid,text,text,text,text,integer,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_invoice_store_protocoled_xml_v1(uuid,uuid,text,text,text,text,integer,uuid,text)
  TO service_role;
