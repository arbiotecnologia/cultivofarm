ALTER TABLE public.partner_orders
  ADD COLUMN IF NOT EXISTS cultura text,
  ADD COLUMN IF NOT EXISTS area_total_ha numeric,
  ADD COLUMN IF NOT EXISTS origin_simulation_id uuid REFERENCES public.partner_simulations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partner_orders_origin_simulation
  ON public.partner_orders(origin_simulation_id);

CREATE OR REPLACE FUNCTION public.convert_partner_simulation_to_order_secure(
  p_simulation_id uuid,
  p_observacoes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_partner_id uuid;
  v_sim record;
  v_order_id uuid;
  v_item record;
  v_price numeric;
  v_is_manager boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id
      AND role IN ('parceiro_b2b','administrador','gestor_comercial')
  ) INTO v_is_manager;

  IF NOT v_is_manager THEN
    RAISE EXCEPTION 'Apenas gestores podem converter simulações em pedidos';
  END IF;

  SELECT partner_id INTO v_partner_id
  FROM public.partner_users
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não vinculado a nenhum parceiro';
  END IF;

  SELECT * INTO v_sim
  FROM public.partner_simulations
  WHERE id = p_simulation_id AND partner_id = v_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Simulação não encontrada para este parceiro';
  END IF;

  IF v_sim.status NOT IN ('rascunho','enviada_gestor') THEN
    RAISE EXCEPTION 'Simulação em status % não pode ser convertida', v_sim.status;
  END IF;

  INSERT INTO public.partner_orders (
    partner_id, cliente_id, created_by, status,
    observacoes, cultura, area_total_ha, origin_simulation_id
  ) VALUES (
    v_partner_id, v_sim.cliente_id, v_user_id, 'rascunho',
    COALESCE(p_observacoes, v_sim.objetivo_tecnico),
    v_sim.cultura, v_sim.area_total_ha, p_simulation_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT * FROM public.partner_simulation_items WHERE simulation_id = p_simulation_id
  LOOP
    SELECT preco_unitario_brl INTO v_price
    FROM public.partner_product_prices
    WHERE partner_id = v_partner_id AND produto_id = v_item.produto_id AND ativo = true
    ORDER BY updated_at DESC LIMIT 1;

    INSERT INTO public.partner_order_items (
      order_id, produto_id, quantidade, preco_unitario_brl, observacoes
    ) VALUES (
      v_order_id, v_item.produto_id, v_item.quantidade,
      COALESCE(v_price, v_item.preco_unitario_brl, 0), v_item.observacoes
    );
  END LOOP;

  UPDATE public.partner_simulations
  SET status = 'convertida_pedido',
      converted_order_id = v_order_id,
      converted_by = v_user_id,
      converted_at = now(),
      updated_at = now()
  WHERE id = p_simulation_id;

  INSERT INTO public.partner_order_audit_logs (order_id, user_id, action, details)
  VALUES (v_order_id, v_user_id, 'converted_from_simulation',
          jsonb_build_object('simulation_id', p_simulation_id));

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_partner_simulation_to_order_secure(uuid, text) TO authenticated;