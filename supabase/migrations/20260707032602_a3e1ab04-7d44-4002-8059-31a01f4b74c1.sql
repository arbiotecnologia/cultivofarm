
-- Adiciona parâmetro opcional p_partner_id (admin/gestor pode simular parceiro)
CREATE OR REPLACE FUNCTION public.rpc_portal_partner_financial(p_partner_id uuid DEFAULT NULL)
RETURNS TABLE(
  partner_order_id uuid,
  numero text,
  receivable_id uuid,
  total numeric,
  vencimento date,
  financial_status text,
  payment_method text,
  ar_status text,
  installments jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_staff boolean := (has_role(v_uid, 'administrador'::app_role) OR has_role(v_uid, 'gestor_comercial'::app_role));
  v_filter_partner uuid;
BEGIN
  IF p_partner_id IS NOT NULL THEN
    IF NOT v_is_staff THEN
      -- Parceiro só pode ver o próprio; ignora tentativa de simular
      v_filter_partner := NULL;
    ELSE
      v_filter_partner := p_partner_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    po.id, po.numero, ar.id, po.total, po.payment_due_date, po.financial_status, po.payment_method, ar.status,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', i.installment_number, 'vencimento', i.due_date,
        'valor', i.original_amount, 'recebido', i.received_amount, 'status', i.status
      ) ORDER BY i.installment_number)
      FROM public.accounts_receivable_installments i WHERE i.receivable_id = ar.id
    ), '[]'::jsonb)
  FROM public.partner_orders po
  JOIN public.partner_order_financial_links l ON l.partner_order_id = po.id
  JOIN public.accounts_receivable ar ON ar.id = l.receivable_id
  WHERE
    (
      v_filter_partner IS NOT NULL AND po.partner_id = v_filter_partner
    )
    OR (
      v_filter_partner IS NULL AND po.partner_id IN (SELECT partner_id FROM public.partner_users WHERE user_id = v_uid)
    )
  ORDER BY po.created_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_portal_partner_financial(uuid) TO authenticated;
