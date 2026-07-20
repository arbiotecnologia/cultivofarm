
-- 1) Real unique constraint on partner_product_prices
DROP INDEX IF EXISTS public.idx_ppp_partner_product_active;
DELETE FROM public.partner_product_prices a
  USING public.partner_product_prices b
  WHERE a.ctid < b.ctid AND a.partner_id = b.partner_id AND a.product_id = b.product_id;
ALTER TABLE public.partner_product_prices
  ADD CONSTRAINT partner_product_prices_partner_product_uniq UNIQUE (partner_id, product_id);

-- 2) Snapshot columns on partner_order_items
ALTER TABLE public.partner_order_items
  ADD COLUMN IF NOT EXISTS produto_nome_snapshot text,
  ADD COLUMN IF NOT EXISTS produto_codigo_snapshot text,
  ADD COLUMN IF NOT EXISTS preco_tabela_snapshot numeric(12,2),
  ADD COLUMN IF NOT EXISTS desconto_percentual_snapshot numeric(5,2),
  ADD COLUMN IF NOT EXISTS preco_unitario_final_snapshot numeric(12,2);

-- 3) Audit log table for partner orders
CREATE TABLE IF NOT EXISTS public.partner_order_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  partner_id uuid,
  usuario_id uuid,
  acao text NOT NULL,
  dados_anteriores jsonb,
  dados_novos jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_order_audit_logs TO authenticated;
GRANT ALL ON public.partner_order_audit_logs TO service_role;
CREATE INDEX IF NOT EXISTS idx_poal_order ON public.partner_order_audit_logs(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poal_partner ON public.partner_order_audit_logs(partner_id, created_at DESC);
ALTER TABLE public.partner_order_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poal_select" ON public.partner_order_audit_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial'));

-- 4) Tighten orders RLS: parceiro_b2b cannot UPDATE/DELETE
DROP POLICY IF EXISTS "partner_orders_update" ON public.partner_orders;
CREATE POLICY "partner_orders_update" ON public.partner_orders
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial'))
  WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial'));

DROP POLICY IF EXISTS "partner_order_items_update" ON public.partner_order_items;
CREATE POLICY "partner_order_items_update" ON public.partner_order_items
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial'))
  WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial'));

DROP POLICY IF EXISTS "partner_order_items_delete" ON public.partner_order_items;
CREATE POLICY "partner_order_items_delete" ON public.partner_order_items
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial'));

-- 5) Trigger to audit partner_orders changes
CREATE OR REPLACE FUNCTION public.partner_orders_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_acao text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'order_created';
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_acao := CASE WHEN NEW.status = 'cancelado' THEN 'order_cancelled' ELSE 'status_changed' END;
    ELSE
      v_acao := 'order_updated';
    END IF;
  ELSE
    RETURN NULL;
  END IF;
  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (COALESCE(NEW.id, OLD.id), COALESCE(NEW.partner_id, OLD.partner_id), auth.uid(), v_acao, v_old, v_new);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_orders_audit ON public.partner_orders;
CREATE TRIGGER trg_partner_orders_audit
  AFTER INSERT OR UPDATE ON public.partner_orders
  FOR EACH ROW EXECUTE FUNCTION public.partner_orders_audit_trigger();

