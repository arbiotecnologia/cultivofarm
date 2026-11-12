CREATE OR REPLACE FUNCTION public.approve_b2b_payment_terms_secure(
  p_partner_order_id uuid,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_terms_id uuid;
  v_created_by uuid;
  v_numero text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT (public.has_role(v_uid,'administrador')
       OR public.has_role(v_uid,'financeiro')
       OR public.has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT po.payment_terms_id, po.created_by, po.numero
    INTO v_terms_id, v_created_by, v_numero
  FROM public.partner_orders po
  WHERE po.id = p_partner_order_id;

  IF v_terms_id IS NULL THEN
    RAISE EXCEPTION 'payment_terms_not_defined';
  END IF;

  UPDATE public.partner_order_payment_terms
     SET approval_status = 'approved',
         approved_by = v_uid,
         approved_at = now(),
         approval_notes = COALESCE(p_notes, approval_notes),
         updated_at = now()
   WHERE id = v_terms_id;

  UPDATE public.partner_orders
     SET financial_approval_status = 'approved',
         payment_condition_status = 'approved',
         updated_at = now()
   WHERE id = p_partner_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, acao, usuario_id, dados_novos)
  VALUES (p_partner_order_id, 'payment_terms_approved', v_uid,
          jsonb_build_object('notes', p_notes));

  -- Notifica comercial (criador)
  IF v_created_by IS NOT NULL THEN
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_created_by, 'b2b_payment_terms',
            'Condição financeira aprovada',
            format('Pedido %s teve a condição de pagamento aprovada.', COALESCE(v_numero,'B2B')),
            '/comercial/pedidos-b2b');
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'approved');
END;
$$;
