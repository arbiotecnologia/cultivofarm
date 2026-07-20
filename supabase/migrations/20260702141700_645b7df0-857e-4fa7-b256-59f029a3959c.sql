
ALTER TABLE public.partner_simulations
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_nome_snapshot text,
  ADD COLUMN IF NOT EXISTS propriedade_nome_snapshot text,
  ADD COLUMN IF NOT EXISTS cliente_cidade_snapshot text,
  ADD COLUMN IF NOT EXISTS cliente_uf_snapshot text;

CREATE INDEX IF NOT EXISTS idx_partner_sim_cliente ON public.partner_simulations(cliente_id);
CREATE INDEX IF NOT EXISTS idx_partner_sim_partner_cliente ON public.partner_simulations(partner_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_partner_sim_creator_cliente ON public.partner_simulations(created_by, cliente_id);

ALTER TABLE public.partner_orders
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partner_orders_cliente ON public.partner_orders(cliente_id);
