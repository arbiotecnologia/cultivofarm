
-- =====================================================================
-- FASE 4.2.1 — Consolidação Produção B2B
-- =====================================================================

-- Helper: pedido B2B tem OP gerada?
CREATE OR REPLACE FUNCTION public.partner_order_has_production(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.production_order_link pol
    WHERE pol.partner_order_id = _order_id
  );
$$;

-- =====================================================================
-- 1. BLOQUEAR EDIÇÃO de pedido após OP gerada
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_block_partner_order_edit_after_op()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked boolean;
BEGIN
  v_locked := public.partner_order_has_production(OLD.id);
  IF NOT v_locked THEN
    RETURN NEW;
  END IF;

  -- Campos sempre permitidos
  -- status, ready_for_production, approved_by, approved_at, approval_notes,
  -- estimated_delivery_date, observacoes, updated_at, future_financial_link

  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.desconto_total IS DISTINCT FROM OLD.desconto_total
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
     OR NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.requested_delivery_date IS DISTINCT FROM OLD.requested_delivery_date
  THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (OLD.id, OLD.partner_id, auth.uid(), 'edicao_bloqueada',
            to_jsonb(OLD), to_jsonb(NEW));
    RAISE EXCEPTION 'Este pedido já possui Ordem de Produção vinculada e não pode mais ser alterado.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_partner_order_edit_after_op ON public.partner_orders;
CREATE TRIGGER trg_block_partner_order_edit_after_op
  BEFORE UPDATE ON public.partner_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_partner_order_edit_after_op();

-- Itens: qualquer alteração após OP é bloqueada
CREATE OR REPLACE FUNCTION public.tg_block_partner_order_items_after_op()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF public.partner_order_has_production(v_order_id) THEN
    INSERT INTO public.partner_order_audit_logs (order_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (v_order_id, auth.uid(),
            CASE WHEN TG_OP='DELETE' THEN 'exclusao_item_bloqueada' ELSE 'edicao_item_bloqueada' END,
            CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
            CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
    RAISE EXCEPTION 'Itens do pedido não podem ser alterados após a geração da Ordem de Produção.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_partner_order_items_after_op ON public.partner_order_items;
CREATE TRIGGER trg_block_partner_order_items_after_op
  BEFORE INSERT OR UPDATE OR DELETE ON public.partner_order_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_partner_order_items_after_op();

-- =====================================================================
-- 2. TRAVA DE EXCLUSÃO de pedido / planejamento / link
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_block_partner_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.partner_order_has_production(OLD.id) THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores)
    VALUES (OLD.id, OLD.partner_id, auth.uid(), 'exclusao_bloqueada', to_jsonb(OLD));
    RAISE EXCEPTION 'Pedido com Ordem de Produção vinculada não pode ser excluído.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_partner_order_delete ON public.partner_orders;
CREATE TRIGGER trg_block_partner_order_delete
  BEFORE DELETE ON public.partner_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_partner_order_delete();

CREATE OR REPLACE FUNCTION public.tg_block_planning_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.production_order_link WHERE planning_id = OLD.id) THEN
    RAISE EXCEPTION 'Planejamento com OP gerada não pode ser excluído.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_planning_delete ON public.production_planning;
CREATE TRIGGER trg_block_planning_delete
  BEFORE DELETE ON public.production_planning
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_planning_delete();

CREATE OR REPLACE FUNCTION public.tg_block_production_link_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_os_status text;
BEGIN
  SELECT status::text INTO v_os_status FROM public.ordens_servico WHERE id = OLD.ordem_servico_id;
  IF v_os_status IS NOT NULL AND v_os_status <> 'aberta' THEN
    RAISE EXCEPTION 'Vínculo de produção não pode ser excluído após início/finalização da produção.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_production_link_delete ON public.production_order_link;
CREATE TRIGGER trg_block_production_link_delete
  BEFORE DELETE ON public.production_order_link
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_production_link_delete();

-- =====================================================================
-- 4. PROTEGER CAMPOS ESTRUTURAIS DA OS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_protect_os_structural_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.origem IS DISTINCT FROM OLD.origem
     OR NEW.partner_order_id IS DISTINCT FROM OLD.partner_order_id
     OR NEW.partner_order_item_id IS DISTINCT FROM OLD.partner_order_item_id
     OR NEW.produto_id IS DISTINCT FROM OLD.produto_id
     OR NEW.numero_os IS DISTINCT FROM OLD.numero_os
  THEN
    RAISE EXCEPTION 'Campos estruturais da OS (origem, vínculo B2B, produto, número) não podem ser alterados.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_os_structural_fields ON public.ordens_servico;
CREATE TRIGGER trg_protect_os_structural_fields
  BEFORE UPDATE ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_os_structural_fields();

