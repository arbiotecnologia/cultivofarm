ALTER TABLE public.partner_simulation_items
  ADD CONSTRAINT partner_simulation_items_quantidade_check
  CHECK (quantidade IS NOT NULL AND quantidade > 0);

ALTER TABLE public.partner_simulation_items
  ADD CONSTRAINT partner_simulation_items_subtotal_check
  CHECK (subtotal IS NOT NULL AND subtotal >= 0);

ALTER TABLE public.partner_simulations
  ADD CONSTRAINT partner_simulations_total_check
  CHECK (total_cheio IS NOT NULL AND total_cheio >= 0);