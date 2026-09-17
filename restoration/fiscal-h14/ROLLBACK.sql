-- ROLLBACK LOGICO da H14.
-- NAO apaga artefatos fiscais ja persistidos: a tabela
-- public.fiscal_protocoled_documents e o bucket `fiscal-xml` sao preservados,
-- porque contem evidencia de documentos autorizados.
--
-- Efeito: desativa apenas o fechamento documental automatico, voltando ao
-- comportamento H12/H13 (nota autorizada permanece com reconciliation_status
-- PENDING). Nenhuma nota autorizada e rebaixada.

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker
                  WHERE project_ref = 'swzpzcwiasxmjutrmvkm'
                    AND coalesce(production_emission_allowed,true) = false) THEN
    RAISE EXCEPTION 'FISCAL_CANONICAL_TARGET_REQUIRED';
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_invoice_store_protocoled_xml_v1(
  _invoice_id uuid, _transmission_id uuid, _access_key text, _protocol text,
  _storage_path text, _content_sha256 text, _content_bytes integer,
  _xml_run_id uuid DEFAULT NULL, _storage_bucket text DEFAULT 'fiscal-xml')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  RAISE EXCEPTION 'FISCAL_PROTOCOLED_CLOSURE_DISABLED';
END $$;

REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_invoice_store_protocoled_xml_v1(uuid,uuid,text,text,text,text,integer,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_invoice_store_protocoled_xml_v1(uuid,uuid,text,text,text,text,integer,uuid,text)
  TO service_role;
