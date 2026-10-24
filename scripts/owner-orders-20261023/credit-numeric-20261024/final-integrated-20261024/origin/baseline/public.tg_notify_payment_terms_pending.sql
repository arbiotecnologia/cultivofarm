CREATE OR REPLACE FUNCTION public.tg_notify_payment_terms_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_should_notify boolean := false;
  v_msg text;
BEGIN
  IF NEW.requires_financial_approval IS DISTINCT FROM true
     OR NEW.financial_approval_status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := true;
  ELSE
    -- Só notifica quando entra em pending vindo de outro estado
    IF COALESCE(OLD.requires_financial_approval, false) = false
       OR COALESCE(OLD.financial_approval_status, 'not_required') <> 'pending' THEN
      v_should_notify := true;
    END IF;
  END IF;

  IF NOT v_should_notify THEN
    RETURN NEW;
  END IF;

  v_msg := format('Pedido B2B %s aguarda aprovação da condição de pagamento.', COALESCE(NEW.numero,''));

  PERFORM public._notify_role(
    'financeiro'::app_role,
    'b2b_payment_terms_pending',
    'Aprovação financeira pendente',
    v_msg,
    '/comercial/pedidos-b2b'
  );
  PERFORM public._notify_role(
    'administrador'::app_role,
    'b2b_payment_terms_pending',
    'Aprovação financeira pendente',
    v_msg,
    '/comercial/pedidos-b2b'
  );
  PERFORM public._notify_role(
    'gestor_comercial'::app_role,
    'b2b_payment_terms_pending',
    'Aprovação financeira pendente',
    v_msg,
    '/comercial/pedidos-b2b'
  );

  -- Notifica também o criador do pedido, se identificado
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link, lido)
    VALUES (
      NEW.created_by,
      'b2b_payment_terms_pending',
      'Aprovação financeira pendente',
      v_msg,
      '/comercial/pedidos-b2b',
      false
    );
  END IF;

  RETURN NEW;
END;
$function$
