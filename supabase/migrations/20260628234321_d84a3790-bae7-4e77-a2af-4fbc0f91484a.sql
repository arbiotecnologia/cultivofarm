
-- ============================================================
-- Pedidos B2B sem itens: sub-estado, bloqueio e fluxo de complementação
-- ============================================================

-- 1) Novos valores no enum partner_order_status
ALTER TYPE public.partner_order_status ADD VALUE IF NOT EXISTS 'aguardando_itens';
ALTER TYPE public.partner_order_status ADD VALUE IF NOT EXISTS 'reprovado_sem_itens';

-- 2) Colunas de rastreio em partner_orders
ALTER TABLE public.partner_orders
  ADD COLUMN IF NOT EXISTS itens_pendentes_motivo text,
  ADD COLUMN IF NOT EXISTS itens_pendentes_solicitado_em timestamptz,
  ADD COLUMN IF NOT EXISTS itens_pendentes_solicitado_por uuid,
  ADD COLUMN IF NOT EXISTS itens_pendentes_resolvido_em timestamptz;

-- 3) Trigger BEFORE UPDATE: bloqueia ir para 'aprovado' sem itens
CREATE OR REPLACE FUNCTION public.tg_partner_orders_require_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  IF NEW.status = 'aprovado' AND (OLD.status IS DISTINCT FROM 'aprovado') THEN
    SELECT count(*) INTO v_count
      FROM public.partner_order_items
     WHERE partner_order_id = NEW.id;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'no_items: pedido sem itens — não pode ser aprovado';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_orders_require_items ON public.partner_orders;
CREATE TRIGGER trg_partner_orders_require_items
BEFORE UPDATE OF status ON public.partner_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_partner_orders_require_items();

-- 4) RPC: solicitar complementação de itens (Comercial)
CREATE OR REPLACE FUNCTION public.request_partner_order_items(
  p_order_id uuid,
  p_motivo text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid; v_prev partner_order_status; v_numero text; v_partner_user uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT partner_id, status, numero INTO v_pid, v_prev, v_numero
    FROM public.partner_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF v_prev NOT IN ('em_analise_comercial','solicitado','rascunho') THEN
    RAISE EXCEPTION 'invalid_status_transition: %', v_prev;
  END IF;

  UPDATE public.partner_orders
     SET status = 'aguardando_itens',
         itens_pendentes_motivo = p_motivo,
         itens_pendentes_solicitado_em = now(),
         itens_pendentes_solicitado_por = v_uid,
         itens_pendentes_resolvido_em = NULL,
         updated_at = now()
   WHERE id = p_order_id
     AND status = v_prev;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_update: status do pedido mudou';
  END IF;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'request_items',
          jsonb_build_object('status', v_prev),
          jsonb_build_object('status','aguardando_itens','motivo',p_motivo));

  FOR v_partner_user IN SELECT user_id FROM public.partner_users WHERE partner_id = v_pid LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user, 'pedido_b2b_itens_pendentes',
            'Pedido ' || v_numero || ' — itens pendentes',
            COALESCE(p_motivo, 'O Comercial solicitou que você complete o pedido com os itens necessários.'),
            '/portal-parceiro/pedidos');
  END LOOP;
END;
$$;

-- 5) Trigger: ao inserir item em pedido aguardando_itens, devolve para análise comercial
CREATE OR REPLACE FUNCTION public.tg_partner_order_items_resolve_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status partner_order_status;
  v_pid uuid;
BEGIN
  SELECT status, partner_id INTO v_status, v_pid
    FROM public.partner_orders WHERE id = NEW.partner_order_id FOR UPDATE;

  IF v_status = 'aguardando_itens' THEN
    UPDATE public.partner_orders
       SET status = 'em_analise_comercial',
           itens_pendentes_resolvido_em = now(),
           updated_at = now()
     WHERE id = NEW.partner_order_id
       AND status = 'aguardando_itens';

    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (NEW.partner_order_id, v_pid, auth.uid(), 'items_added',
            jsonb_build_object('status','aguardando_itens'),
            jsonb_build_object('status','em_analise_comercial','item_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_order_items_resolve_pending ON public.partner_order_items;
CREATE TRIGGER trg_partner_order_items_resolve_pending
AFTER INSERT ON public.partner_order_items
FOR EACH ROW EXECUTE FUNCTION public.tg_partner_order_items_resolve_pending();

-- 6) RPC: rejeição automática por SLA (chamada por edge/cron ou manualmente)
CREATE OR REPLACE FUNCTION public.auto_reject_partner_orders_no_items(
  p_horas int DEFAULT 72
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0; v_rec record;
BEGIN
  FOR v_rec IN
    SELECT id, partner_id, numero
      FROM public.partner_orders
     WHERE status = 'aguardando_itens'
       AND itens_pendentes_solicitado_em IS NOT NULL
       AND itens_pendentes_solicitado_em < now() - make_interval(hours => p_horas)
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.partner_orders
       SET status = 'reprovado_sem_itens',
           approved_at = now(),
           updated_at = now()
     WHERE id = v_rec.id AND status = 'aguardando_itens';

    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (v_rec.id, v_rec.partner_id, NULL, 'auto_rejected_no_items',
            jsonb_build_object('status','aguardando_itens'),
            jsonb_build_object('status','reprovado_sem_itens','sla_horas',p_horas));

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
