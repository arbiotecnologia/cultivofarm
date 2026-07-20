
-- ============================================================
-- FASE 7: Aprovação financeira B2B
-- ============================================================

-- Helper: notificar todos usuarios de um papel
CREATE OR REPLACE FUNCTION public._notify_role(
  p_role app_role,
  p_tipo text,
  p_titulo text,
  p_mensagem text,
  p_link text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
  SELECT ur.user_id, p_tipo, p_titulo, p_mensagem, p_link
  FROM public.user_roles ur
  WHERE ur.role = p_role;
END;
$$;

-- ============================================================
-- RPC: Aprovar condição financeira
-- ============================================================
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

-- ============================================================
-- RPC: Reprovar condição financeira
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_b2b_payment_terms_secure(
  p_partner_order_id uuid,
  p_reason text
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
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT po.payment_terms_id, po.created_by, po.numero
    INTO v_terms_id, v_created_by, v_numero
  FROM public.partner_orders po
  WHERE po.id = p_partner_order_id;

  IF v_terms_id IS NULL THEN
    RAISE EXCEPTION 'payment_terms_not_defined';
  END IF;

  UPDATE public.partner_order_payment_terms
     SET approval_status = 'rejected',
         approved_by = v_uid,
         approved_at = now(),
         approval_notes = p_reason,
         updated_at = now()
   WHERE id = v_terms_id;

  UPDATE public.partner_orders
     SET financial_approval_status = 'rejected',
         payment_condition_status = 'rejected',
         updated_at = now()
   WHERE id = p_partner_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, acao, usuario_id, dados_novos)
  VALUES (p_partner_order_id, 'payment_terms_rejected', v_uid,
          jsonb_build_object('reason', p_reason));

  IF v_created_by IS NOT NULL THEN
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_created_by, 'b2b_payment_terms',
            'Condição financeira reprovada',
            format('Pedido %s teve a condição de pagamento reprovada: %s',
                   COALESCE(v_numero,'B2B'), p_reason),
            '/comercial/pedidos-b2b');
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'rejected');
END;
$$;

-- ============================================================
-- RPC: Solicitar ajuste de condição
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_b2b_payment_terms_adjustment_secure(
  p_partner_order_id uuid,
  p_notes text
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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT (public.has_role(v_uid,'administrador')
       OR public.has_role(v_uid,'financeiro')
       OR public.has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_notes IS NULL OR btrim(p_notes) = '' THEN
    RAISE EXCEPTION 'notes_required';
  END IF;

  SELECT po.payment_terms_id, po.created_by, po.numero
    INTO v_terms_id, v_created_by, v_numero
  FROM public.partner_orders po
  WHERE po.id = p_partner_order_id;

  IF v_terms_id IS NULL THEN RAISE EXCEPTION 'payment_terms_not_defined'; END IF;

  UPDATE public.partner_order_payment_terms
     SET approval_status = 'pending',
         approval_notes = p_notes,
         updated_at = now()
   WHERE id = v_terms_id;

  UPDATE public.partner_orders
     SET financial_approval_status = 'pending',
         payment_condition_status = 'adjustment_requested',
         updated_at = now()
   WHERE id = p_partner_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, acao, usuario_id, dados_novos)
  VALUES (p_partner_order_id, 'payment_terms_adjustment_requested', v_uid,
          jsonb_build_object('notes', p_notes));

  IF v_created_by IS NOT NULL THEN
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_created_by, 'b2b_payment_terms',
            'Ajuste na condição solicitado',
            format('Pedido %s precisa de ajuste na condição de pagamento: %s',
                   COALESCE(v_numero,'B2B'), p_notes),
            '/comercial/pedidos-b2b');
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'adjustment_requested');
END;
$$;

