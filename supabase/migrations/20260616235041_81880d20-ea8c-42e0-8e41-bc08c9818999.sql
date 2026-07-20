
-- ============ Helper: link auth user -> partner ============
CREATE TABLE IF NOT EXISTS public.partner_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_partner_users_partner ON public.partner_users(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_users_user ON public.partner_users(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_users TO authenticated;
GRANT ALL ON public.partner_users TO service_role;
ALTER TABLE public.partner_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_users_admin_select" ON public.partner_users
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial') OR user_id = auth.uid());
CREATE POLICY "partner_users_admin_insert" ON public.partner_users
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial'));
CREATE POLICY "partner_users_admin_update" ON public.partner_users
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial'))
  WITH CHECK (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial'));
CREATE POLICY "partner_users_admin_delete" ON public.partner_users
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'administrador') OR has_role(auth.uid(), 'gestor_comercial'));

-- Helper function: returns current user's partner_id (or null)
CREATE OR REPLACE FUNCTION public.get_user_partner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ============ Order status enum ============
DO $$ BEGIN
  CREATE TYPE public.partner_order_status AS ENUM
    ('pendente','confirmado','em_separacao','enviado','entregue','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ partner_orders ============
CREATE SEQUENCE IF NOT EXISTS public.partner_orders_numero_seq START 1000;

CREATE TABLE IF NOT EXISTS public.partner_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE DEFAULT ('PB-' || lpad(nextval('public.partner_orders_numero_seq')::text, 6, '0')),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE RESTRICT,
  status public.partner_order_status NOT NULL DEFAULT 'pendente',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  desconto_total numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_orders_partner ON public.partner_orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_orders_status ON public.partner_orders(status);
CREATE INDEX IF NOT EXISTS idx_partner_orders_created ON public.partner_orders(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_orders TO authenticated;
GRANT ALL ON public.partner_orders TO service_role;
GRANT USAGE ON SEQUENCE public.partner_orders_numero_seq TO authenticated;
ALTER TABLE public.partner_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_orders_select" ON public.partner_orders
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'administrador')
    OR has_role(auth.uid(), 'gestor_comercial')
    OR (has_role(auth.uid(), 'parceiro_b2b') AND partner_id = public.get_user_partner_id())
  );
CREATE POLICY "partner_orders_insert" ON public.partner_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'administrador')
    OR has_role(auth.uid(), 'gestor_comercial')
    OR (has_role(auth.uid(), 'parceiro_b2b') AND partner_id = public.get_user_partner_id())
  );
CREATE POLICY "partner_orders_update" ON public.partner_orders
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'administrador')
    OR has_role(auth.uid(), 'gestor_comercial')
    OR (has_role(auth.uid(), 'parceiro_b2b') AND partner_id = public.get_user_partner_id() AND status = 'pendente')
  )
  WITH CHECK (
    has_role(auth.uid(), 'administrador')
    OR has_role(auth.uid(), 'gestor_comercial')
    OR (has_role(auth.uid(), 'parceiro_b2b') AND partner_id = public.get_user_partner_id())
  );

CREATE TRIGGER trg_partner_orders_updated_at
  BEFORE UPDATE ON public.partner_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ partner_order_items ============
CREATE TABLE IF NOT EXISTS public.partner_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.partner_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.produtos(id),
  quantidade numeric(12,2) NOT NULL CHECK (quantidade > 0),
  preco_unitario numeric(12,2) NOT NULL DEFAULT 0,
  desconto_percentual numeric(5,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_order_items_order ON public.partner_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_partner_order_items_product ON public.partner_order_items(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_order_items TO authenticated;
GRANT ALL ON public.partner_order_items TO service_role;
ALTER TABLE public.partner_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_order_items_select" ON public.partner_order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.partner_orders o
    WHERE o.id = order_id AND (
      has_role(auth.uid(), 'administrador')
      OR has_role(auth.uid(), 'gestor_comercial')
      OR (has_role(auth.uid(), 'parceiro_b2b') AND o.partner_id = public.get_user_partner_id())
    )
  ));
CREATE POLICY "partner_order_items_insert" ON public.partner_order_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.partner_orders o
    WHERE o.id = order_id AND (
      has_role(auth.uid(), 'administrador')
      OR has_role(auth.uid(), 'gestor_comercial')
      OR (has_role(auth.uid(), 'parceiro_b2b') AND o.partner_id = public.get_user_partner_id())
    )
  ));
CREATE POLICY "partner_order_items_update" ON public.partner_order_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.partner_orders o
    WHERE o.id = order_id AND (
      has_role(auth.uid(), 'administrador')
      OR has_role(auth.uid(), 'gestor_comercial')
      OR (has_role(auth.uid(), 'parceiro_b2b') AND o.partner_id = public.get_user_partner_id() AND o.status = 'pendente')
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.partner_orders o
    WHERE o.id = order_id
  ));
CREATE POLICY "partner_order_items_delete" ON public.partner_order_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.partner_orders o
    WHERE o.id = order_id AND (
      has_role(auth.uid(), 'administrador')
      OR has_role(auth.uid(), 'gestor_comercial')
      OR (has_role(auth.uid(), 'parceiro_b2b') AND o.partner_id = public.get_user_partner_id() AND o.status = 'pendente')
    )
  ));

-- Allow parceiro_b2b to read their own partner_accounts row
CREATE POLICY "partner_accounts_self_select" ON public.partner_accounts
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'parceiro_b2b') AND id = public.get_user_partner_id());

-- Allow parceiro_b2b to read their own pricing rows
CREATE POLICY "ppp_self_select" ON public.partner_product_prices
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'parceiro_b2b') AND partner_id = public.get_user_partner_id());
