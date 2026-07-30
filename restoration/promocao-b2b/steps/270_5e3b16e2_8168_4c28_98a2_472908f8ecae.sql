-- PACOTE DE PROMOCAO MOTOR B2B — passo 270
-- Gates server-side: recebivel pos-aprovacao e transicoes de status
-- Origem (historico, NAO modificado): supabase/migrations/20260730035515_5e3b16e2-8168-4c28-98a2-472908f8ecae.sql
-- sha256(origem) = ec2d59a8b4972b63fda3866c9278ecbf35a9899399c1e8dd326b40f4fb365715
-- Guarda de ambiente removida deste passo: a verificacao de destino e
-- centralizada e fail-closed em 000_preflight.sql (executado antes).
-- Forward-only. Nao contem fixtures, UUIDs de teste nem DROP destrutivo de dados.

-- =====================================================================
-- Fase 7 / Hardening: gates server-side ausentes detectados em runtime
--  (a) cobrança gerada para pedido ainda NÃO aprovado
--  (b) transição livre de status (inclusive a partir de reprovado)
-- =====================================================================

-- Rank canônico de estados operacionais/financeiros do pedido B2B.
CREATE OR REPLACE FUNCTION public.fn_b2b_status_is_operational(p_status partner_order_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_status IN (
    'em_producao','produzido','aguardando_entrega','confirmado',
    'em_separacao','enviado','entregue','faturado'
  )::boolean
$$;

CREATE OR REPLACE FUNCTION public.fn_b2b_status_is_approved_or_later(p_status partner_order_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_status = 'aprovado' OR public.fn_b2b_status_is_operational(p_status)
$$;

REVOKE ALL ON FUNCTION public.fn_b2b_status_is_operational(partner_order_status) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_b2b_status_is_approved_or_later(partner_order_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_operational(partner_order_status) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_b2b_status_is_approved_or_later(partner_order_status) TO authenticated, service_role;

-- (a) cobrança apenas para pedido aprovado ou já em etapa posterior.
CREATE OR REPLACE FUNCTION public.tg_b2b_block_receivable_before_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_status partner_order_status;
BEGIN
  IF NEW.partner_order_id IS NULL THEN RETURN NEW; END IF;
  SELECT status INTO v_status FROM public.partner_orders WHERE id = NEW.partner_order_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF NOT public.fn_b2b_status_is_approved_or_later(v_status) THEN
    RAISE EXCEPTION 'receivable_requires_approved_order: status=%', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_b2b_block_receivable_before_approval ON public.partner_order_financial_links;
CREATE TRIGGER trg_b2b_block_receivable_before_approval
  BEFORE INSERT ON public.partner_order_financial_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_b2b_block_receivable_before_approval();

-- (b) transição manual de status com regras explícitas.
CREATE OR REPLACE FUNCTION public.update_partner_order_status(
  p_order_id uuid,
  p_status partner_order_status,
  p_motivo text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prev partner_order_status;
  v_pid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT status, partner_id INTO v_prev, v_pid FROM public.partner_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;

  IF v_prev = p_status THEN RETURN; END IF;

  -- estados terminais não retornam por esta via
  IF v_prev IN ('reprovado','cancelado','reprovado_sem_itens') THEN
    RAISE EXCEPTION 'order_terminal_status: %', v_prev USING ERRCODE = 'check_violation';
  END IF;

  -- etapas operacionais/financeiras exigem aprovação prévia
  IF public.fn_b2b_status_is_operational(p_status)
     AND NOT public.fn_b2b_status_is_approved_or_later(v_prev) THEN
    RAISE EXCEPTION 'status_requires_approved_order: % -> %', v_prev, p_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.partner_orders SET status = p_status, updated_at = now() WHERE id = p_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_pid, v_uid, 'status_changed',
          jsonb_build_object('status', v_prev),
          jsonb_build_object('status', p_status, 'motivo', p_motivo));
END;
$function$;

REVOKE ALL ON FUNCTION public.update_partner_order_status(uuid,partner_order_status,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_partner_order_status(uuid,partner_order_status,text) TO authenticated, service_role;

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_b2b_block_receivable_before_approval') THEN
    RAISE EXCEPTION 'verify_failed: trigger de cobrança ausente';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid='public.update_partner_order_status(uuid,partner_order_status,text)'::regprocedure)
     NOT LIKE '%status_requires_approved_order%' THEN
    RAISE EXCEPTION 'verify_failed: gate de transição ausente';
  END IF;
END
$verify$;
