
-- ============================================================
-- FASE 4: B2B × PRODUCTION INTEGRATION
-- ============================================================

-- 1. AJUSTES EM ordens_servico
ALTER TABLE public.ordens_servico
  ALTER COLUMN cliente_id DROP NOT NULL,
  ALTER COLUMN fazenda_id DROP NOT NULL,
  ALTER COLUMN talhao_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS partner_order_id uuid REFERENCES public.partner_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_order_item_id uuid REFERENCES public.partner_order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'agronomica';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_partner_order_item_unique') THEN
    ALTER TABLE public.ordens_servico
      ADD CONSTRAINT ordens_servico_partner_order_item_unique UNIQUE (partner_order_item_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_origem_check') THEN
    ALTER TABLE public.ordens_servico
      ADD CONSTRAINT ordens_servico_origem_check CHECK (origem IN ('agronomica','b2b'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordens_servico_origem_required_fields') THEN
    ALTER TABLE public.ordens_servico
      ADD CONSTRAINT ordens_servico_origem_required_fields CHECK (
        (origem = 'agronomica' AND cliente_id IS NOT NULL AND fazenda_id IS NOT NULL AND talhao_id IS NOT NULL)
        OR (origem = 'b2b' AND partner_order_item_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ordens_servico_partner_order ON public.ordens_servico(partner_order_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_partner_item ON public.ordens_servico(partner_order_item_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_origem ON public.ordens_servico(origem);

-- 2. ENUM e TABELAS NOVAS
DO $$ BEGIN
  CREATE TYPE public.production_planning_status AS ENUM (
    'aguardando_planejamento','planejado','em_producao','produzido','entregue','cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.production_planning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_order_id uuid NOT NULL UNIQUE REFERENCES public.partner_orders(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  status public.production_planning_status NOT NULL DEFAULT 'aguardando_planejamento',
  planned_start_date date,
  planned_finish_date date,
  production_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_planning TO authenticated;
GRANT ALL ON public.production_planning TO service_role;
ALTER TABLE public.production_planning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planning_select_staff" ON public.production_planning FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')
      OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY "planning_modify_staff" ON public.production_planning FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'gestor'));

CREATE INDEX IF NOT EXISTS idx_planning_partner ON public.production_planning(partner_id);
CREATE INDEX IF NOT EXISTS idx_planning_status ON public.production_planning(status);

CREATE TABLE IF NOT EXISTS public.production_order_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_order_id uuid NOT NULL REFERENCES public.partner_orders(id) ON DELETE CASCADE,
  partner_order_item_id uuid NOT NULL UNIQUE REFERENCES public.partner_order_items(id) ON DELETE CASCADE,
  planning_id uuid NOT NULL REFERENCES public.production_planning(id) ON DELETE CASCADE,
  ordem_servico_id uuid NOT NULL REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_order_link TO authenticated;
GRANT ALL ON public.production_order_link TO service_role;
ALTER TABLE public.production_order_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY "polink_select_staff" ON public.production_order_link FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')
      OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY "polink_modify_staff" ON public.production_order_link FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'gestor'));
CREATE INDEX IF NOT EXISTS idx_polink_partner_order ON public.production_order_link(partner_order_id);
CREATE INDEX IF NOT EXISTS idx_polink_os ON public.production_order_link(ordem_servico_id);

CREATE TABLE IF NOT EXISTS public.production_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_order_id uuid NOT NULL REFERENCES public.partner_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT ON public.production_timeline_events TO authenticated;
GRANT ALL ON public.production_timeline_events TO service_role;
ALTER TABLE public.production_timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ptl_select_staff_or_partner" ON public.production_timeline_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor_comercial')
    OR public.has_role(auth.uid(),'producao') OR public.has_role(auth.uid(),'gestor')
    OR EXISTS (
      SELECT 1 FROM public.partner_orders po
      JOIN public.partner_users pu ON pu.partner_id = po.partner_id
      WHERE po.id = production_timeline_events.partner_order_id
        AND pu.user_id = auth.uid()
    )
  );
CREATE POLICY "ptl_insert_service" ON public.production_timeline_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_ptl_partner_order ON public.production_timeline_events(partner_order_id, event_at DESC);

-- 3. updated_at trigger
DROP TRIGGER IF EXISTS trg_planning_updated_at ON public.production_planning;
CREATE TRIGGER trg_planning_updated_at BEFORE UPDATE ON public.production_planning
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. PLACEHOLDER FASE 5
ALTER TABLE public.partner_orders
  ADD COLUMN IF NOT EXISTS future_financial_link uuid;

-- 5. TRIGGER: criar planejamento ao aprovar comercial
CREATE OR REPLACE FUNCTION public.trg_partner_order_to_planning_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.ready_for_production = true AND (OLD.ready_for_production IS DISTINCT FROM NEW.ready_for_production) THEN
    INSERT INTO public.production_planning (partner_order_id, partner_id, status, created_by)
    VALUES (NEW.id, NEW.partner_id, 'aguardando_planejamento', NEW.approved_by)
    ON CONFLICT (partner_order_id) DO NOTHING;

    INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
    VALUES (NEW.id, 'planejamento_criado', NEW.approved_by, jsonb_build_object('approved_at', NEW.approved_at));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_partner_order_to_planning ON public.partner_orders;
CREATE TRIGGER trg_partner_order_to_planning
  AFTER UPDATE ON public.partner_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_partner_order_to_planning_fn();

-- 6. RPC: gerar OS a partir do pedido B2B
CREATE OR REPLACE FUNCTION public.generate_production_orders_from_partner(p_partner_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_planning_id uuid;
  v_item RECORD;
  v_os_id uuid;
  v_numero text;
  v_count int := 0;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'gestor')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT id INTO v_planning_id FROM public.production_planning WHERE partner_order_id = p_partner_order_id;
  IF v_planning_id IS NULL THEN
    RAISE EXCEPTION 'planejamento não encontrado para o pedido %', p_partner_order_id;
  END IF;

  FOR v_item IN
    SELECT poi.* FROM public.partner_order_items poi
    WHERE poi.order_id = p_partner_order_id
      AND NOT EXISTS (SELECT 1 FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id)
  LOOP
    v_numero := 'OS-B2B-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.ordens_servico (
      cliente_id, fazenda_id, talhao_id, produto_id, volume_total_ml,
      prioridade, status, tipo_item, numero_os,
      partner_order_id, partner_order_item_id, origem
    ) VALUES (
      NULL, NULL, NULL, v_item.product_id, v_item.quantidade,
      'media','aprovada','produto', v_numero,
      p_partner_order_id, v_item.id, 'b2b'
    ) RETURNING id INTO v_os_id;

    INSERT INTO public.production_order_link (
      partner_order_id, partner_order_item_id, planning_id, ordem_servico_id, created_by
    ) VALUES (p_partner_order_id, v_item.id, v_planning_id, v_os_id, v_uid);

    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    UPDATE public.production_planning
       SET status = 'planejado', updated_at = now()
     WHERE id = v_planning_id AND status = 'aguardando_planejamento';

    INSERT INTO public.production_timeline_events (partner_order_id, event_type, actor_id, meta)
    VALUES (p_partner_order_id, 'op_gerada', v_uid, jsonb_build_object('os_count', v_count));
  END IF;

  RETURN jsonb_build_object('ok', true, 'os_created', v_count, 'planning_id', v_planning_id);
END $$;

GRANT EXECUTE ON FUNCTION public.generate_production_orders_from_partner(uuid) TO authenticated;

-- 7. TRIGGER: sincroniza status do pedido B2B com OSs
CREATE OR REPLACE FUNCTION public.trg_os_sync_partner_order_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner_order_id uuid;
  v_total int; v_done int; v_in_prod int;
  v_new_status public.partner_order_status;
  v_old_status public.partner_order_status;
BEGIN
  v_partner_order_id := COALESCE(NEW.partner_order_id, OLD.partner_order_id);
  IF v_partner_order_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status IN ('pronto_entrega','entregue','finalizada')),
         COUNT(*) FILTER (WHERE status IN ('em_producao','em_cq','envase','programada'))
    INTO v_total, v_done, v_in_prod
    FROM public.ordens_servico WHERE partner_order_id = v_partner_order_id;

  SELECT status INTO v_old_status FROM public.partner_orders WHERE id = v_partner_order_id;

  IF v_total > 0 AND v_done = v_total THEN
    v_new_status := 'produzido';
  ELSIF v_in_prod > 0 THEN
    v_new_status := 'em_producao';
  ELSE
    v_new_status := v_old_status;
  END IF;

  IF v_new_status IS DISTINCT FROM v_old_status THEN
    UPDATE public.partner_orders SET status = v_new_status, updated_at = now() WHERE id = v_partner_order_id;
    UPDATE public.production_planning SET status = v_new_status::text::public.production_planning_status, updated_at = now()
      WHERE partner_order_id = v_partner_order_id;
    INSERT INTO public.production_timeline_events (partner_order_id, event_type, meta)
    VALUES (v_partner_order_id,
            CASE WHEN v_new_status = 'produzido' THEN 'producao_finalizada' ELSE 'producao_iniciada' END,
            jsonb_build_object('from', v_old_status, 'to', v_new_status));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_os_sync_partner_order ON public.ordens_servico;
CREATE TRIGGER trg_os_sync_partner_order
  AFTER UPDATE OF status ON public.ordens_servico
  FOR EACH ROW WHEN (NEW.origem = 'b2b')
  EXECUTE FUNCTION public.trg_os_sync_partner_order_fn();

-- 8. TRIGGER: sincroniza entregas
CREATE OR REPLACE FUNCTION public.trg_entrega_sync_partner_order_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner_order_id uuid;
  v_total int; v_delivered int;
BEGIN
  SELECT os.partner_order_id INTO v_partner_order_id
    FROM public.ordens_servico os WHERE os.id = COALESCE(NEW.ordem_servico_id, OLD.ordem_servico_id);
  IF v_partner_order_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE e.status = 'entregue')
    INTO v_total, v_delivered
    FROM public.entregas e
    JOIN public.ordens_servico os ON os.id = e.ordem_servico_id
   WHERE os.partner_order_id = v_partner_order_id;

  IF v_total > 0 AND v_delivered = v_total THEN
    UPDATE public.partner_orders SET status = 'entregue', updated_at = now()
      WHERE id = v_partner_order_id AND status <> 'entregue';
    UPDATE public.production_planning SET status = 'entregue', updated_at = now()
      WHERE partner_order_id = v_partner_order_id;
    INSERT INTO public.production_timeline_events (partner_order_id, event_type, meta)
    VALUES (v_partner_order_id, 'entrega_realizada', jsonb_build_object('total', v_total));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_entrega_sync_partner_order ON public.entregas;
