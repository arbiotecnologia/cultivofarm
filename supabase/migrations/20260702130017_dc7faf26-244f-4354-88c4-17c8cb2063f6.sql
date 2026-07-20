
ALTER TABLE public.partner_simulations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'rascunho',
  ADD COLUMN IF NOT EXISTS cultura text,
  ADD COLUMN IF NOT EXISTS area_total_ha numeric,
  ADD COLUMN IF NOT EXISTS objetivo_tecnico text,
  ADD COLUMN IF NOT EXISTS converted_order_id uuid REFERENCES public.partner_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_by uuid,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_simulations_status_check'
  ) THEN
    ALTER TABLE public.partner_simulations
      ADD CONSTRAINT partner_simulations_status_check
      CHECK (status IN ('rascunho','enviada_gestor','convertida_pedido','arquivada'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_partner_simulations_status
  ON public.partner_simulations (partner_id, status);