-- 6) Secure RPC to create an order
CREATE OR REPLACE FUNCTION public.create_partner_order_secure(
  p_partner_id uuid,
  p_observacoes text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_user_partner uuid;
  v_order_id uuid;
  v_numero text;
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_desconto numeric(12,2) := 0;
  v_partner_desconto numeric(5,2);
  v_item jsonb;
  v_pid uuid;
  v_qty numeric(12,2);
  v_prod record;
  v_price record;
  v_preco_tabela numeric(12,2);
  v_desc numeric(5,2);
  v_preco_final numeric(12,2);
  v_line_subtotal numeric(12,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  v_is_admin := has_role(v_uid, 'administrador') OR has_role(v_uid, 'gestor_comercial');
  v_user_partner := public.get_user_partner_id();

  IF NOT v_is_admin THEN
    IF NOT has_role(v_uid, 'parceiro_b2b') OR v_user_partner IS NULL OR v_user_partner <> p_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  SELECT desconto_padrao INTO v_partner_desconto
    FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF v_partner_desconto IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  INSERT INTO public.partner_orders(partner_id, status, subtotal, desconto_total, total, observacoes, created_by)
  VALUES (p_partner_id, 'pendente', 0, 0, 0, NULLIF(p_observacoes,''), v_uid)
  RETURNING id, numero INTO v_order_id, v_numero;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantidade')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty'; END IF;

    SELECT id, nome, codigo, valor_ha_brl, ativo INTO v_prod
      FROM public.produtos WHERE id = v_pid;
    IF NOT FOUND OR v_prod.ativo = false THEN RAISE EXCEPTION 'product_unavailable'; END IF;

    SELECT preco_tabela, desconto_percentual, preco_final INTO v_price
      FROM public.partner_product_prices
      WHERE partner_id = p_partner_id AND product_id = v_pid AND ativo = true;

    IF FOUND THEN
      v_preco_tabela := v_price.preco_tabela;
      v_desc := v_price.desconto_percentual;
      v_preco_final := COALESCE(v_price.preco_final, ROUND(v_preco_tabela * (1 - v_desc/100.0), 2));
    ELSE
      v_preco_tabela := COALESCE(v_prod.valor_ha_brl, 0);
      v_desc := COALESCE(v_partner_desconto, 0);
      v_preco_final := ROUND(v_preco_tabela * (1 - v_desc/100.0), 2);
    END IF;

    v_line_subtotal := ROUND(v_preco_final * v_qty, 2);
    v_subtotal := v_subtotal + ROUND(v_preco_tabela * v_qty, 2);
    v_total := v_total + v_line_subtotal;

    INSERT INTO public.partner_order_items(
      order_id, product_id, quantidade, preco_unitario, desconto_percentual, subtotal,
      produto_nome_snapshot, produto_codigo_snapshot,
      preco_tabela_snapshot, desconto_percentual_snapshot, preco_unitario_final_snapshot
    ) VALUES (
      v_order_id, v_pid, v_qty, v_preco_final, v_desc, v_line_subtotal,
      v_prod.nome, v_prod.codigo,
      v_preco_tabela, v_desc, v_preco_final
    );
  END LOOP;

  v_desconto := ROUND(v_subtotal - v_total, 2);
  UPDATE public.partner_orders
    SET subtotal = v_subtotal, desconto_total = v_desconto, total = v_total
    WHERE id = v_order_id;

  RETURN jsonb_build_object('id', v_order_id, 'numero', v_numero, 'subtotal', v_subtotal, 'desconto_total', v_desconto, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_partner_order_secure(uuid, text, jsonb) TO authenticated;

-- 7) RPC to bulk-apply default discount to all active products for a partner
CREATE OR REPLACE FUNCTION public.partner_apply_default_discount(p_partner_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_desc numeric(5,2);
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid, 'administrador') OR has_role(v_uid, 'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT desconto_padrao INTO v_desc FROM public.partner_accounts WHERE id = p_partner_id;
  IF v_desc IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  INSERT INTO public.partner_product_prices(partner_id, product_id, preco_tabela, desconto_percentual, preco_final, ativo)
  SELECT p_partner_id, p.id,
         COALESCE(p.valor_ha_brl, 0),
         v_desc,
         ROUND(COALESCE(p.valor_ha_brl, 0) * (1 - v_desc/100.0), 2),
         true
  FROM public.produtos p
  WHERE p.ativo = true
  ON CONFLICT (partner_id, product_id) DO UPDATE
    SET preco_tabela = EXCLUDED.preco_tabela,
        desconto_percentual = EXCLUDED.desconto_percentual,
        preco_final = EXCLUDED.preco_final,
        ativo = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_apply_default_discount(uuid) TO authenticated;