CREATE TRIGGER trg_entrega_sync_partner_order
  AFTER INSERT OR UPDATE OF status ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION public.trg_entrega_sync_partner_order_fn();

-- 9. RPC: detalhe do planejamento para a tela
CREATE OR REPLACE FUNCTION public.get_production_planning_detail(p_planning_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor_comercial')
       OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'gestor')) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'planning', to_jsonb(pp.*),
    'partner', to_jsonb(pa.*),
    'order', to_jsonb(po.*),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', poi.id,
        'product_id', poi.product_id,
        'produto_nome', COALESCE(poi.produto_nome_snapshot, pr.nome),
        'codigo', COALESCE(poi.produto_codigo_snapshot, pr.codigo),
        'quantidade', poi.quantidade,
        'os_id', (SELECT l.ordem_servico_id FROM public.production_order_link l WHERE l.partner_order_item_id = poi.id),
        'os_numero', (SELECT os.numero_os FROM public.production_order_link l JOIN public.ordens_servico os ON os.id = l.ordem_servico_id WHERE l.partner_order_item_id = poi.id),
        'os_status', (SELECT os.status FROM public.production_order_link l JOIN public.ordens_servico os ON os.id = l.ordem_servico_id WHERE l.partner_order_item_id = poi.id)
      )) FROM public.partner_order_items poi
        LEFT JOIN public.produtos pr ON pr.id = poi.product_id
        WHERE poi.order_id = po.id
    ), '[]'::jsonb),
    'timeline', COALESCE((
      SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.event_at)
        FROM public.production_timeline_events t WHERE t.partner_order_id = po.id
    ), '[]'::jsonb),
    'has_orders', EXISTS (SELECT 1 FROM public.production_order_link WHERE planning_id = pp.id)
  ) INTO v_result
  FROM public.production_planning pp
  JOIN public.partner_accounts pa ON pa.id = pp.partner_id
  JOIN public.partner_orders po ON po.id = pp.partner_order_id
  WHERE pp.id = p_planning_id;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_production_planning_detail(uuid) TO authenticated;

-- 10. backfill: emite eventos de criação para pedidos existentes
INSERT INTO public.production_timeline_events (partner_order_id, event_type, event_at, actor_id, meta)
SELECT id, 'pedido_criado', created_at, created_by, '{}'::jsonb FROM public.partner_orders
ON CONFLICT DO NOTHING;

INSERT INTO public.production_timeline_events (partner_order_id, event_type, event_at, actor_id, meta)
SELECT id, 'pedido_aprovado', approved_at, approved_by, '{}'::jsonb FROM public.partner_orders WHERE approved_at IS NOT NULL
ON CONFLICT DO NOTHING;
