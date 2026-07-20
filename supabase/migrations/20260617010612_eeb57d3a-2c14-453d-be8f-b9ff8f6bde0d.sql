
-- 1. ORDENS_SERVICO: refine RLS
DROP POLICY IF EXISTS "Authenticated users can read os" ON public.ordens_servico;
DROP POLICY IF EXISTS "Authenticated users can insert os" ON public.ordens_servico;
DROP POLICY IF EXISTS "Authenticated users can update os" ON public.ordens_servico;
DROP POLICY IF EXISTS "Producao update ordens_servico" ON public.ordens_servico;
DROP POLICY IF EXISTS "GestorComercial read B2B ordens_servico" ON public.ordens_servico;

CREATE POLICY "Producao update ordens_servico"
  ON public.ordens_servico FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'producao'))
  WITH CHECK (public.has_role(auth.uid(),'producao'));

CREATE POLICY "GestorComercial read B2B ordens_servico"
  ON public.ordens_servico FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'gestor_comercial')
    AND origem = 'b2b'
    AND partner_order_id IS NOT NULL
  );

-- 2. PRODUCTION_TIMELINE_EVENTS: restrict INSERT
DROP POLICY IF EXISTS ptl_insert_service ON public.production_timeline_events;
CREATE POLICY ptl_insert_staff ON public.production_timeline_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'producao')
  );

-- 3. PARTNER_ORDER_ITEMS: add unidade_medida
ALTER TABLE public.partner_order_items
  ADD COLUMN IF NOT EXISTS unidade_medida text NOT NULL DEFAULT 'unidade';

ALTER TABLE public.partner_order_items
  DROP CONSTRAINT IF EXISTS partner_order_items_unidade_check;
ALTER TABLE public.partner_order_items
  ADD CONSTRAINT partner_order_items_unidade_check
  CHECK (unidade_medida IN ('ml','litro','hectare','dose','unidade'));

-- 4. RPC: generate OP with proper volume conversion
CREATE OR REPLACE FUNCTION public.generate_production_orders_from_partner(p_partner_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planning_id uuid;
  v_item RECORD;
  v_os_id uuid;
  v_numero text;
  v_count int := 0;
  v_uid uuid := auth.uid();
  v_volume_ml numeric;
  v_area numeric;
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
    v_volume_ml := NULL;
    v_area := NULL;
    CASE COALESCE(v_item.unidade_medida,'unidade')
      WHEN 'ml'       THEN v_volume_ml := v_item.quantidade;
      WHEN 'litro'    THEN v_volume_ml := v_item.quantidade * 1000;
      WHEN 'hectare'  THEN v_area := v_item.quantidade;
      ELSE NULL;
    END CASE;

    v_numero := 'OS-B2B-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.ordens_servico (
      cliente_id, fazenda_id, talhao_id, produto_id, volume_total_ml, area_hectares,
      prioridade, status, tipo_item, numero_os,
      partner_order_id, partner_order_item_id, origem
    ) VALUES (
      NULL, NULL, NULL, v_item.product_id, v_volume_ml, v_area,
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

    INSERT INTO public.partner_order_audit_logs (partner_order_id, action, actor_id, meta)
    VALUES (p_partner_order_id, 'op_gerada', v_uid, jsonb_build_object('os_count', v_count));
  END IF;

  RETURN jsonb_build_object('ok', true, 'os_created', v_count, 'planning_id', v_planning_id);
END
$$;

-- 5. RPC: planning detail with unidade + volume
CREATE OR REPLACE FUNCTION public.get_production_planning_detail(p_planning_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        'unidade_medida', COALESCE(poi.unidade_medida,'unidade'),
        'volume_total_ml', CASE COALESCE(poi.unidade_medida,'unidade')
                             WHEN 'ml' THEN poi.quantidade
                             WHEN 'litro' THEN poi.quantidade * 1000
                             ELSE NULL END,
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
END
$$;
