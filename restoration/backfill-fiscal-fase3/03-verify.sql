-- Fase Fiscal 3.0 (complemento) — verificação pós-backfill ampliada.
-- Registra contagens antes/depois, checa órfãos, anexos, status legado,
-- ausência de AUTHORIZED indevido e conflitos de índice.
-- Falha rápida via RAISE EXCEPTION.

SET search_path = fiscal_test, public;

-- Tabela de trilha para diff antes/depois. Populada por 01-prepare + fixtures.
CREATE TABLE IF NOT EXISTS fiscal_test._backfill_baseline (
  entity text PRIMARY KEY,
  cnt_before int NOT NULL,
  cnt_after int
);

-- Snapshot ANTES (idempotente; só grava na primeira execução)
INSERT INTO fiscal_test._backfill_baseline(entity, cnt_before)
SELECT 'products', count(*) FROM fiscal_test.products
ON CONFLICT (entity) DO NOTHING;
INSERT INTO fiscal_test._backfill_baseline(entity, cnt_before)
SELECT 'customers', count(*) FROM fiscal_test.customers
ON CONFLICT (entity) DO NOTHING;
INSERT INTO fiscal_test._backfill_baseline(entity, cnt_before)
SELECT 'legacy_invoices', count(*) FROM fiscal_test.legacy_invoices
ON CONFLICT (entity) DO NOTHING;

-- Snapshot DEPOIS
UPDATE fiscal_test._backfill_baseline b
   SET cnt_after = c.cnt
  FROM (
    SELECT 'products'::text AS entity, count(*)::int AS cnt FROM fiscal_test.products
    UNION ALL SELECT 'customers', count(*) FROM fiscal_test.customers
    UNION ALL SELECT 'legacy_invoices', count(*) FROM fiscal_test.legacy_invoices
  ) c
 WHERE b.entity = c.entity;

-- Invariante 1: nenhum registro perdido, contagem >= esperada.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM fiscal_test._backfill_baseline LOOP
    IF r.cnt_after IS NULL OR r.cnt_after < r.cnt_before THEN
      RAISE EXCEPTION 'Perda de registros em %: before=% after=%',
        r.entity, r.cnt_before, r.cnt_after;
    END IF;
  END LOOP;
END $$;

-- Invariante 2: nenhum órfão em legacy_invoices (customer_id inexistente).
DO $$
DECLARE orfaos int;
BEGIN
  SELECT count(*) INTO orfaos
    FROM fiscal_test.legacy_invoices li
   WHERE li.customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM fiscal_test.customers c WHERE c.id = li.customer_id);
  IF orfaos > 0 THEN
    RAISE EXCEPTION 'Órfãos encontrados em legacy_invoices: %', orfaos;
  END IF;
END $$;

-- Invariante 3: uniqueness por environment (mesma série/número em envs distintos permitido).
DO $$
DECLARE dup int;
BEGIN
  SELECT count(*) INTO dup FROM (
    SELECT company_cnpj, document_model, environment, series, invoice_number, count(*) c
      FROM fiscal_test.legacy_invoices
     GROUP BY 1,2,3,4,5
    HAVING count(*) > 1
  ) x;
  IF dup > 0 THEN
    RAISE EXCEPTION 'Conflito de índice/uniqueness detectado (same env): %', dup;
  END IF;
END $$;

-- Invariante 4: ausência de status AUTHORIZED indevido pré-emissão.
-- Fase 3.0 não emite; qualquer AUTHORIZED aqui é bug.
DO $$
DECLARE bad int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='fiscal_test' AND table_name='legacy_invoices' AND column_name='status'
  ) THEN
    EXECUTE 'SELECT count(*) FROM fiscal_test.legacy_invoices WHERE upper(status) = ''AUTHORIZED''' INTO bad;
    IF bad > 0 THEN
      RAISE EXCEPTION 'AUTHORIZED indevido em % registros pré-emissão.', bad;
    END IF;
  END IF;
END $$;

-- Invariante 5: preservação de anexos legados (coluna opcional; se existir, não pode haver perda).
DO $$
DECLARE has_col boolean; miss int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='fiscal_test' AND table_name='legacy_invoices' AND column_name='attachments'
  ) INTO has_col;
  IF has_col THEN
    EXECUTE 'SELECT count(*) FROM fiscal_test.legacy_invoices WHERE attachments IS NULL' INTO miss;
    IF miss > 0 THEN
      RAISE EXCEPTION 'Anexos legados ausentes em % registros.', miss;
    END IF;
  END IF;
END $$;

-- Invariante 6: preservação de status legado (coluna opcional; nenhum NULL).
DO $$
DECLARE has_col boolean; miss int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='fiscal_test' AND table_name='legacy_invoices' AND column_name='legacy_status'
  ) INTO has_col;
  IF has_col THEN
    EXECUTE 'SELECT count(*) FROM fiscal_test.legacy_invoices WHERE legacy_status IS NULL' INTO miss;
    IF miss > 0 THEN
      RAISE EXCEPTION 'Status legado ausente em % registros.', miss;
    END IF;
  END IF;
END $$;

-- Invariante 7: mask_sensitive_jsonb responde no ambiente isolado.
DO $$
DECLARE out jsonb;
BEGIN
  SELECT public.mask_sensitive_jsonb('{"token":"abc","ok":1}'::jsonb) INTO out;
  IF out->>'token' <> '***REDACTED***' THEN
    RAISE EXCEPTION 'mask_sensitive_jsonb não mascarou token: %', out;
  END IF;
  IF (out->>'ok')::int <> 1 THEN
    RAISE EXCEPTION 'mask_sensitive_jsonb alterou valor não sensível: %', out;
  END IF;
END $$;

-- Relatório final
SELECT entity, cnt_before, cnt_after, (cnt_after - cnt_before) AS delta
  FROM fiscal_test._backfill_baseline
 ORDER BY entity;

SELECT 'BACKFILL OK' AS resultado;
