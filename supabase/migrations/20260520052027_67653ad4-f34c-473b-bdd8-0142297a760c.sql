-- Add unique constraint to entregas to prevent duplicate deliveries for the same OS
ALTER TABLE public.entregas ADD CONSTRAINT unique_ordem_servico_entrega UNIQUE (ordem_servico_id);
