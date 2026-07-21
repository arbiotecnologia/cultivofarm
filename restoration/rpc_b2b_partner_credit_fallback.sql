-- Aplicar externamente no Supabase (projeto navfzbwgwzruipouyfnk).
-- Fallback do limite de crédito B2B + backfill idempotente.
-- Não altera regras de negócio, permissões ou RLS.

CREATE OR REPLACE FUNCTION public.rpc_b2b_partner_credit(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit numeric(14,2);
  v_limit_settings numeric(14,2);
  v_limit_account numeric(14,2);
  v_limit_source text;
  v_open  numeric(14,2);
  v_overdue numeric(14,2);
  v_disponivel numeric(14,2);
  v_pct numeric(6,2);
  v_tolerance int;
  v_block_if_overdue boolean;
  v_action text;
BEGIN
  SELECT COALESCE(credit_limit,0), COALESCE(overdue_tolerance_days,0),
         COALESCE(block_if_overdue,false), COALESCE(credit_limit_action,'block')
    INTO v_limit_settings, v_tolerance, v_block_if_overdue, v_action
  FROM public.partner_financial_settings WHERE partner_id = p_partner_id;

  SELECT COALESCE(limite_credito_brl, 0)
    INTO v_limit_account
  FROM public.partner_accounts WHERE id = p_partner_id;

  IF COALESCE(v_limit_settings, 0) > 0 THEN
    v_limit := v_limit_settings;
    v_limit_source := 'partner_financial_settings';
  ELSE
    v_limit := COALESCE(v_limit_account, 0);
    v_limit_source := CASE WHEN COALESCE(v_limit_account,0) > 0
                           THEN 'partner_accounts_fallback'
                           ELSE 'none' END;
  END IF;

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0)
    INTO v_open
  FROM public.accounts_receivable ar
  JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.partner_id = p_partner_id
    AND ar.status <> 'CANCELED'
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0)
    INTO v_overdue
  FROM public.accounts_receivable ar
  JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.partner_id = p_partner_id
    AND ar.status <> 'CANCELED'
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
    AND ari.due_date < (current_date - v_tolerance);

  v_disponivel := GREATEST(COALESCE(v_limit,0) - COALESCE(v_open,0), 0);
  v_pct := CASE WHEN COALESCE(v_limit,0) > 0 THEN ROUND((v_open / v_limit) * 100, 2) ELSE 0 END;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'credit_limit', v_limit,
    'credit_limit_source', v_limit_source,
    'saldo_em_aberto', v_open,
    'saldo_vencido', v_overdue,
    'credito_disponivel', v_disponivel,
    'percentual_utilizado', v_pct,
    'overdue_tolerance_days', v_tolerance,
    'block_if_overdue', v_block_if_overdue,
    'credit_limit_action', v_action,
    'tem_vencidos', v_overdue > 0
  );
END;$$;

-- Backfill idempotente
INSERT INTO public.partner_financial_settings (partner_id, credit_limit)
SELECT pa.id, pa.limite_credito_brl
FROM public.partner_accounts pa
LEFT JOIN public.partner_financial_settings pfs ON pfs.partner_id = pa.id
WHERE pa.limite_credito_brl IS NOT NULL
  AND pa.limite_credito_brl > 0
  AND pfs.partner_id IS NULL
ON CONFLICT (partner_id) DO NOTHING;

UPDATE public.partner_financial_settings pfs
SET credit_limit = pa.limite_credito_brl
FROM public.partner_accounts pa
WHERE pfs.partner_id = pa.id
  AND COALESCE(pfs.credit_limit, 0) = 0
  AND COALESCE(pa.limite_credito_brl, 0) > 0;
