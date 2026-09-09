-- H9-D-L3 RETIFICAÇÃO 2 — forward 20261011000000
-- Ambiente: EXCLUSIVAMENTE homologação ikaauvsflpmamgxmkhoq.
--
-- Defeito comprovado (pré-forward):
--   public.get_report_customer_statement(uuid,date,date) referenciava colunas
--   inexistentes: entregas.valor_total, entregas.data_entrega e
--   accounts_receivable_installments.amount -> falha 42703 para chamadores
--   autorizados (admin/financeiro) e, por composição, também em
--   public.get_report_accountability(jsonb).
--
-- Schema vivo:
--   entregas: NÃO possui valor monetário. Possui receivable_id, cliente_id,
--             status (enum status_entrega), data_saida, entregue_em.
--   accounts_receivable_installments: original_amount, received_amount,
--             discount_amount, interest_amount, penalty_amount, net_amount.
--   accounts_receivable: customer_id, total_amount, issue_date, status.
--
-- Decisão sobre "delivered" (documentada):
--   Não existe fonte monetária em entregas nem em os_faturamento_base
--   (0 linhas com valor e 0 entregas vinculadas). A única fonte monetária viva
--   e inequívoca é o vínculo financeiro canônico entregas.receivable_id ->
--   accounts_receivable.total_amount. Portanto "delivered" passa a ser a soma
--   dos títulos DISTINTOS vinculados a entregas confirmadas do cliente no
--   período (sem dupla contagem quando várias entregas apontam ao mesmo
--   título) e as entregas sem vínculo financeiro são declaradas
--   explicitamente como não disponíveis, via chaves de diagnóstico
--   delivered_basis / delivered_unlinked_count — nunca estimadas.
--
-- Fórmulas canônicas alinhadas às funções já corrigidas em 20261010000000:
--   saldo em aberto = original_amount - COALESCE(received_amount,0)
--                                     - COALESCE(discount_amount,0)
--   received (regime caixa, idêntico a get_report_monthly_financial) considera
--   apenas is_reversal = false; a chave adicional received_net_of_reversals
--   expõe o valor líquido de estornos sem alterar o contrato existente.
--
-- Preservado: assinatura, retorno jsonb e chaves atuais, guarda
-- is_financial_staff(auth.uid()) antes de qualquer leitura, search_path fixo,
-- ACL explícita (postgres/authenticated/service_role), sem PUBLIC e sem anon.

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

  IF _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'Período inválido' USING ERRCODE = '22023';
  END IF;
  IF _to < _from THEN
    RAISE EXCEPTION 'Período inválido' USING ERRCODE = '22023';
  END IF;

  WITH entregas_periodo AS (
    SELECT e.id, e.receivable_id
    FROM entregas e
    WHERE e.cliente_id = _customer_id
      AND e.status = 'entregue'::status_entrega
      AND COALESCE(e.entregue_em::date, e.data_saida) BETWEEN _from AND _to
  ),
  delivered_links AS (
    SELECT DISTINCT ep.receivable_id
    FROM entregas_periodo ep
    WHERE ep.receivable_id IS NOT NULL
  ),
  delivered AS (
    SELECT COALESCE(SUM(ar.total_amount),0) AS total
    FROM delivered_links dl
    JOIN accounts_receivable ar ON ar.id = dl.receivable_id
    WHERE ar.status <> 'CANCELED'
  ),
  delivered_meta AS (
    SELECT COUNT(*) AS total_deliveries,
           COUNT(*) FILTER (WHERE ep.receivable_id IS NULL) AS unlinked
    FROM entregas_periodo ep
  ),
  billed AS (
    SELECT COALESCE(SUM(ar.total_amount),0) AS total
    FROM accounts_receivable ar
    WHERE ar.customer_id = _customer_id
      AND ar.issue_date BETWEEN _from AND _to
      AND ar.status <> 'CANCELED'
  ),
  pagamentos AS (
    SELECT COALESCE(SUM(rp.amount_received) FILTER (WHERE rp.is_reversal = false),0) AS bruto,
           COALESCE(SUM(rp.amount_received),0) AS liquido
    FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE ar.customer_id = _customer_id
      AND rp.payment_date BETWEEN _from AND _to
  ),
  open_bal AS (
    SELECT COALESCE(SUM(i.original_amount - COALESCE(i.received_amount,0) - COALESCE(i.discount_amount,0)),0) AS total
    FROM accounts_receivable_installments i
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE ar.customer_id = _customer_id
      AND i.status IN ('OPEN','PARTIAL','OVERDUE')
      AND ar.status <> 'CANCELED'
  )
  SELECT jsonb_build_object(
    'customer_id', _customer_id,
    'period', jsonb_build_object('from', _from, 'to', _to),
    'delivered', (SELECT total FROM delivered),
    'delivered_basis', 'accounts_receivable_linked_to_confirmed_deliveries',
    'delivered_deliveries_count', (SELECT total_deliveries FROM delivered_meta),
    'delivered_unlinked_count', (SELECT unlinked FROM delivered_meta),
    'billed', (SELECT total FROM billed),
    'received', (SELECT bruto FROM pagamentos),
    'received_net_of_reversals', (SELECT liquido FROM pagamentos),
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
