ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS tipo_entrega text NOT NULL DEFAULT 'motorista'
  CHECK (tipo_entrega IN ('motorista', 'retirada'));