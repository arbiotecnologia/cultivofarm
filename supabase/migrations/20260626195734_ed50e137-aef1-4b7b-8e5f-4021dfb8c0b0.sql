
CREATE OR REPLACE FUNCTION public.fn_financial_inconsistencies()
RETURNS TABLE(
  code text,
  severity text,
  entity_type text,
  entity_id uuid,
  description text,
  recommended_action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;

  RETURN QUERY
  -- 1. Entrega BILLED sem receivable_id
  SELECT 'DELIVERY_BILLED_NO_AR'::text, 'alta'::text, 'entregas'::text, e.id,
         'Entrega marcada como faturada sem título financeiro vinculado.'::text,
         'Reprocessar faturamento ou reverter status para PENDING_BILLING.'::text
    FROM public.entregas e
   WHERE e.financial_status = 'BILLED' AND e.receivable_id IS NULL

  UNION ALL
  -- 2. Entrega NOT_BILLABLE com receivable_id
  SELECT 'DELIVERY_NOT_BILLABLE_WITH_AR', 'alta', 'entregas', e.id,
         'Entrega marcada como sem cobrança porém possui título financeiro.',
         'Revisar status financeiro da entrega ou cancelar o título.'
    FROM public.entregas e
   WHERE e.financial_status = 'NOT_BILLABLE' AND e.receivable_id IS NOT NULL

  UNION ALL
  -- 3. Entrega com receivable_id apontando para AR inexistente
  SELECT 'DELIVERY_AR_BROKEN_FK', 'critica', 'entregas', e.id,
         'Entrega referencia um título que não existe mais.',
         'Limpar receivable_id ou recriar o título via faturamento.'
    FROM public.entregas e
    LEFT JOIN public.accounts_receivable ar ON ar.id = e.receivable_id
   WHERE e.receivable_id IS NOT NULL AND ar.id IS NULL

  UNION ALL
  -- 4. AR sem parcelas
  SELECT 'AR_NO_INSTALLMENTS', 'alta', 'accounts_receivable', ar.id,
         'Conta a receber sem parcelas geradas.',
         'Gerar parcelas manualmente ou cancelar o título.'
    FROM public.accounts_receivable ar
    LEFT JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
   WHERE ar.status <> 'CANCELED'
   GROUP BY ar.id
  HAVING count(ari.id) = 0

  UNION ALL
  -- 5. AP sem parcelas
  SELECT 'AP_NO_INSTALLMENTS', 'alta', 'accounts_payable', ap.id,
         'Conta a pagar sem parcelas geradas.',
         'Gerar parcelas manualmente ou cancelar o título.'
    FROM public.accounts_payable ap
    LEFT JOIN public.accounts_payable_installments api ON api.payable_id = ap.id
   WHERE ap.status <> 'CANCELED'
   GROUP BY ap.id
  HAVING count(api.id) = 0

  UNION ALL
  -- 6. AR PAID com parcela ainda em aberto
  SELECT 'AR_PAID_OPEN_INSTALLMENT', 'critica', 'accounts_receivable', ar.id,
         'Título marcado como PAGO mas possui parcela em aberto/parcial/vencida.',
         'Reprocessar status do título.'
    FROM public.accounts_receivable ar
   WHERE ar.status = 'PAID'
     AND EXISTS (
       SELECT 1 FROM public.accounts_receivable_installments ari
        WHERE ari.receivable_id = ar.id AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
     )

  UNION ALL
  -- 7. AP PAID com parcela ainda em aberto
  SELECT 'AP_PAID_OPEN_INSTALLMENT', 'critica', 'accounts_payable', ap.id,
         'Título marcado como PAGO mas possui parcela em aberto/parcial/vencida.',
         'Reprocessar status do título.'
    FROM public.accounts_payable ap
   WHERE ap.status = 'PAID'
     AND EXISTS (
       SELECT 1 FROM public.accounts_payable_installments api
        WHERE api.payable_id = ap.id AND api.status IN ('OPEN','PARTIAL','OVERDUE')
     )

  UNION ALL
  -- 8. Conta CANCELED com pagamento ativo (não estorno)
  SELECT 'AR_CANCELED_WITH_PAYMENT', 'alta', 'accounts_receivable', ar.id,
         'Título cancelado possui baixas ativas não estornadas.',
         'Estornar pagamentos antes de manter o cancelamento.'
    FROM public.accounts_receivable ar
   WHERE ar.status = 'CANCELED'
     AND EXISTS (
       SELECT 1 FROM public.accounts_receivable_installments ari
        JOIN public.receivable_payments rp ON rp.installment_id = ari.id
       WHERE ari.receivable_id = ar.id AND COALESCE(rp.is_reversal,false) = false
         AND NOT EXISTS (SELECT 1 FROM public.receivable_payments rp2 WHERE rp2.reversed_payment_id = rp.id)
     )

  UNION ALL
  -- 9. Recibo emitido para pagamento de estorno
  SELECT 'RECEIPT_FOR_REVERSAL', 'alta', 'financial_receipts', fr.id,
         'Recibo emitido sobre um lançamento de estorno.',
         'Cancelar o recibo.'
    FROM public.financial_receipts fr
    JOIN public.receivable_payments rp ON rp.id = fr.payment_id
   WHERE fr.status = 'ISSUED' AND rp.is_reversal = true

  UNION ALL
  -- 10. Recibo emitido para pagamento inexistente
  SELECT 'RECEIPT_PAYMENT_BROKEN_FK', 'critica', 'financial_receipts', fr.id,
         'Recibo aponta para pagamento inexistente.',
         'Cancelar o recibo ou restaurar o pagamento.'
    FROM public.financial_receipts fr
    LEFT JOIN public.receivable_payments rp ON rp.id = fr.payment_id
   WHERE fr.status = 'ISSUED' AND fr.payment_id IS NOT NULL AND rp.id IS NULL

  UNION ALL
  -- 11. NF vinculada a AR inexistente
  SELECT 'FISCAL_INVOICE_AR_BROKEN_FK', 'critica', 'fiscal_invoices', fi.id,
         'Nota fiscal vinculada a um título que não existe.',
         'Religar a NF a um título válido ou cancelá-la.'
    FROM public.fiscal_invoices fi
    LEFT JOIN public.accounts_receivable ar ON ar.id = fi.receivable_id
   WHERE fi.receivable_id IS NOT NULL AND ar.id IS NULL

  UNION ALL
  -- 12. Documento financeiro órfão (owner_id sem registro)
  SELECT 'FINANCIAL_DOC_ORPHAN', 'media', 'financial_documents', fd.id,
         'Documento financeiro vinculado a um registro inexistente ('||fd.owner_type||').',
         'Excluir logicamente ou religar a entidade correta.'
    FROM public.financial_documents fd
   WHERE fd.deleted_at IS NULL
     AND (
       (fd.owner_type = 'RECEIVABLE' AND NOT EXISTS (SELECT 1 FROM public.accounts_receivable WHERE id = fd.owner_id))
       OR (fd.owner_type = 'PAYABLE' AND NOT EXISTS (SELECT 1 FROM public.accounts_payable WHERE id = fd.owner_id))
       OR (fd.owner_type = 'FISCAL_INVOICE' AND NOT EXISTS (SELECT 1 FROM public.fiscal_invoices WHERE id = fd.owner_id))
       OR (fd.owner_type IN ('PAYMENT_RECEIVABLE') AND NOT EXISTS (SELECT 1 FROM public.receivable_payments WHERE id = fd.owner_id))
       OR (fd.owner_type IN ('PAYMENT_PAYABLE') AND NOT EXISTS (SELECT 1 FROM public.payable_payments WHERE id = fd.owner_id))
       OR (fd.owner_type = 'FINANCIAL_RECEIPT' AND NOT EXISTS (SELECT 1 FROM public.financial_receipts WHERE id = fd.owner_id))
     )

  UNION ALL
  -- 13. Entrega faturada duplicada (mesma entrega com >1 AR)
  SELECT 'DELIVERY_DUPLICATED_AR', 'critica', 'accounts_receivable', ar.id,
         'Mais de um título financeiro foi gerado para a mesma entrega.',
         'Cancelar os títulos extras.'
    FROM public.accounts_receivable ar
   WHERE ar.origin_type = 'DELIVERY'
     AND ar.origin_id IN (
       SELECT origin_id FROM public.accounts_receivable
        WHERE origin_type = 'DELIVERY' AND origin_id IS NOT NULL AND status <> 'CANCELED'
        GROUP BY origin_id HAVING count(*) > 1
     )

  ORDER BY 2, 1, 4;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_financial_inconsistencies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_financial_inconsistencies() TO authenticated;
