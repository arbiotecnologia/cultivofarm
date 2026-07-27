-- Harness RLS Fase 4 — read-only, simula authenticated/anon via set_config.
-- Nada é escrito. Nenhuma RPC de terminação é invocada.
\set ON_ERROR_STOP on
BEGIN;

-- Simula authenticated não-admin (uuid aleatório).
SELECT set_config('role','authenticated', true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-0000-0000-000000000042','role','authenticated')::text,
  true);

DO $$
DECLARE v_ok boolean;
BEGIN
  -- SELECT em receipts deve retornar 0 (política admin bloqueia).
  PERFORM 1 FROM public.comunicacao_provider_receipts LIMIT 1;
  -- Nenhuma exceção esperada; contagem tem que ser 0.
  IF EXISTS (SELECT 1 FROM public.comunicacao_provider_receipts) THEN
    -- Só falha se de fato conseguirmos ler algo (violação RLS).
    RAISE EXCEPTION 'harness: authenticated não-admin conseguiu ler comunicacao_provider_receipts';
  END IF;

  -- INSERT deve falhar (sem policy INSERT).
  BEGIN
    INSERT INTO public.comunicacao_provider_receipts
      (provider, provider_message_id, status, provider_timestamp)
    VALUES ('whatsapp','wamid.test','sent', now());
    RAISE EXCEPTION 'harness: INSERT como authenticated deveria falhar';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    NULL;
  END;

  -- EXECUTE da RPC service_role-only deve falhar.
  BEGIN
    PERFORM public.rpc_record_whatsapp_delivery_status('wamid.test','sent', now(), NULL);
    RAISE EXCEPTION 'harness: authenticated executou rpc_record_whatsapp_delivery_status';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    NULL;
  END;
END$$;

-- Reset e simula anon.
SELECT set_config('request.jwt.claims','', true);
SELECT set_config('role','anon', true);

DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.comunicacao_provider_receipts LIMIT 1;
    RAISE EXCEPTION 'harness: anon leu comunicacao_provider_receipts';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    NULL;
  END;

  BEGIN
    PERFORM public.rpc_record_whatsapp_delivery_status('wamid.test','sent', now(), NULL);
    RAISE EXCEPTION 'harness: anon executou rpc_record_whatsapp_delivery_status';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    NULL;
  END;
END$$;

ROLLBACK;
