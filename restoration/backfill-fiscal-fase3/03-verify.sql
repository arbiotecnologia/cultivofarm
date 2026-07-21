-- Fase Fiscal 3.0 — verificação pós-backfill.
-- Falha rápida com raise_exception se qualquer invariante quebrar.

SET search_path = fiscal_test, public;

-- Invariante 1: nenhum registro legado foi perdido.
DO $$
DECLARE
  cnt_prod int;
  cnt_cust int;
  cnt_inv  int;
BEGIN
  SELECT count(*) INTO cnt_prod FROM fiscal_test.products;
  SELECT count(*) INTO cnt_cust FROM fiscal_test.customers;
  SELECT count(*) INTO cnt_inv  FROM fiscal_test.legacy_invoices;
  IF cnt_prod <> 4 OR cnt_cust <> 4 OR cnt_inv <> 4 THEN
    RAISE EXCEPTION 'Backfill perdeu registros: prod=% cust=% inv=%', cnt_prod, cnt_cust, cnt_inv;
  END IF;
END $$;

-- Invariante 2: uniqueness por environment permite mesma série/número em ambientes distintos.
DO $$
DECLARE
  dup_same_env int;
BEGIN
  SELECT count(*)
    INTO dup_same_env
    FROM fiscal_test.legacy_invoices
   GROUP BY company_cnpj, document_model, environment, series, invoice_number
  HAVING count(*) > 1
   LIMIT 1;
  IF COALESCE(dup_same_env, 0) > 0 THEN
    RAISE EXCEPTION 'Duplicidade dentro do mesmo environment detectada.';
  END IF;
END $$;

-- Invariante 3: função de mascaramento existe e responde corretamente.
DO $$
DECLARE
  out jsonb;
BEGIN
  SELECT public.mask_sensitive_jsonb('{"token":"abc","ok":1}'::jsonb) INTO out;
  IF out->>'token' <> '***REDACTED***' THEN
    RAISE EXCEPTION 'mask_sensitive_jsonb não mascarou token: %', out;
  END IF;
  IF (out->>'ok')::int <> 1 THEN
    RAISE EXCEPTION 'mask_sensitive_jsonb alterou valor não sensível: %', out;
  END IF;
END $$;

SELECT 'BACKFILL OK' AS resultado;