-- =====================================================================
-- 5. KPI CAPACIDADE PRODUTIVA
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_b2b_capacity_kpis()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH os AS (
    SELECT os.status::text AS status,
           COALESCE(os.volume_total_ml, 0) / 1000.0 AS litros,
           os.updated_at,
           os.partner_order_id
    FROM public.ordens_servico os
    WHERE os.origem = 'b2b' AND os.partner_order_id IS NOT NULL
  ),
  litros AS (
    SELECT
      SUM(CASE WHEN status IN ('aberta','em_producao') THEN litros ELSE 0 END) AS litros_programados,
      SUM(CASE WHEN status = 'em_producao' THEN litros ELSE 0 END) AS litros_em_producao,
      SUM(CASE WHEN status = 'finalizada' THEN litros ELSE 0 END) AS litros_produzidos,
      SUM(CASE WHEN status = 'finalizada' AND updated_at >= date_trunc('week', now()) THEN litros ELSE 0 END) AS producao_semana,
      SUM(CASE WHEN status = 'finalizada' AND updated_at >= date_trunc('month', now()) THEN litros ELSE 0 END) AS producao_mes
    FROM os
  ),
  pedidos AS (
    SELECT
      COUNT(*) FILTER (WHERE status::text = 'em_producao') AS pedidos_em_producao,
      COUNT(*) FILTER (WHERE status::text = 'aprovado' AND ready_for_production = false) AS aguardando_planejamento,
      COUNT(*) FILTER (WHERE status::text = 'aprovado' AND ready_for_production = true
                        AND NOT EXISTS (SELECT 1 FROM public.production_order_link pol WHERE pol.partner_order_id = po.id)) AS aguardando_producao,
      COUNT(*) FILTER (WHERE status::text = 'entregue') AS pedidos_entregues,
      SUM(CASE WHEN status::text = 'entregue' THEN
            (SELECT COALESCE(SUM(os2.volume_total_ml),0)/1000.0
               FROM public.ordens_servico os2 WHERE os2.partner_order_id = po.id)
          ELSE 0 END) AS litros_entregues
    FROM public.partner_orders po
  )
  SELECT jsonb_build_object(
    'litros_programados', COALESCE((SELECT litros_programados FROM litros), 0),
    'litros_em_producao', COALESCE((SELECT litros_em_producao FROM litros), 0),
    'litros_produzidos', COALESCE((SELECT litros_produzidos FROM litros), 0),
    'litros_entregues', COALESCE((SELECT litros_entregues FROM pedidos), 0),
    'producao_semana', COALESCE((SELECT producao_semana FROM litros), 0),
    'producao_mes', COALESCE((SELECT producao_mes FROM litros), 0),
    'pedidos_em_producao', COALESCE((SELECT pedidos_em_producao FROM pedidos), 0),
    'aguardando_planejamento', COALESCE((SELECT aguardando_planejamento FROM pedidos), 0),
    'aguardando_producao', COALESCE((SELECT aguardando_producao FROM pedidos), 0),
    'pedidos_entregues', COALESCE((SELECT pedidos_entregues FROM pedidos), 0)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- =====================================================================
-- 8. VALIDAÇÃO DE INTEGRIDADE
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_b2b_integrity_check()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'administrador') AND NOT has_role(auth.uid(), 'gestor') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  SELECT jsonb_build_object(
    'pedido_sem_parceiro',
      (SELECT COUNT(*) FROM public.partner_orders po
       WHERE NOT EXISTS (SELECT 1 FROM public.partner_accounts pa WHERE pa.id = po.partner_id)),
    'planejamento_sem_pedido',
      (SELECT COUNT(*) FROM public.production_planning pp
       WHERE NOT EXISTS (SELECT 1 FROM public.partner_orders po WHERE po.id = pp.partner_order_id)),
    'os_sem_planejamento',
      (SELECT COUNT(*) FROM public.ordens_servico os
       WHERE os.origem = 'b2b' AND os.partner_order_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.production_order_link pol WHERE pol.ordem_servico_id = os.id)),
    'timeline_orfa',
      (SELECT COUNT(*) FROM public.production_timeline_events ev
       WHERE NOT EXISTS (SELECT 1 FROM public.partner_orders po WHERE po.id = ev.partner_order_id)),
    'os_orfa_b2b',
      (SELECT COUNT(*) FROM public.ordens_servico os
       WHERE os.origem = 'b2b' AND (os.partner_order_id IS NULL OR os.partner_order_item_id IS NULL)),
    'itens_sem_produto',
      (SELECT COUNT(*) FROM public.partner_order_items poi
       WHERE NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = poi.product_id)),
    'links_invalidos',
      (SELECT COUNT(*) FROM public.production_order_link pol
       WHERE NOT EXISTS (SELECT 1 FROM public.ordens_servico os WHERE os.id = pol.ordem_servico_id))
  ) INTO v;
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_b2b_capacity_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_integrity_check() TO authenticated;
