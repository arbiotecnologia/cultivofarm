ALTER TABLE public.partner_simulations
  ADD COLUMN IF NOT EXISTS valid_until date;

UPDATE public.partner_simulations
  SET valid_until = (created_at::date + INTERVAL '30 days')::date
  WHERE valid_until IS NULL;