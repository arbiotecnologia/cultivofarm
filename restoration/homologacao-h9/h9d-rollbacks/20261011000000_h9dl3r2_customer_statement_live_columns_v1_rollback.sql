-- ROLLBACK EXATO do forward 20261011000000 (homologação ikaauvsflpmamgxmkhoq).
-- Restaura a definição pré-forward de public.get_report_customer_statement,
-- capturada de pg_get_functiondef antes da aplicação (md5 d9eefd3dbce369d6c7cb0918199b7e57),
-- incluindo os defeitos originais (entregas.valor_total, entregas.data_entrega, i.amount).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_report_customer_statement(_customer_id uuid, _from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  WITH delivered AS (
    SELECT COALESCE(SUM(valor_total),0) AS total
    FROM entregas WHERE cliente_id = _customer_id AND data_entrega::date BETWEEN _from AND _to
  ),
  billed AS (
    SELECT COALESCE(SUM(total_amount),0) AS total
    FROM accounts_receivable
    WHERE customer_id = _customer_id AND issue_date BETWEEN _from AND _to AND status <> 'CANCELED'
  ),
  received AS (
    SELECT COALESCE(SUM(rp.amount_received),0) AS total
    FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE ar.customer_id = _customer_id AND rp.payment_date BETWEEN _from AND _to AND rp.is_reversal=false
  ),
  open_bal AS (
    SELECT COALESCE(SUM(i.amount - COALESCE((SELECT SUM(rp.amount_received) FROM receivable_payments rp WHERE rp.installment_id = i.id AND rp.is_reversal=false),0)),0) AS total
    FROM accounts_receivable_installments i
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE ar.customer_id = _customer_id AND i.status IN ('OPEN','PARTIAL','OVERDUE') AND ar.status <> 'CANCELED'
  )
  SELECT jsonb_build_object(
    'customer_id', _customer_id,
    'period', jsonb_build_object('from', _from, 'to', _to),
    'delivered', (SELECT total FROM delivered),
    'billed', (SELECT total FROM billed),
    'received', (SELECT total FROM received),
    'open_balance', (SELECT total FROM open_bal)
  ) INTO r;
  RETURN r;
END;$function$;

REVOKE ALL ON FUNCTION public.get_report_customer_statement(uuid,date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_report_customer_statement(uuid,date,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_report_customer_statement(uuid,date,date) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_report_customer_statement(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_customer_statement(uuid,date,date) TO service_role;

COMMIT;
