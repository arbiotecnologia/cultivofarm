
-- =====================================================================
-- FASE 1 + 2: Sincronização automática de production_planning.status
-- + Timeline + Notificação ao parceiro
-- =====================================================================

CREATE OR REPLACE FUNCTION public.recalc_partner_order_production(p_partner_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planning_id   uuid;
  v_partner_id    uuid;
  v_numero        text;
  v_total         int;
  v_em_producao   int;
  v_produzidos    int;
  v_entregues     int;
  v_new_status    production_planning_status;
  v_old_status    production_planning_status;
BEGIN
  SELECT pp.id, pp.status, po.partner_id, po.numero
    INTO v_planning_id, v_old_status, v_partner_id, v_numero
  FROM public.production_planning pp
  JOIN public.partner_orders     po ON po.id = pp.partner_order_id
  WHERE pp.partner_order_id = p_partner_order_id;

  IF v_planning_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE os.status IN ('em_producao','em_cq','envase','pronto_entrega','entregue','finalizada')),
    COUNT(*) FILTER (WHERE os.status IN ('pronto_entrega','entregue','finalizada')),
    COUNT(*) FILTER (WHERE os.status IN ('entregue','finalizada'))
  INTO v_total, v_em_producao, v_produzidos, v_entregues
  FROM public.production_order_link l
  JOIN public.ordens_servico os ON os.id = l.ordem_servico_id
  WHERE l.partner_order_id = p_partner_order_id;

  IF v_total = 0 THEN
    v_new_status := 'aguardando_planejamento';
  ELSIF v_entregues = v_total THEN
    v_new_status := 'entregue';
  ELSIF v_produzidos = v_total THEN
    v_new_status := 'produzido';
  ELSIF v_em_producao > 0 THEN
    v_new_status := 'em_producao';
  ELSE
    v_new_status := 'planejado';
  END IF;

  IF v_new_status IS DISTINCT FROM v_old_status THEN
    UPDATE public.production_planning
       SET status = v_new_status,
           updated_at = now()
     WHERE id = v_planning_id;

    INSERT INTO public.production_timeline_events (partner_order_id, event_type, meta)
    VALUES (
      p_partner_order_id,
      CASE v_new_status
        WHEN 'planejado'   THEN 'op_gerada'
        WHEN 'em_producao' THEN 'producao_iniciada'
        WHEN 'produzido'   THEN 'producao_finalizada'
        WHEN 'entregue'    THEN 'entrega_realizada'
        ELSE 'status_alterado'
      END,
      jsonb_build_object(
        'from', v_old_status::text,
        'to',   v_new_status::text,
        'total_ops', v_total,
        'em_producao', v_em_producao,
        'produzidos', v_produzidos,
        'entregues', v_entregues
      )
    );

    IF v_new_status IN ('em_producao','produzido','entregue') THEN
      INSERT INTO public.notificacoes_operacionais (usuario_id, tipo, titulo, mensagem, link)
      SELECT pu.user_id,
             'pedido_b2b',
             CASE v_new_status
               WHEN 'em_producao' THEN 'Pedido ' || v_numero || ' em produção'
               WHEN 'produzido'   THEN 'Pedido ' || v_numero || ' pronto para expedição'
               WHEN 'entregue'    THEN 'Pedido ' || v_numero || ' entregue'
             END,
             CASE v_new_status
               WHEN 'em_producao' THEN 'A produção do seu pedido foi iniciada.'
               WHEN 'produzido'   THEN 'Produção concluída. Aguardando envase e expedição.'
               WHEN 'entregue'    THEN 'Seu pedido foi entregue.'
             END,
             '/portal-parceiro/pedidos'
        FROM public.partner_users pu
       WHERE pu.partner_id = v_partner_id;
    END IF;
  END IF;
END;
$$;

-- Trigger em ordens_servico: dispara quando o status muda
CREATE OR REPLACE FUNCTION public.tg_recalc_planning_from_os()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT l.partner_order_id INTO v_po
    FROM public.production_order_link l
   WHERE l.ordem_servico_id = NEW.id
   LIMIT 1;

  IF v_po IS NOT NULL THEN
    PERFORM public.recalc_partner_order_production(v_po);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_planning_from_os ON public.ordens_servico;
CREATE TRIGGER trg_recalc_planning_from_os
AFTER UPDATE OF status ON public.ordens_servico
FOR EACH ROW
EXECUTE FUNCTION public.tg_recalc_planning_from_os();

-- Trigger em production_order_link: ao gerar OP, planejamento vai para 'planejado'
CREATE OR REPLACE FUNCTION public.tg_recalc_planning_from_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_partner_order_production(NEW.partner_order_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_planning_from_link ON public.production_order_link;
CREATE TRIGGER trg_recalc_planning_from_link
AFTER INSERT ON public.production_order_link
FOR EACH ROW
EXECUTE FUNCTION public.tg_recalc_planning_from_link();

-- Trigger em entregas: confirmação de entrega também recalcula
CREATE OR REPLACE FUNCTION public.tg_recalc_planning_from_entrega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po uuid;
BEGIN
  IF NEW.ordem_servico_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.partner_order_id INTO v_po
    FROM public.production_order_link l
   WHERE l.ordem_servico_id = NEW.ordem_servico_id
   LIMIT 1;

  IF v_po IS NOT NULL THEN
    PERFORM public.recalc_partner_order_production(v_po);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_planning_from_entrega ON public.entregas;
CREATE TRIGGER trg_recalc_planning_from_entrega
AFTER INSERT OR UPDATE OF status ON public.entregas
FOR EACH ROW
EXECUTE FUNCTION public.tg_recalc_planning_from_entrega();

-- =====================================================================
-- FASE 4: Coluna partner_order_id em entregas
-- =====================================================================

ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS partner_order_id uuid REFERENCES public.partner_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_entregas_partner_order ON public.entregas(partner_order_id);