-- ============================================================
-- RPC: Registrar observação/garantia
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_b2b_payment_terms_note_secure(
  p_partner_order_id uuid,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_terms_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT (public.has_role(v_uid,'administrador')
       OR public.has_role(v_uid,'financeiro')
       OR public.has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'note_required';
  END IF;

  SELECT payment_terms_id INTO v_terms_id FROM public.partner_orders WHERE id = p_partner_order_id;
  IF v_terms_id IS NULL THEN RAISE EXCEPTION 'payment_terms_not_defined'; END IF;

  UPDATE public.partner_order_payment_terms
     SET approval_notes = CASE
       WHEN approval_notes IS NULL OR approval_notes = ''
         THEN p_note
         ELSE approval_notes || E'\n---\n' || p_note
       END,
         updated_at = now()
   WHERE id = v_terms_id;

  INSERT INTO public.partner_order_audit_logs(order_id, acao, usuario_id, dados_novos)
  VALUES (p_partner_order_id, 'payment_terms_note_added', v_uid,
          jsonb_build_object('note', p_note));

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_b2b_payment_terms_secure(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_b2b_payment_terms_secure(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_b2b_payment_terms_adjustment_secure(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_b2b_payment_terms_note_secure(uuid, text) TO authenticated;

-- ============================================================
-- Bloqueio em generate_b2b_receivable_secure (adicionar 'rejected')
-- ============================================================
DO $migrate$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'generate_b2b_receivable_secure' LIMIT 1;
  IF v_src IS NOT NULL AND position('financial_approval_rejected' in v_src) = 0 THEN
    -- Substitui o bloco de checagem 'pending' para incluir 'rejected'
    v_new := replace(
      v_src,
      $$IF COALESCE(v_order.financial_approval_status,'not_required') = 'pending' THEN
     RAISE EXCEPTION 'financial_approval_pending';$$,
      $$IF COALESCE(v_order.financial_approval_status,'not_required') = 'pending' THEN
     RAISE EXCEPTION 'financial_approval_pending';
   END IF;
   IF COALESCE(v_order.financial_approval_status,'not_required') = 'rejected' THEN
     RAISE EXCEPTION 'financial_approval_rejected';$$
    );
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure(p_partner_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
      v_new
    );
  END IF;
END
$migrate$;

-- ============================================================
-- Bloqueio em generate_production_orders_from_partner
-- ============================================================
DO $migrate$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'generate_production_orders_from_partner' LIMIT 1;
  IF v_src IS NOT NULL AND position('financial_approval_required_before_production' in v_src) = 0 THEN
    v_new := replace(
      v_src,
      $$IF v_order_status <> 'aprovado' OR v_ready IS NOT TRUE THEN$$,
      $$-- Fase 7: bloqueia produção enquanto aprovação financeira exigida está pendente/rejeitada
   IF EXISTS (
     SELECT 1 FROM public.partner_orders po2
     WHERE po2.id = p_partner_order_id
       AND po2.requires_financial_approval = true
       AND po2.financial_approval_status IN ('pending','rejected')
   ) THEN
     RAISE EXCEPTION 'financial_approval_required_before_production';
   END IF;

   IF v_order_status <> 'aprovado' OR v_ready IS NOT TRUE THEN$$
    );
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.generate_production_orders_from_partner(p_partner_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
      v_new
    );
  END IF;
END
$migrate$;

-- ============================================================
-- Trigger de notificação: novo pedido com aprovação pendente
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_notify_payment_terms_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.requires_financial_approval = true
     AND NEW.financial_approval_status = 'pending' THEN
    PERFORM public._notify_role(
      'financeiro'::app_role,
      'b2b_payment_terms_pending',
      'Aprovação financeira pendente',
      format('Pedido B2B %s aguarda aprovação da condição de pagamento.', COALESCE(NEW.numero,'')),
      '/comercial/pedidos-b2b'
    );
    PERFORM public._notify_role(
      'administrador'::app_role,
      'b2b_payment_terms_pending',
      'Aprovação financeira pendente',
      format('Pedido B2B %s aguarda aprovação da condição de pagamento.', COALESCE(NEW.numero,'')),
      '/comercial/pedidos-b2b'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payment_terms_pending ON public.partner_orders;
CREATE TRIGGER trg_notify_payment_terms_pending
AFTER INSERT ON public.partner_orders
FOR EACH ROW
EXECUTE FUNCTION public.tg_notify_payment_terms_pending();
